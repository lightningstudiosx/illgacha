"""Checks the real firebase/*.rules.json with the rules evaluator.   python -I tests/test_rules.py"""
import copy, hashlib, json, sys, tempfile, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(ROOT / 'tools'))
from rules_db import RulesDB, parse_all
import build_rules

P, TS = 600000, {'.sv': 'timestamp'}
UID, BOB = 'demoUser01', 'bobUser999'
A = {'uid': UID}
T0 = 1_800_000_000_000
TEST_CODE_HASH = hashlib.sha256(b'illgacha:TESTONLY-CODE').hexdigest()


def signup(uid=UID, name='Cube Kid', icon=3):
    return {'users/%s/profile' % uid: {'name': name, 'icon': icon},
            'users/%s/packs' % uid: {'stored': 10, 'lastClaim': TS, 'extra': 0, 'granted': 0},
            'users/%s/stats' % uid: {'opened': 0, 'holos': 0, 'dusted': 0, 'crafted': 0},
            'users/%s/dust' % uid: 0}


class Base(unittest.TestCase):
    codes = []
    def setUp(self):
        rules = build_rules.merged(self.codes)
        f = Path(tempfile.mkdtemp()) / 'r.json'; f.write_text(json.dumps(rules))
        self.db = RulesDB(f)
        self.assertTrue(self.db.update('illgacha', signup(), A, T0)[0])
    def u(self, *p): return self.db.root['illgacha']['users'][UID] if not p else self.db.root['illgacha']['users'][UID][p[0]]
    def ok(self, patch, now, auth=A): r = self.db.update('illgacha', patch, auth, now); self.assertTrue(r[0], r[1]); return r
    def no(self, patch, now, auth=A): r = self.db.update('illgacha', patch, auth, now); self.assertFalse(r[0], 'should be refused'); return r
    def open_pack(self, now, stored, last, cards, opened=None, holos=0):
        """What the site writes when opening a pack: new packs state + opened+1 + the card counts."""
        st = self.u('stats'); opened = st['opened'] + 1 if opened is None else opened
        p = {'users/%s/packs/stored' % UID: stored, 'users/%s/packs/lastClaim' % UID: last,
             'users/%s/stats/opened' % UID: opened, 'users/%s/stats/holos' % UID: st['holos'] + holos}
        for cid, (n, h) in cards.items():
            p['users/%s/cards/%s' % (UID, cid)] = {'n': n, 'holo': h, 't': TS}
        return p


class ExistingRules(unittest.TestCase):
    def test_merged_keeps_existing_rules_exactly(self):
        merged = json.loads((ROOT / 'firebase/database.rules.json').read_text())
        existing = json.loads((ROOT / 'firebase/existing.rules.json').read_text())
        orig = Path(r'C:\Users\aliev\kaifun-copperline\newgames\buildaroblox\firebase_rules.json')
        if orig.exists(): self.assertEqual(existing, json.loads(orig.read_text()))
        rest = {k: v for k, v in merged['rules'].items() if k != 'illgacha'}
        self.assertEqual(rest, existing['rules'])
        self.assertEqual(list(merged['rules'])[:-1], list(existing['rules']))
        self.assertEqual(parse_all(merged['rules']), parse_all(existing['rules']) + parse_all({'illgacha': merged['rules']['illgacha']}))
    def test_other_game_still_works(self):
        db = RulesDB(ROOT / 'firebase/database.rules.json')
        self.assertTrue(db.set('wall/3_4', {'c': '#ff0000', 't': TS, 'n': 'Kai'}, None, T0)[0])
        self.assertFalse(db.set('wall/99_4', {'c': '#ff0000', 't': TS}, None, T0)[0])
        self.assertTrue(db.set('web/wabc', {'n': 'a', 'c': '#00ff00', 'x': 1, 'y': 2, 'z': 3, 'r': 0, 't': TS}, None, T0)[0])
        self.assertFalse(db.set('web/wabc', {'n': 'a', 'c': '#00ff00', 'x': 1, 'y': 2, 'z': 3, 'r': 0, 't': 5}, None, T0)[0])


