// Demo mode backend: a pretend signed-in player whose data lives in this browser's localStorage.
// It speaks the same "multi-path patch" language as the Firebase backend, so the game code is identical.
// ?demo&admin pretends the demo player is the admin, to try the admin panel without touching the real database.
(function (ILL) {
  'use strict';
  const { store, applyPatch } = ILL.u;
  const KEY = 'illgacha.demo.v1';
  const UID = 'demoPlayer01';
  const HOUR = 3600000, DAY = 24 * HOUR;

  const BOTS = ['NeonWaveKid', 'SpiderSam', 'ShipLord', 'OrbHopper', 'CubeQueen', 'UFOfan', 'RobotRun',
    'SawBlade', 'GlowDash', 'BallBouncer', 'SwingCopter', 'PixelSpike', 'DualMode', 'MirrorPortal', 'GravityFlip'];
  const BEST = [3, 9, 14, 22, 31, 47, 60, 88, 120, 151, 175, 230, 288, 340, 402];
  const botId = (i) => 'bot' + String(i).padStart(4, '0') + 'xx';

  // Pretend players with real-looking saves (so the leaderboard and the admin panel have something to show).
  // Every number is consistent with the database rules (owned <= 5 x packs opened, holo <= holo pulls, ...).
  function seedBots(now) {
    const users = {}, lb = {}, levels = ILL.data.levels.length;
    BOTS.forEach((name, i) => {
      const owned = Math.round(520 / (i + 1.4)) + ((i * 37) % 23), holo = Math.floor(owned / 26) + (i % 3);
      const ranks = [BEST[i]], seen = new Set(ranks);
      for (let k = 0; ranks.length < owned && k < 20000; k++) {
        const r = BEST[i] + 1 + ((k * 7919 + i * 131) % (levels - BEST[i]));
        if (!seen.has(r) && ILL.data.byRank.get(r)) { seen.add(r); ranks.push(r); }
      }
      const cards = {}; let copies = 0;
      ranks.forEach((r, k) => {
        const n = 1 + ((k + i) % 4 === 0 ? 1 : 0);
        cards[ILL.data.byRank.get(r).id] = { n, holo: k < holo ? 1 : 0, t: now - (i * 3 + (k % 5)) * HOUR - 60000 };
        copies += n;
      });
      const opened = Math.ceil(copies / 5) + i, icon = (i * 5) % 16;
      users[botId(i)] = {
        profile: { name, icon },
        packs: { stored: i % 10, lastClaim: now - i * 7 * 60000, extra: 0, granted: 0 },
        stats: { opened, holos: holo, dusted: 0, crafted: 0, bestRank: BEST[i], bestId: ILL.data.byRank.get(BEST[i]).id,
          joined: now - Math.round((i + 1) * 1.7 * DAY) },
        dust: i * 15, cards };
      lb[botId(i)] = { name, icon, owned: ranks.length, holo, best: BEST[i], t: now - Math.round(i * 2.5 * HOUR) - 60000 };
    });
    return { users, lb };
  }

  function fresh(now) {
    const b = seedBots(now);
    return { illgacha: { users: b.users, leaderboard: b.lb } };
  }

  function LocalStore() {
    const cfg = window.ILL_CONFIG || {};
    const isAdmin = /[?&]admin\b/.test(location.search);
    let db = store.get(KEY, null);
    if (!db || typeof db !== 'object' || !db.illgacha) db = fresh(Date.now());
    if (!db.illgacha.users) db.illgacha.users = {};
    if (!db.illgacha.users[botId(0)]) {             // older demo saves had leaderboard-only bots
      const b = seedBots(Date.now());
      Object.assign(db.illgacha.users, b.users);
      db.illgacha.leaderboard = Object.assign(db.illgacha.leaderboard || {}, b.lb);
    }
    const listeners = [], watchers = [];
    window.__illWrites = window.__illWrites || [];   // tests replay these through the real rules
    window.__illSeed = JSON.parse(JSON.stringify(db.illgacha));   // ...starting from this state

    const at = (path) => path.split('/').filter(Boolean).reduce((n, k) => (n && typeof n === 'object' ? n[k] : undefined), db.illgacha);
    const copy = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
    const deny = () => { const err = new Error('PERMISSION_DENIED'); err.code = 'PERMISSION_DENIED'; throw err; };
    const changed = () => { listeners.forEach((f) => f()); watchers.forEach((w) => w.fn()); };

    // A small stand-in for the real database rules (the tests check every write against the real ones too).
    function check(patch, now) {
      const il = db.illgacha, me = 'users/' + UID;
      if (!isAdmin) {
        if (il.bans && il.bans[UID]) deny();
        for (const k in patch) {
          const own = k === me || k.startsWith(me + '/') || k === 'leaderboard/' + UID;
          if (!own && !new RegExp('^codes/[0-9a-f]{64}/(uses|by/' + UID + ')$').test(k)) deny();
        }
      }
      for (const k in patch) {
        const m = k.match(/^users\/[^/]+\/redeemed\/([0-9a-f]{64})$/);
        if (m) {
          const h = m[1], v = patch[k], c = il.codes && il.codes[h];
          const used = S.doc && S.doc.redeemed && S.doc.redeemed[h];
          if (!v || used) deny();
          if (c) {
            const n = (c.uses || 0) + 1;
            if (v.packs !== c.packs || (c.expires && now >= c.expires) || (c.by && c.by[UID]) || patch['codes/' + h + '/uses'] !== n ||
              (c.maxUses && n > c.maxUses) || !patch['codes/' + h + '/by/' + UID]) deny();
          } else if ((cfg.demoCodes || {})[h] !== v.packs) deny();
        }
        if (k === me + '/packs/freeId') {
          const fp = il.freepack, old = S.doc && S.doc.packs && S.doc.packs.freeId;
          if (!fp || fp.id !== patch[k] || now >= fp.until || old === patch[k]) deny();
        }
      }
    }

    const S = {
      mode: 'demo',
      user: { uid: UID, name: 'Demo Player', isAdmin },
      ready: true,
      get doc() { return db.illgacha.users[UID] || null; },
      now: () => Date.now(),
      async start(onChange) { listeners.push(onChange); setTimeout(onChange, 0); },
      async signIn() { return S.user; },
      async signOut() { ILL.u.toast('Demo mode: you stay signed in as the demo player.'); },
      reset() { store.del(KEY); db = fresh(Date.now()); changed(); },
      async get(path, opts) {
        let v = copy(at(path));
        if (v && opts && opts.last) v = Object.fromEntries(Object.keys(v).sort().slice(-opts.last).map((k) => [k, v[k]]));
        return v;
      },
      watch(path, cb) {
        let last = '\u0000';
        const w = { fn: () => { const v = copy(at(path)), s = JSON.stringify(v); if (s !== last) { last = s; cb(v); } } };
        watchers.push(w); setTimeout(w.fn, 0);
        return () => { const i = watchers.indexOf(w); if (i >= 0) watchers.splice(i, 1); };
      },
      async update(patch) {
        const now = S.now();
        check(patch, now);
        window.__illWrites.push({ patch: JSON.parse(JSON.stringify(patch)), now, uid: UID, admin: isAdmin });
        applyPatch(db.illgacha, patch, now);
        store.set(KEY, db);
        changed();
      },
      async board(field, n) {
        const rows = Object.entries(db.illgacha.leaderboard || {}).map(([uid, e]) => Object.assign({ uid }, e));
        rows.sort((a, b) => field === 'best' ? a.best - b.best : b[field] - a[field]);
        return rows.slice(0, n || 50);
      }
    };
    return S;
  }

  ILL.LocalStore = LocalStore;
})(window.ILL);
