// Demo mode backend: a pretend signed-in player whose data lives in this browser's localStorage.
// It speaks the same "multi-path patch" language as the Firebase backend, so the game code is identical.
(function (ILL) {
  'use strict';
  const { store, applyPatch } = ILL.u;
  const KEY = 'illgacha.demo.v1';
  const UID = 'demoPlayer01';

  const BOTS = ['NeonWaveKid', 'SpiderSam', 'ShipLord', 'OrbHopper', 'CubeQueen', 'UFOfan', 'RobotRun',
    'SawBlade', 'GlowDash', 'BallBouncer', 'SwingCopter', 'PixelSpike', 'DualMode', 'MirrorPortal', 'GravityFlip'];

  function seedBoard() {
    const lb = {};
    BOTS.forEach((n, i) => {
      const owned = Math.round(520 / (i + 1.4)) + ((i * 37) % 23);
      lb['bot' + String(i).padStart(4, '0') + 'xx'] = { name: n, icon: (i * 5) % 16, owned, holo: Math.floor(owned / 26) + (i % 3),
        best: [3, 9, 14, 22, 31, 47, 60, 88, 120, 151, 175, 230, 288, 340, 402][i], t: 0 };
    });
    return lb;
  }

  function LocalStore() {
    const cfg = window.ILL_CONFIG || {};
    let db = store.get(KEY, null);
    if (!db || typeof db !== 'object') db = { illgacha: { users: {}, leaderboard: seedBoard() } };
    const listeners = [];
    window.__illWrites = window.__illWrites || [];   // tests replay these through the real rules

    const S = {
      mode: 'demo',
      user: { uid: UID, name: 'Demo Player' },
      ready: true,
      get doc() { return db.illgacha.users[UID] || null; },
      now: () => Date.now(),
      async start(onChange) { listeners.push(onChange); setTimeout(onChange, 0); },
      async signIn() { return S.user; },
      async signOut() { ILL.u.toast('Demo mode: you stay signed in as the demo player.'); },
      reset() { store.del(KEY); db = { illgacha: { users: {}, leaderboard: seedBoard() } }; listeners.forEach((f) => f()); },
      async update(patch) {
        const now = S.now();
        // Same idea as the real rules for codes: the hash must be a known (demo) code, and only once.
        for (const k in patch) {
          const m = k.match(/^users\/[^/]+\/redeemed\/([0-9a-f]{64})$/);
          if (!m) continue;
          const want = (cfg.demoCodes || {})[m[1]];
          const used = S.doc && S.doc.redeemed && S.doc.redeemed[m[1]];
          if (!want || used || !patch[k] || patch[k].packs !== want) {
            const err = new Error('PERMISSION_DENIED'); err.code = 'PERMISSION_DENIED'; throw err;
          }
        }
        window.__illWrites.push({ patch: JSON.parse(JSON.stringify(patch)), now, uid: UID });
        applyPatch(db.illgacha, patch, now);
        store.set(KEY, db);
        listeners.forEach((f) => f());
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