class Packs(Base):
    def test_open_ten_then_refused(self):
        for i in range(10):
            self.ok(self.open_pack(T0 + 1000 + i, 9 - i, T0, {str(100 + i): (1, 0)}), T0 + 1000 + i)
        self.no(self.open_pack(T0 + 2000, 0, T0, {'500': (1, 0)}), T0 + 2000)
        self.no(self.open_pack(T0 + 2000, 0, T0 + 1, {'500': (1, 0)}), T0 + 2000)   # nudging the clock is not enough
    def test_timer_refill(self):
        for i in range(10): self.ok(self.open_pack(T0 + i, 9 - i, T0, {}), T0 + i)
        now = T0 + 25 * 60000            # 25 minutes later = 2 packs
        self.no(self.open_pack(now, 2, T0 + 2 * P, {}), now)      # 2 earned, opening 1 leaves 1, not 2
        self.no(self.open_pack(now, 1, T0 + 3 * P, {}), now)      # lastClaim in the future
        self.ok(self.open_pack(now, 1, T0 + 2 * P, {'7': (2, 1)}, holos=1), now)
        self.no({'users/%s/packs/stored' % UID: 5}, now + 1)      # free packs from nowhere
    def test_cap_at_ten_while_away(self):
        for i in range(10): self.ok(self.open_pack(T0 + i, 9 - i, T0, {}), T0 + i)
        now = T0 + 3 * 24 * 3600 * 1000
        self.no(self.open_pack(now, 9, T0 + 10 * P, {}), now)    # keeps a 3-day bank: refused
        self.ok(self.open_pack(now, 9, TS, {}), now)               # resets the timer at the cap: fine
    def test_no_reset_or_delete(self):
        self.ok(self.open_pack(T0 + 1, 9, T0, {'3': (1, 0)}), T0 + 1)
        self.no(signup(), T0 + 5)
        self.no({'users/%s/packs' % UID: None}, T0 + 5)
        self.no({'users/%s/stats/opened' % UID: 0, 'users/%s/packs/stored' % UID: 10}, T0 + 5)
        self.no({'users/%s/stats/opened' % UID: 2}, T0 + 5)       # opened without spending a pack
        self.no({'users/%s/packs/lastClaim' % UID: T0 + 99999}, T0 + 5)
    def test_other_users_and_signed_out(self):
        self.no({'users/%s/dust' % UID: 5}, T0 + 1, {'uid': BOB})
        self.no(signup(BOB), T0 + 1, None)
        self.ok(signup(BOB), T0 + 1, {'uid': BOB})
        self.no({'users/%s/profile/name' % BOB: 'x' * 30}, T0 + 2, {'uid': BOB})
        self.no({'users/%s/profile/name' % BOB: '<b>hi</b>'}, T0 + 2, {'uid': BOB})
        self.no({'junk/abc': 1}, T0 + 2, {'uid': BOB})


class Cards(Base):
    def test_card_rules(self):
        self.no({'users/%s/cards/12' % UID: {'n': 1, 'holo': 0, 't': TS}}, T0 + 1)          # no pack opened
        self.no(self.open_pack(T0 + 1, 9, T0, {'12': (6, 0)}), T0 + 1)                     # 6 of one card from 5
        self.no(self.open_pack(T0 + 1, 9, T0, {'12': (2, 3)}), T0 + 1)                     # more holo than copies
        self.no(self.open_pack(T0 + 1, 9, T0, {'abc': (1, 0)}), T0 + 1)
        self.ok(self.open_pack(T0 + 1, 9, T0, {'12': (3, 0), '40': (2, 0)}), T0 + 1)
        self.no({'users/%s/cards/12' % UID: None}, T0 + 2)                                   # no deleting cards
        self.no({'users/%s/dust' % UID: 500}, T0 + 2)                                        # free dust
        self.ok({'users/%s/cards/12/n' % UID: 1, 'users/%s/stats/dusted' % UID: 2, 'users/%s/dust' % UID: 10}, T0 + 2)
        self.no({'users/%s/cards/40/n' % UID: 1, 'users/%s/stats/dusted' % UID: 3, 'users/%s/dust' % UID: 5000}, T0 + 3)
        self.no({'users/%s/cards/99' % UID: {'n': 1, 'holo': 0, 't': TS}, 'users/%s/stats/crafted' % UID: 1, 'users/%s/dust' % UID: 0}, T0 + 3)  # too poor
    def test_craft(self):
        self.ok(self.open_pack(T0 + 1, 9, T0, {'12': (5, 0)}), T0 + 1)
        self.ok({'users/%s/cards/12/n' % UID: 1, 'users/%s/stats/dusted' % UID: 4, 'users/%s/dust' % UID: 100}, T0 + 2)
        self.ok({'users/%s/cards/99' % UID: {'n': 1, 'holo': 0, 't': TS}, 'users/%s/stats/crafted' % UID: 1, 'users/%s/dust' % UID: 60}, T0 + 3)
        self.no({'users/%s/cards/98' % UID: {'n': 2, 'holo': 0, 't': TS}, 'users/%s/stats/crafted' % UID: 2, 'users/%s/dust' % UID: 10}, T0 + 4)


