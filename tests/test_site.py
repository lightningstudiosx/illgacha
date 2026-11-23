"""Browser tests for ILL Gacha in demo mode (Python Playwright).   python -I tests/test_site.py
Starts a local static server, runs Chromium headless, saves screenshots to shots/ and finally replays every
write the site made through the real database rules (tests/rules_db.py) to prove the rules would accept them.
YouTube thumbnails and Google Fonts are fetched for real when online; if offline they are faked, so no errors.
"""
import functools, hashlib, json, re, sys, tempfile, threading, unittest
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(ROOT / 'tools'))
from playwright.sync_api import sync_playwright, expect
from rules_db import RulesDB
import build_rules

SHOTS = ROOT / 'shots'
TEST_CODE = 'demo-test-3'          # the plaintext of the test-only hash in js/config.js (demo mode only)
T0 = '2026-11-22T12:00:00Z'
PNG = bytes.fromhex('89504e470d0a1a0a0000000d4948445200000001000000010806000000'
                    '1f15c4890000000d49444154789c6360f8cfc0f01f0005fe02fea7d6a4c40000000049454e44ae426082')
WRITES = []


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()


def external(route):
    """Real thumbnails/fonts when online, harmless stand-ins when offline. Anything else external is blocked."""
    url = route.request.url
    if 'i.ytimg.com' in url or 'fonts.googleapis.com' in url or 'fonts.gstatic.com' in url:
        try:
            resp = route.fetch(timeout=5000)
            if resp.ok: return route.fulfill(response=resp)
        except Exception: pass
        if 'ytimg' in url: return route.fulfill(status=200, content_type='image/png', body=PNG)
        return route.fulfill(status=200, content_type='text/css', body='')
    return route.abort()


