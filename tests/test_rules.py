"""Checks the real firebase/*.rules.json with the rules evaluator.   python -I tests/test_rules.py"""
import hashlib, json, sys, tempfile, unittest
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
        self.assertIn("&& false", rules['rules']['illgacha']['users']['$uid']['redeemed']['$h']['.validate'])


if __name__ == '__main__':
    unittest.main(verbosity=1)