class Leaderboard(Base):
    def entry(self, **kw):
        e = {'name': 'Cube Kid', 'icon': 3, 'owned': 2, 'holo': 0, 'best': 40, 't': TS}; e.update(kw); return e
    def test_leaderboard(self):
        p = self.open_pack(T0 + 1, 9, T0, {'12': (1, 0), '40': (1, 0)})
        p['users/%s/stats/bestRank' % UID] = 40; p['users/%s/stats/bestId' % UID] = '40'
        self.ok(p, T0 + 1)
        self.no({'leaderboard/' + UID: self.entry(name='Someone Else')}, T0 + 2)
        self.no({'leaderboard/' + UID: self.entry(owned=99)}, T0 + 2)
        self.no({'leaderboard/' + UID: self.entry(best=1)}, T0 + 2)
        self.no({'leaderboard/' + UID: self.entry()}, T0 + 2, {'uid': BOB})
        self.no({'leaderboard/' + UID: self.entry(t=123)}, T0 + 2)
        self.ok({'leaderboard/' + UID: self.entry()}, T0 + 2)
        self.no({'users/%s/stats/bestId' % UID: '77'}, T0 + 3)        # must own the card


class Codes(Base):
    codes = [{'hash': TEST_CODE_HASH, 'packs': 3}]
    def redeem(self, h, packs, extra=None, granted=None):
        pk = self.u('packs')
        return {'users/%s/redeemed/%s' % (UID, h): {'packs': packs, 't': TS},
                'users/%s/packs/lastCode' % UID: h,
                'users/%s/packs/extra' % UID: pk['extra'] + packs if extra is None else extra,
                'users/%s/packs/granted' % UID: pk['granted'] + packs if granted is None else granted}
    def test_codes(self):
        bad = hashlib.sha256(b'illgacha:NOPE').hexdigest()
        self.no(self.redeem(bad, 3), T0 + 1)
        self.no(self.redeem(TEST_CODE_HASH, 10), T0 + 1)
        self.no(self.redeem(TEST_CODE_HASH, 3, extra=10), T0 + 1)
        self.no({'users/%s/packs/extra' % UID: 3}, T0 + 1)
        self.ok(self.redeem(TEST_CODE_HASH, 3), T0 + 1)
        self.assertEqual(self.u('packs')['extra'], 3)
        self.no(self.redeem(TEST_CODE_HASH, 3), T0 + 2)               # only once
        self.ok(self.open_pack(T0 + 3, 9, T0, {}), T0 + 3)
    def test_committed_rules_accept_no_codes(self):
        rules = json.loads((ROOT / 'firebase/database.rules.json').read_text())
        self.assertNotIn(TEST_CODE_HASH, json.dumps(rules))
        self.assertIn("&& (false || (root.child('illgacha/codes/'", rules['rules']['illgacha']['users']['$uid']['redeemed']['$h']['.validate'])
        self.assertEqual(rules['rules']['illgacha'], json.loads((ROOT / 'firebase/illgacha.rules.json').read_text())['rules']['illgacha'])



# ---------------------------------------------------------------- admin panel
ADMIN_EMAIL = build_rules.ADMIN_EMAIL
ADMIN = {'uid': 'ownerUid01', 'token': {'email': ADMIN_EMAIL, 'email_verified': True}}
NOT_ADMINS = {
    'plain player': {'uid': BOB, 'token': {'email': 'bob@example.com', 'email_verified': True}},
    'admin email, not verified': {'uid': 'ownerUid02', 'token': {'email': ADMIN_EMAIL, 'email_verified': False}},
    'admin email, verified missing': {'uid': 'ownerUid03', 'token': {'email': ADMIN_EMAIL}},
    'different email': {'uid': 'ownerUid04', 'token': {'email': 'x' + ADMIN_EMAIL, 'email_verified': True}},
    'upper-case lookalike': {'uid': 'ownerUid05', 'token': {'email': ADMIN_EMAIL.upper(), 'email_verified': True}},
    'the player themself': A,
    'signed out': None,
}
CODE = hashlib.sha256(b'illgacha:ILL-ABCD-EFGH-JKLM-NPQR').hexdigest()


