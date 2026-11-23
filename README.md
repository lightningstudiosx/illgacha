# ILL Gacha

A free, fan-made card-collecting game for Geometry Dash fans. Every card is a level from the
**[Impossible Levels List (ILL)](https://impossiblelevels.com)** - the community list of levels nobody can
actually beat, ranked hardest first. Lives at **https://illgacha.kaifun.fun**. Made by [Kai.fun](https://kaifun.fun).

- 1 free pack every 10 minutes, up to 10 pile up while you are away (worked out from server time)
- tear the pack open, flip 5 cards one by one; rarity comes from the level's ILL place; 4% holo cards
- Collection, Index (all levels, missing ones greyed), Crafting (dust duplicates, craft any card),
  Leaderboard (completion, holo cards, rarest pull), Profile, redeem codes
- Google sign-in + Firebase Realtime Database to save; no money, no purchases, no ads
- an **admin panel** for the owner only (players, gifts, bans, resets, redeem codes, announcement, free pack for everyone)

Setup for the real site (Firebase, DNS, GitHub Pages): see **[SETUP.md](SETUP.md)**.

## Try it locally

It is a static site - no build step. Serve the folder over http (the browser's SHA-256 needs http/https, not `file://`):

```
python -I -m http.server 8000
```

Then open <http://localhost:8000/?demo>. While `js/config.js` still has placeholders (or with `?demo`),
the site runs in **demo mode**: a pretend signed-in player, saved in localStorage. <http://localhost:8000/?demo&admin>
pretends that player is the admin, to try the admin panel.

## Files

| Path | What |
|---|---|
| `index.html`, `404.html`, `CNAME` | the page, the GitHub Pages 404, the custom domain |
| `css/` | `base` (layout, nav, buttons), `cards` (card faces, holo), `pack` (pack + opening), `pages` |
| `js/config.js` | **the only file to edit**: Firebase web config, timer settings, demo-only test code hash |
| `js/util.js` `data.js` `art.js` `sound.js` | helpers, level data + rarity + rolls, SVG art, WebAudio sounds |
| `js/store-local.js` `store-firebase.js` | demo backend (localStorage) and real backend (Auth + Realtime Database) |
| `js/game.js`, `js/account.js` | pack timer, opening, dust, crafting, leaderboard entry / first save, nickname, codes, free gift - each action is one multi-path write |
| `js/admin.js`, `js/page-admin.js`, `css/admin.css` | admin actions (each also writes `adminlog`) and the admin panel page |
| `js/pack-open.js`, `js/page-*.js`, `js/app.js` | pack animation + card popup, the pages, router/boot |
| `data/levels.json` | snapshot of the ILL (see below) |
| `firebase/` | rules: `existing.rules.json` (other game, copied verbatim), `illgacha.rules.json`, merged `database.rules.json`, `admin.local.json` (admin email) - all three generated/private files are git-ignored; run `tools/build_rules.py` |
| `tools/` | `fetch_ill.py` (refresh data), `build_rules.py` (make rules), `add_code.py` (make a redeem code) |
| `tests/` | `test_site.py` (Playwright), `test_rules.py` + `rules_db.py` + `rules_engine.py` (rules checker) |
| `shots/` | screenshots made by the tests |

## Level data

`data/levels.json` comes from the ILL's public, documented API
(<https://impossiblelevels.com/api/documentation>): `GET /api/Levels/details` and `GET /api/Creators`
(2 requests, JSON only). Each level keeps: `id` (ILL id), `rank`, `name`, `creators`, `gdId` (GD level id or null),
`yt` (YouTube showcase id), `fps`, `unbeaten`, `best` ([player, start %, end %] of the longest run), `year`.

**Refresh the list** (e.g. once a month - please don't hammer their API):

```
python -I tools/fetch_ill.py
```

Then commit `data/levels.json`. Cards are saved by ILL id, so players keep their cards when ranks change;
rarity follows the current rank. Thumbnails are hotlinked from `i.ytimg.com`; if one fails a placeholder is drawn.

## Data model (Realtime Database, under `illgacha/`)

```
illgacha/users/<uid>/profile      {name (2-20 chars, nickname only), icon 0-15}
                    /packs        {stored 0-10, lastClaim ms, extra 0-100 (bonus packs), granted, lastCode, freeId}
                    /stats        {opened, holos, dusted, crafted, bestRank, bestId, gifted, joined}
                    /dust         number
                    /cards/<id>   {n copies, holo copies, t last pulled}
                    /redeemed/<sha256>  {packs, t}
illgacha/leaderboard/<uid>        {name, icon, owned, holo, best, t}   (indexed on owned, holo, best)
--- written by the admin only (everything is public to read, so nothing secret) ---
illgacha/codes/<sha256>           {packs 1-10, maxUses (0 = no limit), uses, expires (0 = never), label, t, by/<uid>}
illgacha/bans/<uid>               {t, reason}
illgacha/announce                 {text, color, t}
illgacha/freepack                 {id, packs, until, t}
illgacha/adminlog/<id>            {t, action, target, info}   (append-only)
```

Rules highlights (`tools/build_rules.py` writes them; `tests/test_rules.py` checks them):
- only the signed-in owner can write their own nodes; nothing can be deleted; unknown fields are refused
- packs come only from time: `600000*(stored+extra+opened-granted) - lastClaim` may never go up, `lastClaim <= now`,
  and stored can't pile past 10 - so no one can give themselves extra packs
- card copies only go up together with `opened +1` (max 5) or a craft (`crafted +1`, dust down); dust only goes up
  when cards are dusted (max 1600 per card); holo copies never exceed copies
- leaderboard entries must match the owner's profile and stats and use the server time
- redeem codes: only SHA-256 hashes, either inside the private rules (`tools/add_code.py`) or, from the admin panel,
  under `illgacha/codes` (public to read - so long random codes only); each code once per player, and for panel codes
  the rules count the uses (`uses` +1 together with `by/<uid>`), refuse after `maxUses` or `expires`
- admin: only `auth.token.email` = the address in `firebase/admin.local.json` (git-ignored) with `email_verified` may write the admin nodes,
  change/reset other saves or remove leaderboard rows. Admin gifts keep the pack formula (`extra` and `granted` go up
  together; gifted cards count in `stats/gifted`). Banned players (`illgacha/bans/<uid>`) can't write anything

Pack rolls happen in the browser, so a very determined cheater could still fake which cards they pulled - the
rules make that as hard as practical.

## Tests

```
python -I tests/test_rules.py     # rules logic, with a real rule-expression evaluator
python -I tests/test_site.py      # Playwright, demo mode, also replays every write through the rules
```

## Credits

Level data: the Impossible Levels List and its team (impossiblelevels.com). Card pictures: thumbnails of each
level's YouTube showcase, owned by their creators. Geometry Dash is by RobTop Games. ILL Gacha is not affiliated with
RobTop Games or the ILL team. Logo, icons and card art are drawn in code (original). Font: Chakra Petch (SIL OFL) via Google Fonts.
