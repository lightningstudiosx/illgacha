// Account things: first-time save, nickname/icon, redeem codes.
(function (ILL) {
  'use strict';
  const { NOW, rand, codeHash, normCode } = ILL.u;
  const G = ILL.game;
  const cfg = window.ILL_CONFIG;
  const MAX = cfg.maxStored;
  const store = () => ILL.store;
  const commit = (p) => G.commit(p);
  const U = (p) => G.U(p);

  const ADJ = ['Spiky', 'Neon', 'Turbo', 'Glitch', 'Pixel', 'Hyper', 'Cosmic', 'Mega', 'Shadow', 'Laser'];
  const NOUN = ['Cube', 'Wave', 'Ship', 'Robot', 'Spider', 'Ball', 'UFO', 'Swing', 'Orb', 'Portal'];
  G.randomName = () => ADJ[Math.floor(rand() * 10)] + NOUN[Math.floor(rand() * 10)] + Math.floor(rand() * 9000 + 1000);

  G.ensureUser = async function () {
    const s = store();
    if (!s.user || s.doc && s.doc.packs || G.busy) return false;
    if (s.mode === 'firebase' && !s.ready) return false;
    G.busy = true;
    try {
      await commit({
        [U('profile')]: { name: G.randomName(), icon: Math.floor(rand() * 16) },
        [U('packs')]: { stored: MAX, lastClaim: NOW, extra: 0, granted: 0 },
        [U('stats')]: { opened: 0, holos: 0, dusted: 0, crafted: 0, joined: NOW },
        [U('dust')]: 0
      });
      return true;
    } finally { G.busy = false; }
  };

  const packsMsg = (packs) => '+' + packs + ' bonus pack' + (packs > 1 ? 's' : '') + '!';

  // A code made in the admin panel: illgacha/codes/<hash> says how many packs; the rules count the uses.
  async function redeemListed(hash, c, retried) {
    const doc = store().doc, me = store().user.uid;
    if ((c.by && c.by[me]) || (doc.redeemed && doc.redeemed[hash])) return { ok: false, msg: 'You already used that code.' };
    if (c.expires && store().now() >= c.expires) return { ok: false, msg: 'That code has expired.' };
    if (c.maxUses && (c.uses || 0) >= c.maxUses) return { ok: false, msg: 'That code has been used up.' };
    const extra = (doc.packs.extra || 0) + c.packs;
    if (extra > 100) return { ok: false, msg: 'You already have lots of bonus packs waiting - open a few first!' };
    try {
      await store().update({ [U('redeemed/' + hash)]: { packs: c.packs, t: NOW }, [U('packs/lastCode')]: hash,
        [U('packs/extra')]: extra, [U('packs/granted')]: (doc.packs.granted || 0) + c.packs,
        ['codes/' + hash + '/uses']: (c.uses || 0) + 1, ['codes/' + hash + '/by/' + me]: NOW });
      return { ok: true, packs: c.packs, msg: packsMsg(c.packs) };
    } catch (e) {
      // someone else used it at the same moment: look again once
      const again = retried ? null : await store().get('codes/' + hash).catch(() => null);
      return again ? redeemListed(hash, again, true) : { ok: false, msg: 'That code could not be used right now. Try again.' };
    }
  }

  // Codes: we only know the SHA-256 of the code; the rules decide if it is real and how many packs it gives.
  G.redeem = async function (code) {
    const doc = store().doc;
    if (!doc || !normCode(code)) return { ok: false, msg: 'Type a code first.' };
    if (G.banned()) return { ok: false, msg: 'Your account is banned, so codes can’t be used.' };
    const hash = await codeHash(code);
    if (doc.redeemed && doc.redeemed[hash]) return { ok: false, msg: 'You already used that code.' };
    const listed = await store().get('codes/' + hash).catch(() => null);
    if (listed) return redeemListed(hash, listed);
    for (const packs of [1, 2, 3, 5, 10]) {
      const extra = (doc.packs.extra || 0) + packs;
      if (extra > 100) continue;
      try {
        await store().update({ [U('redeemed/' + hash)]: { packs, t: NOW }, [U('packs/lastCode')]: hash,
          [U('packs/extra')]: extra, [U('packs/granted')]: (doc.packs.granted || 0) + packs });
        return { ok: true, packs, msg: packsMsg(packs) };
      } catch (e) { /* not this reward - try the next one */ }
    }
    return { ok: false, msg: 'That code is not valid.' };
  };

  G.setProfile = async function (name, icon) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-z0-9 _.-]{2,20}$/.test(name)) throw new Error('Names are 2-20 letters, numbers, spaces, _ . or -');
    await commit({ [U('profile/name')]: name, [U('profile/icon')]: icon | 0 });
    return true;
  };
})(window.ILL);