def log(n, action='test', target='x'):
    return {'adminlog/L%012dabcd' % n: {'t': TS, 'action': action, 'target': target}}


class Admin(Base):
    """Every admin action: the verified admin may do it, nobody else may (and nothing changes for them)."""
    def setUp(self):
        super().setUp()
        p = self.open_pack(T0 + 10, 9, T0, {'12': (2, 0), '40': (1, 0)})
        p['users/%s/stats/bestRank' % UID] = 40; p['users/%s/stats/bestId' % UID] = '40'
        p['leaderboard/' + UID] = {'name': 'Cube Kid', 'icon': 3, 'owned': 2, 'holo': 0, 'best': 40, 't': TS}
        self.ok(p, T0 + 10)
        self.n = 0

    def only_admin(self, patch, now, allowed=()):
        before = copy.deepcopy(self.db.root)
        for who, auth in NOT_ADMINS.items():
            if who in allowed: continue
            r = self.db.update('illgacha', patch, auth, now)
            self.assertFalse(r[0], '%s should be refused for %s' % (sorted(patch), who))
        self.assertEqual(self.db.root, before)
        self.n += 1
        self.ok(dict(patch, **log(self.n)), now, ADMIN)

    def lb(self, now, owned, holo=0, best=40):
        return {'leaderboard/' + UID: {'name': 'Cube Kid', 'icon': 3, 'owned': owned, 'holo': holo, 'best': best, 't': TS}}

    def test_give_packs(self):
        pk = self.u('packs')
        self.only_admin({'users/%s/packs/extra' % UID: pk['extra'] + 7, 'users/%s/packs/granted' % UID: pk['granted'] + 7}, T0 + 20)
        self.assertEqual(self.u('packs')['extra'], 7)
        # even the admin can't break the pack formula or the 100 bonus cap
        self.no({'users/%s/packs/extra' % UID: 9}, T0 + 21, ADMIN)
        self.no({'users/%s/packs/extra' % UID: 107, 'users/%s/packs/granted' % UID: 107}, T0 + 21, ADMIN)
        # the player can spend them: 9 timer packs + 7 bonus, then nothing
        for i in range(16):
            ps = self.u('packs'); timer = ps['stored'] > 0
            p = self.open_pack(T0 + 30 + i, ps['stored'] - 1 if timer else 0, T0, {})
            if not timer: p['users/%s/packs/extra' % UID] = ps['extra'] - 1
            self.ok(p, T0 + 30 + i)
        self.no(dict(self.open_pack(T0 + 99, 0, T0, {}), **{'users/%s/packs/extra' % UID: 6}), T0 + 99)

    def test_give_card(self):
        st = self.u('stats')
        gift = {'users/%s/cards/7' % UID: {'n': 1, 'holo': 1, 't': TS}, 'users/%s/stats/gifted' % UID: 1,
                'users/%s/stats/holos' % UID: st['holos'] + 1, 'users/%s/stats/bestRank' % UID: 7, 'users/%s/stats/bestId' % UID: '7'}
        self.no({'users/%s/cards/7' % UID: {'n': 1, 'holo': 0, 't': TS}}, T0 + 20, ADMIN)         # must count it as gifted
        self.no(dict(gift, **{'users/%s/stats/gifted' % UID: 2}), T0 + 20, ADMIN)                 # one card per gift
        self.only_admin(gift, T0 + 20)
        self.assertEqual(self.u('cards')['7'], {'n': 1, 'holo': 1, 't': T0 + 20})
        # a second copy of a card they already own
        self.only_admin({'users/%s/cards/12' % UID: {'n': 3, 'holo': 0, 't': TS}, 'users/%s/stats/gifted' % UID: 2}, T0 + 21)
        # the player's own leaderboard entry may now count the gift (3 cards, 1 holo, best #7)
        self.ok(self.lb(T0 + 22, 3, 1, 7), T0 + 22)
        self.no({'users/%s/stats/gifted' % UID: 5}, T0 + 23)                                          # players can't gift themselves
        self.no({'users/%s/cards/99' % UID: {'n': 1, 'holo': 0, 't': TS}, 'users/%s/stats/gifted' % UID: 3}, T0 + 23)
        self.ok(self.open_pack(T0 + 24, 8, T0, {'12': (4, 0)}), T0 + 24)                              # normal play still fine

    def test_remove_board_entry_and_reset(self):
        self.only_admin({'leaderboard/' + UID: None}, T0 + 20, allowed=['the player themself'])   # (players may hide themselves)
        self.assertNotIn('leaderboard', self.db.root['illgacha'])
        self.ok(self.lb(T0 + 21, 2), T0 + 21)                                     # comes back when they play
        self.only_admin({'users/' + UID: None, 'leaderboard/' + UID: None}, T0 + 22)
        self.assertNotIn('users', self.db.root['illgacha'])
        self.ok(signup(), T0 + 23)                                                 # a fresh start works
        self.assertEqual(self.u('packs')['stored'], 10)
        self.no({'users/' + BOB: None}, T0 + 24, {'uid': BOB})

    def test_ban_and_unban(self):
        self.only_admin({'bans/' + UID: {'t': TS, 'reason': 'cheating'}}, T0 + 20)
        refused = [self.open_pack(T0 + 21, 8, T0, {'5': (1, 0)}), {'users/%s/profile/name' % UID: 'New Name'},
                   self.lb(T0 + 21, 2), {'leaderboard/' + UID: None}, {'users/%s/dust' % UID: 0}]
        for p in refused: self.no(p, T0 + 21)
        self.no(signup(), T0 + 21)
        self.no({'bans/' + UID: None}, T0 + 21)                                     # can't unban themselves
        self.ok(signup(BOB), T0 + 21, {'uid': BOB})                                 # other players are fine
        self.only_admin({'bans/' + UID: None}, T0 + 22)
        self.ok(self.open_pack(T0 + 23, 8, T0, {'5': (1, 0)}), T0 + 23)
        self.no({'bans/' + UID: {'t': TS, 'reason': 'x' * 101}}, T0 + 24, ADMIN)
        self.no({'bans/' + UID: {'t': T0 + 9999}}, T0 + 24, ADMIN)

    def test_announcement(self):
        self.only_admin({'announce': {'text': 'Double holo weekend!', 'color': '#2ef2ff', 't': TS}}, T0 + 20)
        self.no({'announce': {'text': 'x' * 201, 'color': '#2ef2ff', 't': TS}}, T0 + 21, ADMIN)
        self.no({'announce': {'text': 'hi', 'color': 'red;background:url(x)', 't': TS}}, T0 + 21, ADMIN)
        self.no({'announce': {'text': 'hi', 'color': '#2ef2ff', 't': TS, 'extra': 1}}, T0 + 21, ADMIN)
        self.only_admin({'announce': None}, T0 + 22)

    def test_admin_log(self):
        self.no(log(500), T0 + 20, A)
        self.ok(log(500), T0 + 20, ADMIN)
        self.no(log(500, 'changed'), T0 + 21, ADMIN)                       # append-only
        self.no({'adminlog/L000000000500abcd': None}, T0 + 21, ADMIN)
        self.no({'adminlog/bad key!': {'t': TS, 'action': 'x', 'target': ''}}, T0 + 21, ADMIN)
        self.no({'adminlog/L000000000502abcd': {'t': 5, 'action': 'x', 'target': ''}}, T0 + 21, ADMIN)

    def test_unknown_admin_paths_refused(self):
        self.no({'secrets/x': 1}, T0 + 20, ADMIN)
        self.no({'users/%s/packs/stored' % UID: 10, 'users/%s/packs/lastClaim' % UID: T0 + 20}, T0 + 20, ADMIN)  # formula still holds