class Site(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = 'http://127.0.0.1:%d/' % cls.srv.server_address[1]
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch()
        SHOTS.mkdir(exist_ok=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.srv.shutdown(); cls.srv.server_close()

    def setUp(self):
        self.errors = []

    def open(self, hashpath='', phone=False, seeded=False):
        ctx = self.browser.new_context(viewport={'width': 390, 'height': 844} if phone else {'width': 1440, 'height': 900},
                                       device_scale_factor=2 if phone else 1, is_mobile=phone, has_touch=phone)
        ctx.route(re.compile(r'^https?://(?!127\.0\.0\.1)'), external)
        if seeded:   # a tiny repeating "random" sequence -> lots of duplicates, so crafting can be tested
            ctx.add_init_script("""(() => { let i = 0; const seq = [0.93, 0.12, 0.5, 0.97, 0.31, 0.77, 0.05];
              crypto.getRandomValues = (a) => { for (let k = 0; k < a.length; k++) a[k] = Math.floor(seq[i++ % seq.length] * 4294967295); return a; }; })();""")
        page = ctx.new_page()
        page.set_default_timeout(60000)
        page.clock.install(time=T0)
        page.on('console', lambda m: m.type == 'error' and self.errors.append(m.text))
        page.on('pageerror', lambda e: self.errors.append(str(e)))
        page.goto(self.base + '?demo#/' + hashpath)
        page.wait_for_selector('#view section')
        self.addCleanup(lambda: self.collect(page, ctx))
        return page

    def collect(self, page, ctx):
        try: WRITES.extend(page.evaluate('window.__illWrites || []'))
        finally: ctx.close()
        self.assertEqual(self.errors, [], 'console errors')

    def doc(self, page):
        return page.evaluate("JSON.parse(localStorage.getItem('illgacha.demo.v1')).illgacha.users.demoPlayer01")

    def open_pack_ui(self, page, shot=None):
        page.click('#openBtn')
        page.wait_for_selector('.pack-overlay[data-phase=pack]')
        page.click('.po-stage .pack')
        page.wait_for_selector('.pack-overlay[data-phase=cards]')
        page.click('.po-stage'); page.wait_for_timeout(250)
        page.click('.po-stage'); page.wait_for_timeout(900)
        if shot: page.screenshot(path=str(SHOTS / shot))
        for _ in range(3):
            page.click('.po-stage'); page.wait_for_timeout(120)
        page.wait_for_selector('.pack-overlay[data-phase=done]')
        self.assertEqual(page.locator('.po-row .card').count(), 5)
        page.click('#doneBtn')
        expect(page.locator('.pack-overlay')).to_have_count(0)

    def test_1_boot_and_open_pack(self):
        page = self.open()
        expect(page.locator('.demo-banner')).to_be_visible()
        expect(page.locator('#packCount b')).to_have_text('10')
        page.wait_for_timeout(600)
        page.screenshot(path=str(SHOTS / 'home-new.png'))
        self.open_pack_ui(page, 'pack-opening.png')
        d = self.doc(page)
        self.assertEqual(d['stats']['opened'], 1)
        self.assertEqual(sum(c['n'] for c in d['cards'].values()), 5)
        expect(page.locator('#packCount b')).to_have_text('9')
        expect(page.locator('#statOpened')).to_have_text('1')
        for _ in range(3): self.open_pack_ui(page)
        expect(page.locator('#packCount b')).to_have_text('6')
        page.wait_for_timeout(800)
        page.screenshot(path=str(SHOTS / 'home.png'))
        page.click('.recent .card'); expect(page.locator('.modal .card-info')).to_be_visible()
        expect(page.locator('.modal a', has_text='View on the ILL')).to_have_attribute('href', re.compile(r'^https://impossiblelevels\.com/level/\d+$'))
        page.keyboard.press('Escape'); expect(page.locator('.modal')).to_have_count(0)

    def test_2_timer_refill(self):
        page = self.open()
        page.evaluate('async () => { for (let i = 0; i < 10; i++) await ILL.game.openPack(); ILL.render(); }')
        expect(page.locator('#packCount b')).to_have_text('0')
        expect(page.locator('#openBtn')).to_be_disabled()
        expect(page.locator('#ringTxt b')).to_have_text(re.compile(r'^(10:0\d|9:5\d)$'))
        page.clock.fast_forward('09:00'); expect(page.locator('#packCount b')).to_have_text('0')
        page.clock.fast_forward('01:05'); expect(page.locator('#packCount b')).to_have_text('1')
        expect(page.locator('#openBtn')).to_be_enabled()
        page.clock.fast_forward('25:00'); expect(page.locator('#packCount b')).to_have_text('3')
        page.clock.fast_forward('05:00:00'); expect(page.locator('#packCount b')).to_have_text('10')
        expect(page.locator('#ringTxt b')).to_have_text('FULL')
        page.evaluate('() => ILL.game.openPack()')
        page.clock.fast_forward('10:05'); expect(page.locator('#packCount b')).to_have_text('10')

    def test_3_pages_and_crafting(self):
        page = self.open(seeded=True)
        for _ in range(4):
            page.evaluate('async () => { for (let i = 0; i < 10; i++) await ILL.game.openPack(); }')
            page.clock.fast_forward('02:00:00')
        page.evaluate('() => ILL.render()')
        d = self.doc(page); owned = len(d['cards'])
        page.goto(self.base + '?demo#/collection'); page.wait_for_selector('#collectionGrid .card')
        expect(page.locator('#collectionGrid .card')).to_have_count(min(48, owned))
        expect(page.locator('#collectionGrid .count').first).to_be_visible()
        page.wait_for_timeout(700); page.screenshot(path=str(SHOTS / 'collection.png'))
        page.goto(self.base + '?demo#/index'); page.wait_for_selector('#indexGrid .card')
        expect(page.locator('#indexGrid .card')).to_have_count(48)
        expect(page.locator('.pager .pg')).to_have_text(re.compile(r'^1 / \d+$'))
        page.fill('input[type=search]', 'Tax Evasion'); expect(page.locator('#indexGrid .card').first).to_contain_text('Tax Evasion')
        page.fill('input[type=search]', '')
        page.click('.pager button:has-text("Next")'); expect(page.locator('.pager .pg')).to_have_text(re.compile(r'^2 / '))
        page.click('.pager button:has-text("Prev")')
        page.mouse.move(5, 5); page.wait_for_timeout(700); page.evaluate('window.scrollTo(0, 0)'); page.wait_for_timeout(300)
        page.screenshot(path=str(SHOTS / 'index.png'))
        page.goto(self.base + '?demo#/craft'); page.wait_for_selector('.craft-panel')
        before = self.doc(page)['dust']
        page.click('#dustAll'); page.click('#dustYes')
        page.wait_for_function('() => !document.querySelector(".modal")', polling=100)
        d = self.doc(page)
        self.assertGreater(d['dust'], before)
        self.assertTrue(all(c['n'] == 1 for c in d['cards'].values()))
        self.assertGreaterEqual(d['dust'], 40, 'seeded pulls should give enough dust to craft a common')
        n_before = len(d['cards'])
        page.select_option('.craft-panel select', 'common')
        page.locator('.craft-item button.btn:not([disabled])').first.click()
        page.wait_for_function('n => Object.keys(JSON.parse(localStorage.getItem("illgacha.demo.v1")).illgacha.users.demoPlayer01.cards).length > n', arg=n_before, polling=100)
        self.assertEqual(self.doc(page)['stats']['crafted'], 1)
        page.select_option('.craft-panel select', 'all')
        page.wait_for_timeout(700); page.screenshot(path=str(SHOTS / 'crafting.png'))
        page.goto(self.base + '?demo#/leaderboard'); page.wait_for_selector('.board .row.me')
        self.assertGreaterEqual(page.locator('.board .row').count(), 10)
        page.click('.tab:has-text("Rarest pull")'); page.wait_for_selector('.board .row')
        page.click('.tab:has-text("Completion")'); page.wait_for_selector('.board .row.me')
        page.screenshot(path=str(SHOTS / 'leaderboard.png'))
        page.goto(self.base + '?demo#/profile'); page.wait_for_selector('#nameInput')
        page.fill('#nameInput', 'Wave Rider'); page.click('.icon-opt >> nth=5'); page.click('#saveProfile')
        expect(page.locator('#userChip')).to_contain_text('Wave Rider')
        self.assertEqual(self.doc(page)['profile'], {'name': 'Wave Rider', 'icon': 5})
        page.fill('#nameInput', '<script>'); page.click('#saveProfile')
        expect(page.locator('#toast')).to_contain_text('Names are')
        page.screenshot(path=str(SHOTS / 'profile.png'))
        page.goto(self.base + '?demo#/about'); expect(page.locator('.about a[href="https://impossiblelevels.com"]')).to_be_visible()

    def test_4_codes(self):
        page = self.open()
        page.fill('#codeInput', 'NOT-A-REAL-CODE'); page.click('.code-row button')
        expect(page.locator('#codeMsg')).to_have_text('That code is not valid.')
        page.fill('#codeInput', TEST_CODE); page.click('.code-row button')
        expect(page.locator('#codeMsg')).to_have_text('+3 bonus packs!')
        expect(page.locator('#packCount b')).to_have_text('13')
        page.fill('#codeInput', ' Demo-Test-3 '); page.click('.code-row button')
        expect(page.locator('#codeMsg')).to_have_text('You already used that code.')
        page.evaluate('async () => { for (let i = 0; i < 12; i++) await ILL.game.openPack(); }')
        expect(page.locator('#packCount b')).to_have_text('1')
        self.assertEqual(self.doc(page)['packs']['extra'], 1)

    def test_5_phone(self):
        page = self.open(phone=True)
        expect(page.locator('nav.tabs')).to_be_visible()
        expect(page.locator('nav.main-nav')).to_be_hidden()
        page.wait_for_timeout(600)
        self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'), 390)
        page.screenshot(path=str(SHOTS / 'phone-home.png'))
        page.screenshot(path=str(SHOTS / 'phone-home-full.png'), full_page=True)
        page.click('#openBtn'); page.click('.po-stage .pack'); page.wait_for_selector('.pack-overlay[data-phase=cards]')
        for _ in range(3): page.click('.po-stage'); page.wait_for_timeout(200)
        page.wait_for_timeout(800); page.screenshot(path=str(SHOTS / 'phone-pack.png'))
        page.click('button:has-text("Reveal all")'); page.wait_for_selector('.pack-overlay[data-phase=done]'); page.click('#doneBtn')
        for route in ['collection', 'index', 'craft', 'leaderboard', 'profile', 'about']:
            page.click('nav.tabs a[data-route="%s"]' % route) if route != 'about' else page.goto(self.base + '?demo#/about')
            page.wait_for_selector('#view section')
            page.wait_for_timeout(250)
            self.assertLessEqual(page.evaluate('document.documentElement.scrollWidth'), 390, 'sideways scroll on ' + route)
            if route in ('index', 'craft'): page.screenshot(path=str(SHOTS / ('phone-%s.png' % route)))

    def test_6_firebase_mode_smoke(self):
        """With a filled-in (FAKE) config the site loads the pinned Firebase SDK and shows Google sign-in.
        The fake config points at a made-up project and every Firebase/Google network call is blocked,
        so this never touches the real database or signs in to anything."""
        cfg = (ROOT / 'js/config.js').read_text(encoding='utf-8')
        fake = re.sub(r"'PASTE_[A-Z_]+_HERE'", "'fake-for-tests'", cfg).replace(
            'https://kaifun-wall-default-rtdb.firebaseio.com', 'https://illgacha-fake-test.firebaseio.com')
        self.assertNotIn('kaifun-wall-default-rtdb', fake)
        ctx = self.browser.new_context(viewport={'width': 1440, 'height': 900})
        self.addCleanup(ctx.close)
        def route(r):
            url = r.request.url
            if url.endswith('/js/config.js'): return r.fulfill(status=200, content_type='text/javascript', body=fake)
            if '127.0.0.1' in url: return r.continue_()
            if 'www.gstatic.com/firebasejs/' in url and url.endswith('-compat.js'): return r.continue_()
            return r.abort()
        ctx.route('**/*', route)
        page = ctx.new_page(); page.set_default_timeout(60000)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(self.base + '#/')
        page.wait_for_selector('#view section')
        try:
            page.wait_for_function('() => window.firebase && window.firebase.apps && window.firebase.apps.length === 1', timeout=30000, polling=200)
        except Exception:
            self.skipTest('could not download the Firebase SDK (offline?)')
        expect(page.locator('#openBtn')).to_have_text('Sign in with Google')
        expect(page.locator('.demo-banner')).to_have_count(0)
        self.assertEqual(page.evaluate('ILL.store.mode'), 'firebase')
        self.assertEqual(page.evaluate('firebase.SDK_VERSION'), json.loads('"%s"' % re.search(r"firebaseSdk: '([\d.]+)'", cfg).group(1)))
        page.goto(self.base + '#/index'); page.wait_for_selector('#indexGrid .card.locked')
        self.assertEqual(errs, [])

    def test_9_rules_accept_every_write(self):
        """Every multi-path write the site made in the tests above must pass the real rules."""
        self.assertGreater(len(WRITES), 40)
        codes = [{'hash': hashlib.sha256(('illgacha:' + TEST_CODE.upper()).encode()).hexdigest(), 'packs': 3}]
        f = Path(tempfile.mkdtemp()) / 'rules.json'; f.write_text(json.dumps(build_rules.merged(codes)))
        uids = sorted(set(w['uid'] for w in WRITES))
        self.assertEqual(uids, ['demoPlayer01'])
        # each browser context started a fresh demo player, so replay each run separately
        runs, cur = [], []
        for w in WRITES:
            if cur and any(k.endswith('/profile') for k in w['patch']): runs.append(cur); cur = []
            cur.append(w)
        runs.append(cur)
        for run in runs:
            db = RulesDB(f)
            for w in run:
                ok, why = db.update('illgacha', w['patch'], {'uid': w['uid']}, w['now'])
                self.assertTrue(ok, '%s refused: %s' % (sorted(w['patch'])[:4], why))


if __name__ == '__main__':
    unittest.main(verbosity=2)
