// Admin panel actions. The panel only shows for the owner (SHA-256 of the signed-in, verified Google email must
// match ILL_CONFIG.adminHash), but that is just for looks: the database rules accept these writes only from the
// owner's verified email. Every action is ONE multi-path write that also adds an entry to illgacha/adminlog.
(function (ILL) {
  'use strict';
  const { NOW, rand, codeHash, normCode, pct } = ILL.u;
  const D = ILL.data;
  const store = () => ILL.store;
  const A = { data: null };
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     // no I, O, 0, 1 - easy to read out loud
  const MAX_EXTRA = 100;                                       // the rules' cap on waiting bonus packs
  const int = (v) => (/^\s*\d+\s*$/.test(String(v)) ? parseInt(v, 10) : NaN);

  A.is = () => !!(store() && store().user && store().user.isAdmin);

  const logId = () => 'L' + store().now().toString(36) + Array.from({ length: 6 }, () => B36[Math.floor(rand() * 36)]).join('');
  async function send(patch, action, target, info) {
    if (!A.is()) throw new Error('Only the admin can do that.');
    const e = { t: NOW, action, target: String(target || '').slice(0, 80) };
    if (info) e.info = String(info).slice(0, 160);
    patch['adminlog/' + logId()] = e;
    try { await store().update(patch); } catch (err) {
      if (/PERMISSION/i.test(err.code || err.message || '')) throw new Error('The database said no. Are the newest rules published? (see SETUP.md)');
      throw err;
    }
  }

  // ---- reading -------------------------------------------------------------------------------------------
  function row(uid, u, lb, ban) {
    u = u || {};
    const cards = u.cards || {}, st = u.stats || {};
    let owned = 0, copies = 0, holo = 0, lastCard = 0;
    for (const id in cards) {
      if (!D.get(id)) continue;
      owned++; copies += cards[id].n || 0;
      if (cards[id].holo > 0) holo++;
      lastCard = Math.max(lastCard, cards[id].t || 0);
    }
    const p = u.profile || {};
    return { uid, name: p.name || (lb && lb.name) || '(no save)', icon: (p.icon != null ? p.icon : lb && lb.icon) | 0,
      owned, copies, holo, pct: pct(owned, D.levels.length), opened: st.opened || 0, holos: st.holos || 0, dust: u.dust || 0,
      crafted: st.crafted || 0, dusted: st.dusted || 0, gifted: st.gifted || 0, bestRank: st.bestRank || null,
      extra: (u.packs && u.packs.extra) || 0, joined: st.joined || null, last: Math.max((lb && lb.t) || 0, lastCard) || null,
      banned: ban || null, onBoard: !!lb, hasSave: !!(u.packs && u.stats), freeId: (u.packs && u.packs.freeId) || 0 };
  }

  A.load = async function () {
    const s = store();
    const [users, board, bans, codes, log, announce, freepack] = await Promise.all([
      s.get('users'), s.get('leaderboard'), s.get('bans'), s.get('codes'), s.get('adminlog', { last: 100 }), s.get('announce'), s.get('freepack')]);
    const u = users || {}, lb = board || {}, b = bans || {};
    const uids = Array.from(new Set(Object.keys(u).concat(Object.keys(lb), Object.keys(b))));
    A.data = { users: u, board: lb, bans: b, codes: codes || {}, log: log || {}, announce, freepack, at: s.now(),
      players: uids.map((id) => row(id, u[id], lb[id], b[id])) };
    return A.data;
  };
  A.player = (uid) => (A.data ? A.data.players.find((p) => p.uid === uid) : null);
  A.nameOf = (uid) => { const p = A.player(uid); return p ? p.name : uid; };

  // ---- players ---------------------------------------------------------------------------------------------
  A.givePacks = async function (uid, n) {
    n = int(n);
    if (!(n >= 1 && n <= MAX_EXTRA)) throw new Error('Give between 1 and ' + MAX_EXTRA + ' packs.');
    const pk = await store().get('users/' + uid + '/packs');
    if (!pk) throw new Error('That player has no save yet.');
    const extra = (pk.extra || 0) + n;
    if (extra > MAX_EXTRA) throw new Error('They already have ' + (pk.extra || 0) + ' bonus packs waiting; ' + MAX_EXTRA + ' is the most. Give ' + (MAX_EXTRA - (pk.extra || 0)) + ' or fewer.');
    // extra and granted go up together, so the pack-timer formula in the rules is unchanged
    await send({ ['users/' + uid + '/packs/extra']: extra, ['users/' + uid + '/packs/granted']: (pk.granted || 0) + n },
      'give packs', uid, '+' + n + ' pack' + (n > 1 ? 's' : '') + ' for ' + A.nameOf(uid));
    return n;
  };

  A.giveCard = async function (uid, id, holo) {
    const lv = D.get(id);
    if (!lv) throw new Error('Pick a level first.');
    const u = await store().get('users/' + uid);
    if (!u || !u.stats || !u.packs) throw new Error('That player has no save yet.');
    const P = 'users/' + uid + '/', old = (u.cards && u.cards[id]) || { n: 0, holo: 0 };
    if (old.n >= 9999) throw new Error('They already have the most copies of that card.');
    const patch = { [P + 'cards/' + id]: { n: old.n + 1, holo: old.holo + (holo ? 1 : 0), t: NOW }, [P + 'stats/gifted']: (u.stats.gifted || 0) + 1 };
    if (holo) patch[P + 'stats/holos'] = (u.stats.holos || 0) + 1;
    if (lv.rank < (u.stats.bestRank || 99999)) { patch[P + 'stats/bestRank'] = lv.rank; patch[P + 'stats/bestId'] = lv.id; }
    if (u.profile && A.data && A.data.board[uid]) {   // keep their leaderboard row in step
      const after = ILL.u.applyPatch({ users: { [uid]: JSON.parse(JSON.stringify(u)) } }, patch, 0).users[uid];
      patch['leaderboard/' + uid] = ILL.game.lbEntry(after);
    }
    await send(patch, 'give card', uid, '#' + lv.rank + ' ' + lv.name + (holo ? ' (holo)' : '') + ' for ' + A.nameOf(uid));
    return lv;
  };

  A.removeFromBoard = (uid) => send({ ['leaderboard/' + uid]: null }, 'remove from leaderboard', uid, A.nameOf(uid));
  A.reset = (uid) => send({ ['users/' + uid]: null, ['leaderboard/' + uid]: null }, 'reset progress', uid, A.nameOf(uid));
  A.ban = function (uid, reason, alsoBoard) {
    reason = String(reason || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const patch = { ['bans/' + uid]: reason ? { t: NOW, reason } : { t: NOW } };
    if (alsoBoard) patch['leaderboard/' + uid] = null;
    return send(patch, 'ban', uid, A.nameOf(uid) + (reason ? ' - ' + reason : ''));
  };
  A.unban = (uid) => send({ ['bans/' + uid]: null }, 'unban', uid, A.nameOf(uid));

  // ---- redeem codes ------------------------------------------------------------------------------------------
  A.genCode = () => 'ILL-' + [0, 1, 2, 3].map(() => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('')).join('-');
  A.codeStrength = function (code) {
    const n = normCode(code).length;
    if (!n) return { ok: false, msg: '' };
    if (n < 8) return { ok: false, msg: 'Too short - at least 8 characters.' };
    if (n < 14) return { ok: true, weak: true, msg: 'Allowed, but short codes can be guessed. A generated code is much safer.' };
    return { ok: true, msg: 'Good length.' };
  };

  A.createCode = async function (o) {
    const code = String(o.code || ''), norm = normCode(code);
    if (norm.length < 8) throw new Error('Codes need at least 8 characters. Use Generate for a safe one.');
    if (norm.length > 40) throw new Error('Codes can be at most 40 characters.');
    const packs = int(o.packs), maxUses = o.maxUses === '' || o.maxUses == null ? 0 : int(o.maxUses);
    if (!(packs >= 1 && packs <= 10)) throw new Error('A code gives 1 to 10 packs.');
    if (!(maxUses >= 0 && maxUses <= 1000000)) throw new Error('Max uses must be a whole number (0 = no limit).');
    const expires = o.expires ? Number(o.expires) : 0;
    if (expires && !(expires > store().now())) throw new Error('The expiry time is already in the past.');
    const label = String(o.label || '').trim().replace(/\s+/g, ' ').slice(0, 40) || (packs + ' packs, ' + new Date(store().now()).toISOString().slice(0, 10));
    const hash = await codeHash(code);
    if (await store().get('codes/' + hash)) throw new Error('That code already exists.');
    await send({ ['codes/' + hash]: { packs, maxUses, uses: 0, expires, label, t: NOW } }, 'create code', label,
      packs + ' packs, ' + (maxUses ? 'max ' + maxUses + ' uses' : 'no use limit') + (expires ? ', expires ' + new Date(expires).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : ''));
    return { hash, code: norm, label };
  };
  A.deleteCode = (hash) => {
    const c = A.data && A.data.codes[hash];
    return send({ ['codes/' + hash]: null }, 'delete code', c ? c.label : hash.slice(0, 12));
  };

  // ---- site-wide -----------------------------------------------------------------------------------------------
  A.COLORS = [['#2ef2ff', 'Cyan'], ['#ff2fb3', 'Pink'], ['#ffb52e', 'Gold'], ['#33e08a', 'Green'], ['#ff2f6d', 'Red'], ['#b65cff', 'Purple']];
  A.setAnnounce = function (text, color) {
    text = String(text || '').trim().replace(/\s+/g, ' ');
    if (!text) throw new Error('Type a message first.');
    if (text.length > 200) throw new Error('Keep it to 200 characters.');
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Pick a colour.');
    return send({ announce: { text, color, t: NOW } }, 'announcement', '', text);
  };
  A.clearAnnounce = () => send({ announce: null }, 'clear announcement', '');
  A.startFree = async function (packs, hours) {
    packs = int(packs); hours = Number(hours);
    if (!(packs >= 1 && packs <= 10)) throw new Error('1 to 10 packs.');
    if (!(hours > 0 && hours <= 24 * 31)) throw new Error('Pick how long it runs.');
    const fp = await store().get('freepack');
    const id = (fp ? fp.id : 0) + 1;
    await send({ freepack: { id, packs, until: store().now() + Math.round(hours * 3600000), t: NOW } }, 'free pack for everyone', '',
      packs + ' pack' + (packs > 1 ? 's' : '') + ' for ' + hours + ' h (gift #' + id + ')');
    return id;
  };
  A.stopFree = () => send({ 'freepack/until': NOW }, 'stop free pack', '');

  ILL.admin = A;
})(window.ILL);