class DbCodes(Base):
    """Codes made in the admin panel live in illgacha/codes/<sha256>; uses are counted by the rules."""
    def make(self, h=CODE, packs=5, max_uses=0, expires=0, now=T0 + 5):
        self.ok(dict({'codes/' + h: {'packs': packs, 'maxUses': max_uses, 'uses': 0, 'expires': expires, 'label': 'Test code', 't': TS}}, **log(now)), now, ADMIN)

    def redeem(self, uid, h=CODE, packs=5, uses=None, by=True):
        doc = self.db.root['illgacha']['users'][uid]; pk = doc['packs']
        code = self.db.root['illgacha'].get('codes', {}).get(h, {'uses': 0})
        p = {'users/%s/redeemed/%s' % (uid, h): {'packs': packs, 't': TS}, 'users/%s/packs/lastCode' % uid: h,
             'users/%s/packs/extra' % uid: pk['extra'] + packs, 'users/%s/packs/granted' % uid: pk['granted'] + packs,
             'codes/%s/uses' % h: code['uses'] + 1 if uses is None else uses}
        if by: p['codes/%s/by/%s' % (h, uid)] = TS
        return p

    def setUp(self):
        super().setUp()
        for i, uid in enumerate(['bobUser999', 'carlUser01', 'dianaUser1']):
            self.ok(signup(uid), T0 + 1, {'uid': uid})

    def test_only_admin_makes_codes(self):
        c = {'codes/' + CODE: {'packs': 5, 'maxUses': 0, 'uses': 0, 'expires': 0, 'label': 'x', 't': TS}}
        for who, auth in NOT_ADMINS.items(): self.no(c, T0 + 5, auth)
        self.no({'codes/' + CODE: {'packs': 11, 'maxUses': 0, 'uses': 0, 'expires': 0, 'label': 'x', 't': TS}}, T0 + 5, ADMIN)
        self.no({'codes/' + CODE: {'packs': 5, 'maxUses': 0, 'uses': 0, 'expires': 0, 't': TS}}, T0 + 5, ADMIN)
        self.no({'codes/NOTAHASH': {'packs': 5, 'maxUses': 0, 'uses': 0, 'expires': 0, 'label': 'x', 't': TS}}, T0 + 5, ADMIN)
        self.make()
        for who, auth in NOT_ADMINS.items(): self.no({'codes/' + CODE: None}, T0 + 6, auth)
        self.ok({'codes/' + CODE: None}, T0 + 6, ADMIN)
        self.no(self.redeem(UID), T0 + 7)                                   # deleted = no longer valid

    def test_redeem_once_per_player(self):
        self.make()
        self.no(self.redeem(UID, packs=10), T0 + 10)                        # wrong pack count
        self.no(self.redeem(UID, by=False), T0 + 10)                        # must sign the "used by" list
        self.no(self.redeem(UID, uses=0), T0 + 10)                          # must count the use
        self.no(self.redeem(UID, uses=2), T0 + 10)
        self.ok(self.redeem(UID), T0 + 10)
        self.assertEqual(self.u('packs')['extra'], 5)
        self.assertEqual(self.db.root['illgacha']['codes'][CODE]['uses'], 1)
        self.no(self.redeem(UID), T0 + 11)                                  # twice: refused
        self.ok(self.redeem('bobUser999'), T0 + 11, {'uid': 'bobUser999'})
        self.no({'codes/%s/uses' % CODE: 3}, T0 + 12, {'uid': 'carlUser01'})              # bump the counter only
        self.no({'codes/%s/by/carlUser01' % CODE: TS, 'codes/%s/uses' % CODE: 3}, T0 + 12, {'uid': 'carlUser01'})
        self.no({'codes/%s/uses' % CODE: 0}, T0 + 12, {'uid': 'carlUser01'})              # or reset it
        self.no({'codes/%s/by/%s' % (CODE, UID): None}, T0 + 12)                           # or un-sign
        self.no(self.redeem('carlUser01'), T0 + 12, {'uid': 'bobUser999'})               # for someone else
        # a reset doesn't give the code back
        self.ok(dict({'users/' + UID: None, 'leaderboard/' + UID: None}, **log(99)), T0 + 13, ADMIN)
        self.ok(signup(), T0 + 14)
        self.no(self.redeem(UID), T0 + 15)

    def test_max_uses(self):
        self.make(max_uses=2)
        self.ok(self.redeem(UID), T0 + 10)
        self.ok(self.redeem('bobUser999'), T0 + 11, {'uid': 'bobUser999'})
        self.no(self.redeem('carlUser01'), T0 + 12, {'uid': 'carlUser01'})          # used up
        self.no(self.redeem('carlUser01', uses=2), T0 + 12, {'uid': 'carlUser01'})
        self.ok({'codes/%s/maxUses' % CODE: 3}, T0 + 13, ADMIN)                     # admin raises the limit
        self.ok(self.redeem('carlUser01'), T0 + 14, {'uid': 'carlUser01'})

    def test_expiry(self):
        self.make(expires=T0 + 3600000)
        self.ok(self.redeem(UID), T0 + 3599999)
        self.no(self.redeem('bobUser999'), T0 + 3600000, {'uid': 'bobUser999'})
        self.no(self.redeem('bobUser999'), T0 + 9 * 3600000, {'uid': 'bobUser999'})

    def test_banned_cannot_redeem(self):
        self.make()
        self.ok(dict({'bans/bobUser999': {'t': TS}}, **log(7)), T0 + 8, ADMIN)
        self.no(self.redeem('bobUser999'), T0 + 10, {'uid': 'bobUser999'})
        self.ok(self.redeem(UID), T0 + 10)

    def test_old_in_rules_codes_still_work(self):
        rules = build_rules.merged([{'hash': TEST_CODE_HASH, 'packs': 3}])
        f = Path(tempfile.mkdtemp()) / 'r.json'; f.write_text(json.dumps(rules))
        db = RulesDB(f); db.root = copy.deepcopy(self.db.root)
        self.make()
        db.root['illgacha']['codes'] = copy.deepcopy(self.db.root['illgacha']['codes'])
        pk = db.root['illgacha']['users'][UID]['packs']
        old = {'users/%s/redeemed/%s' % (UID, TEST_CODE_HASH): {'packs': 3, 't': TS}, 'users/%s/packs/lastCode' % UID: TEST_CODE_HASH,
               'users/%s/packs/extra' % UID: pk['extra'] + 3, 'users/%s/packs/granted' % UID: pk['granted'] + 3}
        self.assertTrue(db.update('illgacha', old, A, T0 + 10)[0])
        self.db = db
        self.ok(self.redeem(UID), T0 + 11)
        self.assertEqual(self.u('packs')['extra'], 8)


