"""Build the Firebase Realtime Database rules for ILL Gacha.

  python -I tools/build_rules.py
writes
  firebase/illgacha.rules.json   only the new "illgacha" part (for reading / reviewing)
  firebase/database.rules.json   firebase/existing.rules.json (the other game's rules, untouched) + "illgacha"
The admin's Google email comes from firebase/admin.local.json (git-ignored). Because the rules contain that email,
ALL generated rules files are git-ignored too: they exist only on the owner's PC and are pasted into the console.
And, ONLY if firebase/codes.local.json exists (it is git-ignored, made by tools/add_code.py):
  firebase/database.rules.with-codes.json   same as database.rules.json but with your secret code hashes.
Paste the with-codes file into the console if you have codes, otherwise database.rules.json.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FB = ROOT / 'firebase'
P = 600000          # one pack every 10 minutes (ms) - must match js/config.js
MAXS = 10           # timer packs are capped at 10
REWARDS = (1, 2, 3, 5, 10)
_ADMIN_FILE = FB / 'admin.local.json'   # git-ignored: the email must never be committed (the repo is public)
if not _ADMIN_FILE.exists():
    raise SystemExit('Missing firebase/admin.local.json - create it as {"email": "you@gmail.com"} (it is git-ignored)')
ADMIN_EMAIL = json.loads(_ADMIN_FILE.read_text(encoding='utf-8'))['email'].strip().lower()
# The one admin: a signed-in Google account with exactly this email, and Google says the email is verified.
ADM = "(auth != null && auth.token.email === '%s' && auth.token.email_verified === true)" % ADMIN_EMAIL
NOT_BANNED = "!root.child('illgacha/bans/' + $uid).exists()"


def integer(lo, hi, v='newData.val()'):
    return "newData.isNumber() && %s %% 1 === 0 && %s >= %d && %s <= %d" % (v, v, lo, v, hi)


def codes_expr(codes):
    parts = ["($h === '%s' && newData.child('packs').val() === %d)" % (c['hash'], c['packs']) for c in codes]
    return '(' + ' || '.join(parts) + ')' if parts else 'false'


def q_check(n_pk, o_pk, n_op, o_op):
    """Packs can only come from time: P*(stored+extra+opened-granted) - lastClaim may never go up."""
    f = lambda s, k: "%s.child('%s').val()" % (s, k)
    return ("%d * (%s + %s + %s - %s) - %s <= %d * (%s + %s + %s - %s) - %s" % (
        P, f(n_pk, 'stored'), f(n_pk, 'extra'), n_op, f(n_pk, 'granted'), f(n_pk, 'lastClaim'),
        P, f(o_pk, 'stored'), f(o_pk, 'extra'), o_op, f(o_pk, 'granted'), f(o_pk, 'lastClaim')))


def illgacha_rules(codes):
    own = "auth != null && auth.uid === $uid && newData.exists() && " + NOT_BANNED
    nS, oS = "newData.child('stored').val()", "data.child('stored').val()"
    nL, oL = "newData.child('lastClaim').val()", "data.child('lastClaim').val()"
    cap = "((%s === %s && %s === %s) || %d * %s + now - %s <= %d)" % (nS, oS, nL, oL, P, nS, nL, P * (MAXS + 1))
    first = ("%s === %d && %s === now && newData.child('extra').val() === 0 && newData.child('granted').val() === 0"
             " && !data.parent().child('stats').exists() && newData.parent().child('stats/opened').val() === 0") % (nS, MAXS, nL)
    packs_ok = "(data.exists() ? (%s && %s && %s >= %s) : (%s))" % (
        q_check('newData', 'data', "newData.parent().child('stats/opened').val()", "data.parent().child('stats/opened').val()"),
        cap, nL, oL, first)
    code = "newData.parent().child('lastCode').val()"
    old_g = "(data.exists() ? data.val() : 0)"
    old_e = "(data.parent().child('extra').exists() ? data.parent().child('extra').val() : 0)"
    old_f = "(data.parent().child('freeId').exists() ? data.parent().child('freeId').val() : 0)"
    FP = "root.child('illgacha/freepack')"
    granted = ("%s && (newData.val() === %s || (newData.parent().child('lastCode').isString() && "
               "!data.parent().parent().child('redeemed').child(%s).exists() && "
               "newData.val() === %s + newData.parent().parent().child('redeemed').child(%s).child('packs').val())"
               # admin gift: granted and extra go up together, so the pack formula is unchanged
               " || (%s && newData.val() > %s && newData.val() - %s === newData.parent().child('extra').val() - %s)"
               # free pack for everyone: once per freepack id, while it is running
               " || (%s.exists() && newData.parent().child('freeId').val() === %s.child('id').val() && %s !== %s.child('id').val()"
               " && now < %s.child('until').val() && newData.val() === %s + %s.child('packs').val()))") % (
        integer(0, 100000), old_g, code, old_g, code, ADM, old_g, old_g, old_e, FP, FP, old_f, FP, FP, old_g, FP)
    U, OU = "newData.parent().parent()", "data.parent().parent()"
    st = lambda u, k: "%s.child('stats/%s').val()" % (u, k)
    d = lambda k: "(%s - %s)" % (st(U, k), st(OU, k))
    nn, on = "newData.child('n').val()", "(data.exists() ? data.child('n').val() : 0)"
    nh, oh = "newData.child('holo').val()", "(data.exists() ? data.child('holo').val() : 0)"
    dust_d = "(%s.child('dust').val() - %s.child('dust').val())" % (U, OU)
    gift = lambda u: "(%s.child('stats/gifted').exists() ? %s.child('stats/gifted').val() : 0)" % (u, u)
    card_ok = ("$id.matches(/^[0-9]{1,6}$/) && newData.hasChildren(['n', 'holo', 't']) && ("
               "(%(nn)s > %(on)s && %(nn)s - %(on)s <= 5 && newData.child('t').val() === now && (%(dO)s === 1 || (%(dC)s === 1 && %(nn)s - %(on)s === 1)))"
               " || (%(nn)s < %(on)s && %(dust)s > 0 && %(dD)s >= %(on)s - %(nn)s) || %(nn)s === %(on)s"
               " || (%(adm)s && %(nn)s === %(on)s + 1 && newData.child('t').val() === now && %(gN)s - %(gO)s === 1))"
               " && %(nh)s <= %(nn)s && %(nh)s <= %(oh)s + (%(nn)s > %(on)s ? %(nn)s - %(on)s : 0)") % dict(
        nn=nn, on=on, nh=nh, oh=oh, dO=d('opened'), dC=d('crafted'), dD=d('dusted'), dust=dust_d, adm=ADM, gN=gift(U), gO=gift(OU))
    S, OS = "newData.parent()", "data.parent()"   # seen from a child of stats
    pulls = "5 * %s.child('opened').val() + %s.child('crafted').val() + (%s.child('gifted').exists() ? %s.child('gifted').val() : 0)" % (S, S, S, S)
    opened_ok = "!data.exists() ? newData.val() === 0 : (newData.val() === data.val() || (newData.val() === data.val() + 1 && %s))" % (
        q_check("newData.parent().parent().child('packs')", "data.parent().parent().child('packs')", 'newData.val()', 'data.val()'))
    dsd = "(newData.parent().child('stats/dusted').val() - data.parent().child('stats/dusted').val())"
    dcr = "(newData.parent().child('stats/crafted').val() - data.parent().child('stats/crafted').val())"
    dust_ok = ("%s && (!data.exists() ? newData.val() === 0 : (newData.val() === data.val() || "
               "(newData.val() > data.val() && newData.val() - data.val() <= 1600 * %s) || "
               "(newData.val() < data.val() && data.val() - newData.val() >= 40 && %s === 1)))") % (integer(0, 10000000), dsd, dcr)
    LU = "newData.parent().parent().child('users/' + $uid)"
    lb_ok = ("newData.hasChildren(['name', 'icon', 'owned', 'holo', 'best', 't']) && $uid.matches(/^[A-Za-z0-9]{6,128}$/)"
             " && newData.child('name').val() === %(u)s.child('profile/name').val()"
             " && newData.child('icon').val() === %(u)s.child('profile/icon').val()"
             " && newData.child('owned').val() <= 5 * %(u)s.child('stats/opened').val() + %(u)s.child('stats/crafted').val() + %(g)s"
             " && newData.child('holo').val() <= %(u)s.child('stats/holos').val()"
             " && newData.child('best').val() === (%(u)s.child('stats/bestRank').exists() ? %(u)s.child('stats/bestRank').val() : 99999)") % {'u': LU, 'g': gift(LU)}
    no = {'.validate': False}
    text = lambda lo, hi: "newData.isString() && newData.val().length >= %d && newData.val().length <= %d" % (lo, hi)
    past = "newData.isNumber() && newData.val() <= now"
    # A redeem code the admin made in the panel: illgacha/codes/<sha256> (only the hash is stored - the DB is public).
    CD = "root.child('illgacha/codes/' + $h)"
    db_code = ("(%(c)s.exists() && newData.child('packs').val() === %(c)s.child('packs').val()"
               " && (%(c)s.child('expires').val() === 0 || now < %(c)s.child('expires').val())"
               " && !%(c)s.child('by/' + $uid).exists()"
               " && newData.parent().parent().parent().parent().child('codes/' + $h + '/by/' + $uid).exists())") % {'c': CD}
    IG = "newData.parent().parent().parent().parent()"     # illgacha/, seen from codes/<h>/by/<uid>
    OIG = "data.parent().parent().parent().parent()"
    return {
        'users': {'$uid': {
            '.write': ADM,          # the admin may change or reset any save (the checks below still apply to changes)
            '.validate': "$uid.matches(/^[A-Za-z0-9]{6,128}$/)",
            'profile': {'.write': own, '.validate': "newData.hasChildren(['name', 'icon'])",
                        'name': {'.validate': "newData.isString() && newData.val().length >= 2 && newData.val().length <= 20 && newData.val().matches(/^[A-Za-z0-9 _.-]+$/)"},
                        'icon': {'.validate': integer(0, 15)}, '$other': no},
            'packs': {'.write': own, '.validate': "newData.hasChildren(['stored', 'lastClaim', 'extra', 'granted']) && " + packs_ok,
                      'stored': {'.validate': integer(0, MAXS)},
                      'lastClaim': {'.validate': "newData.isNumber() && newData.val() <= now"},
                      'extra': {'.validate': integer(0, 100)},
                      'granted': {'.validate': granted},
                      'lastCode': {'.validate': "newData.isString() && newData.val().matches(/^[0-9a-f]{64}$/)"},
                      'freeId': {'.validate': integer(1, 1000000) + " && (newData.val() === data.val() || newData.val() === root.child('illgacha/freepack/id').val())"},
                      '$other': no},
            'stats': {'.write': own, '.validate': "newData.hasChildren(['opened', 'holos', 'dusted', 'crafted'])",
                      'opened': {'.validate': integer(0, 10000000) + ' && (' + opened_ok + ')'},
                      'holos': {'.validate': integer(0, 50000000) + " && (!data.exists() ? newData.val() === 0 : (newData.val() >= data.val() && newData.val() <= data.val() + 5 && newData.val() <= %s))" % pulls},
                      'dusted': {'.validate': integer(0, 50000000) + " && (!data.exists() ? newData.val() === 0 : (newData.val() >= data.val() && newData.val() <= %s))" % pulls},
                      'crafted': {'.validate': integer(0, 10000000) + " && (!data.exists() ? newData.val() === 0 : (newData.val() === data.val() || (newData.val() === data.val() + 1 && newData.parent().parent().child('dust').val() <= data.parent().parent().child('dust').val() - 40)))"},
                      'bestRank': {'.validate': integer(1, 99999)},
                      'bestId': {'.validate': "newData.isString() && newData.val().matches(/^[0-9]{1,6}$/) && newData.parent().parent().child('cards').child(newData.val()).exists()"},
                      'gifted': {'.validate': integer(0, 10000000) + " && (newData.val() === (data.exists() ? data.val() : 0) || (%s && newData.val() === (data.exists() ? data.val() : 0) + 1))" % ADM},
                      'joined': {'.validate': "newData.isNumber() && (data.exists() ? newData.val() === data.val() : newData.val() === now)"},
                      '$other': no},
            'dust': {'.write': own, '.validate': dust_ok},
            'cards': {'$id': {'.write': own, '.validate': card_ok,
                              'n': {'.validate': integer(1, 9999)}, 'holo': {'.validate': integer(0, 9999)},
                              't': {'.validate': "newData.isNumber() && newData.val() <= now"}, '$other': no}},
            'redeemed': {'$h': {'.write': own,
                                '.validate': "$h.matches(/^[0-9a-f]{64}$/) && !data.exists() && newData.hasChildren(['packs', 't']) && newData.child('t').val() === now && newData.parent().parent().child('packs/lastCode').val() === $h && (" + codes_expr(codes) + " || " + db_code + ")",
                                'packs': {'.validate': integer(1, 10)}, 't': {'.validate': 'newData.val() === now'}, '$other': no}},
            '$other': no}},
        'leaderboard': {'.indexOn': ['owned', 'holo', 'best'], '$uid': {
            '.write': "(auth != null && auth.uid === $uid && " + NOT_BANNED + ") || " + ADM, '.validate': lb_ok,
            'name': {'.validate': 'newData.isString()'}, 'icon': {'.validate': integer(0, 15)},
            'owned': {'.validate': integer(0, 100000)}, 'holo': {'.validate': integer(0, 100000)},
            'best': {'.validate': integer(1, 99999)}, 't': {'.validate': 'newData.val() === now'}, '$other': no}},
        # ---- written by the admin panel (the whole database is public to read, so nothing secret goes here) ----
        'codes': {'$h': {
            '.write': ADM,
            '.validate': "$h.matches(/^[0-9a-f]{64}$/) && newData.hasChildren(['packs', 'maxUses', 'uses', 'expires', 'label', 't'])",
            'packs': {'.validate': integer(1, 10)},
            'maxUses': {'.validate': integer(0, 1000000)},          # 0 = no limit
            'uses': {'.write': "auth != null && data.exists() && newData.val() === data.val() + 1 && !root.child('illgacha/bans/' + auth.uid).exists()"
                               " && !data.parent().child('by/' + auth.uid).exists() && newData.parent().child('by/' + auth.uid).exists()",
                     '.validate': integer(0, 1000000) + " && (newData.parent().child('maxUses').val() === 0 || newData.val() <= newData.parent().child('maxUses').val())"},
            'expires': {'.validate': "newData.isNumber() && newData.val() >= 0"},   # 0 = never
            'label': {'.validate': text(1, 40)},
            't': {'.validate': past},
            'by': {'$u': {
                '.write': "auth != null && auth.uid === $u && !data.exists() && newData.exists() && !root.child('illgacha/bans/' + $u).exists()",
                '.validate': ("newData.val() === now && newData.parent().parent().child('uses').val() === data.parent().parent().child('uses').val() + 1"
                              " && %s.child('users/' + $u + '/redeemed/' + $h).exists() && !%s.child('users/' + $u + '/redeemed/' + $h).exists()") % (IG, OIG)}},
            '$other': no}},
        'bans': {'$uid': {
            '.write': ADM, '.validate': "$uid.matches(/^[A-Za-z0-9]{6,128}$/) && newData.hasChildren(['t'])",
            't': {'.validate': past}, 'reason': {'.validate': text(0, 100)}, '$other': no}},
        'announce': {
            '.write': ADM, '.validate': "newData.hasChildren(['text', 'color', 't'])",
            'text': {'.validate': text(1, 200)}, 'color': {'.validate': "newData.isString() && newData.val().matches(/^#[0-9a-fA-F]{6}$/)"},
            't': {'.validate': past}, '$other': no},
        'freepack': {
            '.write': ADM + " && newData.exists()",
            '.validate': "newData.hasChildren(['id', 'packs', 'until', 't']) && (!data.exists() || newData.child('id').val() >= data.child('id').val())",
            'id': {'.validate': integer(1, 1000000)}, 'packs': {'.validate': integer(1, 10)},
            'until': {'.validate': "newData.isNumber()"}, 't': {'.validate': past}, '$other': no},
        'adminlog': {'$id': {
            '.write': ADM + " && !data.exists()",
            '.validate': "$id.matches(/^[A-Za-z0-9_-]{8,40}$/) && newData.hasChildren(['t', 'action', 'target'])",
            't': {'.validate': 'newData.val() === now'}, 'action': {'.validate': text(1, 40)},
            'target': {'.validate': text(0, 80)}, 'info': {'.validate': text(0, 160)}, '$other': no}},
        '$other': no,
    }


def merged(codes):
    existing = json.loads((FB / 'existing.rules.json').read_text(encoding='utf-8'))
    assert 'illgacha' not in existing['rules'], 'existing rules already have illgacha'
    out = {'rules': dict(existing['rules'])}
    out['rules']['illgacha'] = illgacha_rules(codes)
    return out


def dump(path, obj):
    path.write_text(json.dumps(obj, indent=2) + '\n', encoding='utf-8')


def main():
    dump(FB / 'illgacha.rules.json', {'rules': {'illgacha': illgacha_rules([])}})
    dump(FB / 'database.rules.json', merged([]))
    local = FB / 'codes.local.json'
    if local.exists():
        codes = json.loads(local.read_text(encoding='utf-8'))
        dump(FB / 'database.rules.with-codes.json', merged(codes))
        print('Built rules with %d secret code(s): firebase/database.rules.with-codes.json  (paste THIS one)' % len(codes))
    print('Built firebase/database.rules.json and firebase/illgacha.rules.json')


if __name__ == '__main__':
    main()
