"""Fetch the current Impossible Levels List (ILL) and save a compact static copy to data/levels.json.

Source: the ILL's public, documented API (https://impossiblelevels.com/api/documentation),
base URL https://api.impossiblelevels.com/api. Only two read-only JSON endpoints are used:
  GET /Levels/details   every listed level with creator ids and records
  GET /Creators         creator id -> name
Run from the repo root:   python -I tools/fetch_ill.py
It downloads JSON only (no executables) and makes 2 requests in total, so please don't run it in a loop.
"""
import json, re, sys, time, urllib.request
from pathlib import Path

API = 'https://api.impossiblelevels.com/api'
UA = 'ILLGachaDataRefresh/1.0 (fan-made card game; one-off list snapshot)'
OUT = Path(__file__).resolve().parent.parent / 'data' / 'levels.json'
YT = re.compile(r'(?:youtu\.be/|[?&]v=|/shorts/|/embed/|/live/)([A-Za-z0-9_-]{11})')


def get_json(path):
    req = urllib.request.Request(API + path, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=120) as r:
        if 'json' not in (r.headers.get('Content-Type') or ''):
            raise SystemExit('Unexpected content type from ' + path)
        return json.loads(r.read().decode('utf-8'))


def clean(s, n=60):
    s = re.sub(r'\s+', ' ', str(s or '')).strip()
    return s[:n]


def best_record(records):
    """The longest run anyone has done (start %, end %, player), or None."""
    best = None
    for r in records or []:
        try:
            a, b = float(r.get('startDistance') or 0), float(r.get('endDistance') or 0)
        except (TypeError, ValueError):
            continue
        if best is None or b - a > best[2] - best[1]:
            best = (clean(r.get('player'), 30), round(a, 2), round(b, 2))
    return list(best) if best else None


def main():
    details = get_json('/Levels/details')
    time.sleep(1)
    creators = {c['id']: clean(c.get('name'), 40) for c in get_json('/Creators') if isinstance(c, dict)}
    levels = []
    for item in details:
        lv = item.get('level') or {}
        if lv.get('listType') != 'ILL' or not lv.get('visible') or not isinstance(lv.get('rank'), int):
            continue
        gd = str(lv.get('levelId') or '').strip()
        m = YT.search(lv.get('showcaseLink') or '')
        names = [creators[c] for c in item.get('creatorIds') or [] if creators.get(c)]
        best = best_record(item.get('records'))
        row = {
            'id': int(lv['id']), 'rank': lv['rank'], 'name': clean(lv.get('name')) or 'Untitled',
            'creators': names[:12] or [clean(lv.get('uploader'), 40) or 'Unknown'],
            'gdId': gd if gd.isdigit() else None, 'yt': m.group(1) if m else None,
            'fps': int(lv['fps']) if isinstance(lv.get('fps'), (int, float)) else None,
            'unbeaten': bool(lv.get('uncleared')),
        }
        if best:
            row['best'] = best
        if lv.get('datePublished'):
            row['year'] = int(str(lv['datePublished'])[:4])
        levels.append(row)
    levels.sort(key=lambda r: r['rank'])
    if len(levels) < 50:
        raise SystemExit('Only %d levels came back - not overwriting data/levels.json' % len(levels))
    doc = {'source': 'Impossible Levels List - https://impossiblelevels.com', 'api': API,
           'fetched': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'count': len(levels), 'levels': levels}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Saved %d ILL levels to %s (%d KB)' % (len(levels), OUT, OUT.stat().st_size // 1024))


if __name__ == '__main__':
    sys.exit(main())