class FreePack(Base):
    def start(self, id_, packs=2, until=T0 + 86400000, now=T0 + 5, auth=ADMIN):
        return self.db.update('illgacha', dict({'freepack': {'id': id_, 'packs': packs, 'until': until, 't': TS}}, **log(now + id_)), auth, now)

    def claim(self, uid, id_, packs=2):
        pk = self.db.root['illgacha']['users'][uid]['packs']
        return {'users/%s/packs/freeId' % uid: id_, 'users/%s/packs/extra' % uid: pk['extra'] + packs,
                'users/%s/packs/granted' % uid: pk['granted'] + packs}

    def test_free_pack_for_everyone(self):
        for who, auth in NOT_ADMINS.items(): self.assertFalse(self.start(1, auth=auth)[0], who)
        self.no(self.claim(UID, 1), T0 + 6)                                  # nothing running yet
        self.assertTrue(self.start(1)[0])
        self.no(self.claim(UID, 1, packs=5), T0 + 6)
        self.no(self.claim(UID, 2), T0 + 6)
        self.ok(self.claim(UID, 1), T0 + 6)
        self.assertEqual(self.u('packs')['extra'], 2)
        self.no(self.claim(UID, 1), T0 + 7)                                  # once per gift
        self.no({'users/%s/packs/granted' % UID: 4, 'users/%s/packs/extra' % UID: 4}, T0 + 7)
        self.ok(signup(BOB), T0 + 8, {'uid': BOB})                           # new players get it too
        self.ok(self.claim(BOB, 1), T0 + 9, {'uid': BOB})
        self.assertFalse(self.start(0, now=T0 + 10)[0])                     # ids only go up
        self.assertFalse(self.db.update('illgacha', {'freepack': None}, ADMIN, T0 + 10)[0])
        self.assertTrue(self.db.update('illgacha', dict({'freepack/until': TS}, **log(55)), ADMIN, T0 + 10)[0])   # stop it
        self.assertTrue(self.start(2, packs=1, until=T0 + 1000, now=T0 + 11)[0])
        self.ok(self.claim(UID, 2, packs=1), T0 + 999)
        self.no(self.claim(BOB, 2, packs=1), T0 + 1000, {'uid': BOB})       # ended
        self.ok(self.open_pack(T0 + 1001, 9, T0, {'3': (1, 0)}), T0 + 1001)

if __name__ == '__main__':
    unittest.main(verbosity=1)
