// Game rules on the player side: free pack timer, opening packs, dust, crafting, codes, leaderboard entry.
// Every action becomes ONE multi-path patch so the database rules can check it as a whole.
(function (ILL) {
  'use strict';
  const { NOW, rand } = ILL.u;
  const D = ILL.data;
  const cfg = window.ILL_CONFIG;
  const P = cfg.packEveryMs, MAX = cfg.maxStored, SIZE = cfg.cardsPerPack;
  const MARGIN = 2000;            // stay a little behind the server clock so we never claim too early
  const G = { busy: false };
  const store = () => ILL.store;
  const uid = () => store().user.uid;
  const U = (path) => 'users/' + uid() + '/' + path;

  G.packState = function (doc, now) {
    const p = (doc && doc.packs) || { stored: 0, lastClaim: now, extra: 0 };
    const k = Math.max(0, Math.floor((now - p.lastClaim - MARGIN) / P));
    const capped = p.stored + k >= MAX;
    const timer = capped ? MAX : p.stored + k;
    return { timer, extra: p.extra || 0, total: timer + (p.extra || 0), capped, newLast: capped ? NOW : p.lastClaim + k * P,
      nextAt: capped ? null : p.lastClaim + (k + 1) * P + MARGIN, progress: capped ? 1 : ((now - p.lastClaim - MARGIN) % P) / P };
  };

  G.summary = function (doc) {
    const cards = (doc && doc.cards) || {};
    let owned = 0, holo = 0, copies = 0, dupes = 0;
    for (const id in cards) {
      if (!D.get(id)) continue;
      owned++; copies += cards[id].n; dupes += cards[id].n - 1;
      if (cards[id].holo > 0) holo++;
    }
    const st = (doc && doc.stats) || {};
    return { owned, holo, copies, dupes, total: D.levels.length, opened: st.opened || 0, dust: (doc && doc.dust) || 0,
      bestRank: st.bestRank || null, pct: ILL.u.pct(owned, D.levels.length) };
  };

  function lbEntry(doc) {
    const s = G.summary(doc);
    return { name: doc.profile.name, icon: doc.profile.icon, owned: Object.keys(doc.cards || {}).length, holo: s.holo,
      best: (doc.stats && doc.stats.bestRank) || 99999, t: NOW };
  }
  // Add the matching leaderboard entry (worked out from the state AFTER the patch) and send it.
  async function commit(patch) {
    const after = ILL.u.applyPatch(JSON.parse(JSON.stringify({ users: { [uid()]: store().doc || {} } })), patch, 0).users[uid()];
    patch['leaderboard/' + uid()] = lbEntry(after);
    await store().update(patch);
    return after;
  }
  G.commit = commit;
  G.U = U;

  G.openPack = async function () {
    const s = store(), doc = s.doc;
    if (G.busy || !doc || !doc.packs) return null;
    const ps = G.packState(doc, s.now());
    if (ps.total < 1) throw new Error('No packs yet - the next one is on its way!');
    G.busy = true;
    try {
      const patch = {};
      if (ps.timer > 0) { patch[U('packs/stored')] = ps.timer - 1; patch[U('packs/lastClaim')] = ps.newLast; }
      else { patch[U('packs/stored')] = 0; patch[U('packs/lastClaim')] = ps.newLast; patch[U('packs/extra')] = ps.extra - 1; }
      const pulls = D.rollPack(rand, SIZE);
      const cards = doc.cards || {}, next = {};
      let holos = 0, best = (doc.stats && doc.stats.bestRank) || 99999, bestId = doc.stats && doc.stats.bestId;
      pulls.forEach((c) => {
        const old = next[c.id] || cards[c.id] || { n: 0, holo: 0 };
        c.isNew = !cards[c.id] && !next[c.id];
        next[c.id] = { n: old.n + 1, holo: old.holo + (c.holo ? 1 : 0), t: NOW };
        if (c.holo) holos++;
        const r = D.get(c.id).rank;
        if (r < best) { best = r; bestId = c.id; }
      });
      for (const id in next) patch[U('cards/' + id)] = next[id];
      patch[U('stats/opened')] = (doc.stats.opened || 0) + 1;
      patch[U('stats/holos')] = (doc.stats.holos || 0) + holos;
      if (best < 99999) { patch[U('stats/bestRank')] = best; patch[U('stats/bestId')] = bestId; }
      await commit(patch);
      return pulls;
    } finally { G.busy = false; }
  };

  // Value of the extra copies of one card (keeps 1 copy, and keeps it holo if you have a holo).
  G.dustValue = function (id, c) {
    const lv = D.get(id); if (!lv || !c || c.n < 2) return { copies: 0, dust: 0 };
    const keepHolo = c.holo > 0 ? 1 : 0, holoOut = c.holo - keepHolo, normalOut = c.n - 1 - holoOut;
    return { copies: c.n - 1, dust: normalOut * lv.rarity.dust + holoOut * lv.rarity.dust * D.HOLO_DUST, keepHolo };
  };

  G.dust = async function (ids) {
    const doc = store().doc; if (G.busy || !doc) return 0;
    const patch = {}; let gain = 0, copies = 0;
    ids.forEach((id) => {
      const c = doc.cards && doc.cards[id], v = G.dustValue(id, c);
      if (!v.copies) return;
      patch[U('cards/' + id)] = { n: 1, holo: v.keepHolo, t: c.t };
      gain += v.dust; copies += v.copies;
    });
    if (!copies) return 0;
    patch[U('stats/dusted')] = (doc.stats.dusted || 0) + copies;
    patch[U('dust')] = (doc.dust || 0) + gain;
    G.busy = true;
    try { await commit(patch); } finally { G.busy = false; }
    return gain;
  };

  G.craft = async function (id) {
    const doc = store().doc, lv = D.get(id);
    if (G.busy || !doc || !lv) return false;
    const cost = lv.rarity.craft;
    if ((doc.dust || 0) < cost) throw new Error('Not enough dust yet (' + cost + ' needed).');
    const old = (doc.cards && doc.cards[id]) || { n: 0, holo: 0 };
    const patch = { [U('cards/' + id)]: { n: old.n + 1, holo: old.holo, t: NOW },
      [U('stats/crafted')]: (doc.stats.crafted || 0) + 1, [U('dust')]: doc.dust - cost };
    if (lv.rank < (doc.stats.bestRank || 99999)) { patch[U('stats/bestRank')] = lv.rank; patch[U('stats/bestId')] = id; }
    G.busy = true;
    try { await commit(patch); } finally { G.busy = false; }
    return true;
  };

  ILL.game = G;
})(window.ILL);
