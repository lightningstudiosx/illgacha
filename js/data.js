// The ILL level list (data/levels.json) and everything about rarity.
(function (ILL) {
  'use strict';
  // Rarity comes from the level's place on the ILL: the higher (harder), the rarer.
  // upTo = last ILL rank in the tier. weight = chance per card slot (out of 100).
  const RARITIES = [
    { key: 'mythic',    name: 'Mythic',    upTo: 10,       weight: 0.3, dust: 400, craft: 3200, color: '#ff2f6d' },
    { key: 'legendary', name: 'Legendary', upTo: 50,       weight: 1.5, dust: 150, craft: 1200, color: '#ffb52e' },
    { key: 'epic',      name: 'Epic',      upTo: 150,      weight: 5.2, dust: 60,  craft: 500,  color: '#b65cff' },
    { key: 'rare',      name: 'Rare',      upTo: 400,      weight: 13,  dust: 25,  craft: 200,  color: '#3a9bff' },
    { key: 'uncommon',  name: 'Uncommon',  upTo: 900,      weight: 28,  dust: 10,  craft: 80,   color: '#33e08a' },
    { key: 'common',    name: 'Common',    upTo: Infinity, weight: 52,  dust: 5,   craft: 40,   color: '#97a3bd' }
  ];
  const HOLO_CHANCE = 0.04;      // 4% of cards come out holographic
  const HOLO_DUST = 4;           // a holo copy is worth 4x dust

  const D = { RARITIES, HOLO_CHANCE, HOLO_DUST, levels: [], byId: new Map(), byRank: new Map(), tiers: {}, meta: {} };

  D.rarityOf = (rank) => RARITIES.find((r) => rank <= r.upTo);
  D.rarityKey = (key) => RARITIES.find((r) => r.key === key);
  D.get = (id) => D.byId.get(String(id));

  D.load = async function () {
    const res = await fetch('data/levels.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load the level list (' + res.status + ')');
    const doc = await res.json();
    D.meta = { source: doc.source, fetched: doc.fetched, count: doc.levels.length };
    D.levels = doc.levels;
    D.levels.forEach((lv) => {
      lv.id = String(lv.id);
      lv.rarity = D.rarityOf(lv.rank);
      D.byId.set(lv.id, lv);
      D.byRank.set(lv.rank, lv);
      (D.tiers[lv.rarity.key] = D.tiers[lv.rarity.key] || []).push(lv);
    });
    return D;
  };

  // Pick one card. minTier = index into RARITIES that is the WORST rarity allowed (for the guaranteed slot).
  D.roll = function (rand, worstAllowed) {
    const pool = RARITIES.filter((r, i) => i <= worstAllowed && D.tiers[r.key] && D.tiers[r.key].length);
    const total = pool.reduce((s, r) => s + r.weight, 0);
    let x = rand() * total, tier = pool[pool.length - 1];
    for (const r of pool) { if ((x -= r.weight) < 0) { tier = r; break; } }
    const list = D.tiers[tier.key];
    const lv = list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
    return { id: lv.id, holo: rand() < HOLO_CHANCE };
  };

  // A pack: 5 cards, the last one is always Rare or better.
  D.rollPack = function (rand, size) {
    const out = [];
    for (let i = 0; i < size; i++) out.push(D.roll(rand, i === size - 1 ? 3 : RARITIES.length - 1));
    return out;
  };

  D.thumb = (lv) => (lv && lv.yt ? 'https://i.ytimg.com/vi/' + lv.yt + '/mqdefault.jpg' : null);
  D.creators = (lv, max) => {
    const c = lv.creators || [];
    const n = max || 2;
    return c.length > n ? c.slice(0, n).join(', ') + ' +' + (c.length - n) : c.join(', ');
  };
  D.bestText = (lv) => {
    if (!lv.best) return 'No runs yet';
    const [who, a, b] = lv.best;
    const span = (a ? a + '–' : '') + b + '%';
    return (lv.unbeaten ? 'Best ' : 'Cleared ') + span + ' by ' + who;
  };

  ILL.data = D;
})(window.ILL);
