"""Make a redeem code for ILL Gacha WITHOUT putting the code itself anywhere public.

  python -I tools/add_code.py                 (asks for the code and the number of packs)
  python -I tools/add_code.py MYCODE 3        (code, packs: 1, 2, 3, 5 or 10)
  python -I tools/add_code.py MYCODE 3 --print-only   (just show the hash, save nothing)

It prints the SHA-256 hash and the rule-friendly JSON, then (unless --print-only) adds it to
firebase/codes.local.json (git-ignored - keep it private) and rebuilds
firebase/database.rules.with-codes.json (also git-ignored). Paste THAT file into
Firebase console -> Realtime Database -> Rules -> Publish. The code never appears in the website,
the repo or the database; only the rules (which players cannot read) know its hash.
Each player can use a code once.
"""
import hashlib, json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / 'firebase' / 'codes.local.json'
ALLOWED = (1, 2, 3, 5, 10)   # must match js/game.js (the site tries these)


def norm(code):               # must match normCode() in js/util.js
    return ''.join(code.upper().split())


def code_hash(code):
    return hashlib.sha256(('illgacha:' + norm(code)).encode('utf-8')).hexdigest()


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    code = args[0] if args else input('New code (letters/numbers, at least 8 characters): ')
    packs = int(args[1]) if len(args) > 1 else int(input('How many bonus packs (1, 2, 3, 5 or 10)? '))
    if len(norm(code)) < 8:
        raise SystemExit('Please use at least 8 characters so nobody can guess it.')
    if packs not in ALLOWED:
        raise SystemExit('Packs must be one of %s' % (ALLOWED,))
    h = code_hash(code)
    entry = {'hash': h, 'packs': packs}
    print('Code (normalised):', norm(code))
    print('SHA-256 hash     :', h)
    print('Rule-friendly JSON:', json.dumps(entry))
    if '--print-only' in argv:
        return
    codes = json.loads(LOCAL.read_text(encoding='utf-8')) if LOCAL.exists() else []
    if any(c['hash'] == h for c in codes):
        print('That code is already in', LOCAL.name)
    else:
        codes.append(entry)
        LOCAL.write_text(json.dumps(codes, indent=2) + '\n', encoding='utf-8')
        print('Saved to', LOCAL, '(private, git-ignored)')
    sys.path.insert(0, str(ROOT / 'tools'))
    import build_rules
    build_rules.main()
    print('Now paste firebase/database.rules.with-codes.json into the Firebase console Rules tab and click Publish.')


if __name__ == '__main__':
    main(sys.argv[1:])
