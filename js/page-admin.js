// Admin panel (#/admin): Overview, Players (+ one player), Codes, Site (announcement, free pack), Log.
// Only the owner sees the tab (see js/admin.js); anyone else who opens #/admin gets a polite "not allowed" page.
(function (ILL) {
  'use strict';
  const { h, $, fmt, toast, modal } = ILL.u;
  const D = ILL.data;
  const A = ILL.admin;
  const TABS = [['', 'Overview'], ['players', 'Players'], ['codes', 'Codes'], ['site', 'Site'], ['log', 'Log']];
  const SORTS = [['last', 'Last active'], ['opened', 'Packs opened'], ['owned', 'Cards owned'], ['joined', 'Newest'], ['name', 'Name A–Z']];
  const st = { q: '', sort: 'last', limit: 50, cardQ: '', card: null, holo: false, made: null, annColor: A.COLORS[0][0], annText: null };
  let loading = null, stale = false;      // stale: we left the admin pages, so reload when coming back

  const parts = () => location.hash.replace(/^#\/?/, '').split('/');
  const playerHref = (uid) => '#/admin/player/' + encodeURIComponent(uid);

  function ago(t, now) {
    if (!t) return '—';
    const s = Math.max(0, (now - t) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return new Date(t).toISOString().slice(0, 10);
  }
  const until = (t, now) => {
    const s = (t - now) / 1000;
    if (s <= 0) return 'ended';
    if (s < 3600) return 'ends in ' + Math.ceil(s / 60) + ' min';
    if (s < 86400 * 2) return 'ends in ' + Math.round(s / 3600) + ' h';
    return 'ends in ' + Math.round(s / 86400) + ' d';
  };
  const stamp = (t) => (t ? new Date(t).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  async function reload() {
    loading = loading || A.load().finally(() => { loading = null; });
    return loading;
  }

  // Run an admin action, show the result, then reload the data and redraw.
  async function act(btn, fn, okMsg) {
    if (btn) btn.disabled = true;
    try {
      const r = await fn();
      ILL.sound.coin(); toast(typeof okMsg === 'function' ? okMsg(r) : okMsg, 'good');
      await reload(); ILL.render();
      return r || true;
    } catch (e) {
      ILL.sound.error(); toast(e.message || 'That did not work.', 'bad');
      if (btn) btn.disabled = false;
      return false;
    }
  }

  function confirmBox(title, text, okLabel) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
      const close = modal(h('div.confirm', h('h2', title), h('p', text), h('div.btn-row',
        h('button.btn', { type: 'button', id: 'admConfirmNo', onclick: () => finish(false) }, 'Cancel'),
        h('button.btn.danger.solid', { type: 'button', id: 'admConfirmYes', onclick: () => finish(true) }, okLabel))),
      { label: title, onclose: () => { if (!done) { done = true; resolve(false); } } });
    });
  }

  const tile = (id, value, label, sub) => h('div.adm-tile', h('b', { id }, value), h('span', label), sub ? h('small', sub) : null);
  const who = (p) => h('span.adm-who', ILL.art.cube(p.icon, 30), h('span.adm-name', h('b', p.name), h('small', p.uid)),
    p.banned ? h('span.badge.ban', 'banned') : null);
  const miniRow = (p, right) => h('li', h('a', { href: playerHref(p.uid) }, ILL.art.cube(p.icon, 28), h('span.adm-mini-name', p.name), h('span.adm-mini-val', right)));

  // ---- Overview -------------------------------------------------------------------------------------------------
  function overview(body, d) {
    const P = d.players.filter((p) => p.hasSave), now = d.at;
    const sum = (k) => P.reduce((s, p) => s + p[k], 0);
    const active = (ms) => P.filter((p) => p.last && now - p.last < ms).length;
    const newest = P.filter((p) => p.joined).sort((a, b) => b.joined - a.joined).slice(0, 6);
    const busiest = P.slice().sort((a, b) => b.opened - a.opened).slice(0, 6);
    const top = P.slice().sort((a, b) => b.owned - a.owned).slice(0, 6);
    const logs = Object.entries(d.log).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5);
    const codes = Object.values(d.codes);
    body.append(
      h('div.adm-tiles',
        tile('admStatPlayers', fmt(P.length), 'players', fmt(active(86400000)) + ' active today · ' + fmt(active(7 * 86400000)) + ' this week'),
        tile('admStatPacks', fmt(sum('opened')), 'packs opened', P.length ? fmt(Math.round(sum('opened') / P.length)) + ' per player' : null),
        tile('admStatCards', fmt(sum('copies')), 'cards collected', fmt(sum('owned')) + ' unique across players'),
        tile('admStatHolo', fmt(sum('holo')), 'holo cards owned', fmt(sum('holos')) + ' holo pulls'),
        tile('admStatCodes', fmt(codes.length), 'redeem codes', fmt(codes.reduce((s, c) => s + (c.uses || 0), 0)) + ' uses'),
        tile('admStatBans', fmt(Object.keys(d.bans).length), 'banned', null)),
      h('div.adm-cols',
        h('section.panel', h('h2', 'Newest players'), newest.length ? h('ol.adm-mini', newest.map((p) => miniRow(p, ago(p.joined, now)))) : h('p.muted', 'Nobody yet.')),
        h('section.panel', h('h2', 'Most active'), h('ol.adm-mini', busiest.map((p) => miniRow(p, fmt(p.opened) + ' packs')))),
        h('section.panel', h('h2', 'Top collectors'), h('ol.adm-mini', top.map((p) => miniRow(p, fmt(p.owned) + ' · ' + p.pct + '%'))))),
      h('section.panel.adm-recent', h('div.adm-panel-head', h('h2', 'Recent admin actions'), h('a.btn.small', { href: '#/admin/log' }, 'Full log')),
        logs.length ? logList(logs, d) : h('p.muted', 'Nothing yet. Everything you do here is written to the log.')));
  }

  // ---- Players --------------------------------------------------------------------------------------------------
  function sorted(d) {
    const q = st.q.trim().toLowerCase();
    const list = d.players.filter((p) => !q || p.name.toLowerCase().includes(q) || p.uid.toLowerCase().includes(q));
    const by = { last: (a, b) => (b.last || 0) - (a.last || 0), opened: (a, b) => b.opened - a.opened, owned: (a, b) => b.owned - a.owned,
      joined: (a, b) => (b.joined || 0) - (a.joined || 0), name: (a, b) => a.name.localeCompare(b.name) }[st.sort];
    return list.sort(by);
  }

  function players(body, d) {
    const rows = h('div.adm-rows', { id: 'admPlayerRows' });
    const count = h('p.count', { id: 'admPlayerCount' });
    const paint = () => {
      const list = sorted(d);
      rows.textContent = '';
      count.textContent = fmt(list.length) + ' player' + (list.length === 1 ? '' : 's') + (st.q ? ' found' : '');
      rows.append(h('div.adm-row.adm-thead', { 'aria-hidden': 'true' }, h('span', 'Player'), h('span', 'Cards'), h('span', 'Complete'),
        h('span', 'Packs'), h('span', 'Holo'), h('span', 'Last active')));
      list.slice(0, st.limit).forEach((p) => rows.append(h('a.adm-row', { href: playerHref(p.uid), 'data-uid': p.uid },
        who(p), h('span.adm-cell', { 'data-l': 'Cards' }, fmt(p.owned)), h('span.adm-cell', { 'data-l': 'Complete' }, p.pct + '%'),
        h('span.adm-cell', { 'data-l': 'Packs' }, fmt(p.opened)), h('span.adm-cell', { 'data-l': 'Holo' }, fmt(p.holo)),
        h('span.adm-cell', { 'data-l': 'Last active' }, ago(p.last, d.at)))));
      if (!list.length) rows.append(h('p.muted.adm-empty', 'No player matches that.'));
      if (list.length > st.limit) rows.append(h('button.btn.small.adm-more', { type: 'button', onclick: () => { st.limit += 100; paint(); } }, 'Show more (' + fmt(list.length - st.limit) + ' left)'));
    };
    body.append(h('section.panel',
      h('div.toolbar',
        h('input', { id: 'admSearch', type: 'search', placeholder: 'Search nickname or player id', value: st.q, 'aria-label': 'Search players', autocomplete: 'off',
          oninput: (e) => { st.q = e.target.value; st.limit = 50; paint(); } }),
        h('label.field', h('span', 'Sort by'), h('select', { id: 'admSort', onchange: (e) => { st.sort = e.target.value; paint(); } },
          SORTS.map(([v, t]) => h('option', { value: v, selected: st.sort === v ? true : null }, t))))),
      count, rows));
    paint();
  }

  // ---- One player -----------------------------------------------------------------------------------------------
  function cardPicker(p) {
    const results = h('div.adm-results', { id: 'admCardResults', role: 'listbox', 'aria-label': 'Matching levels' });
    const chosen = h('div.adm-chosen', { id: 'admCardChosen' });
    const give = h('button.btn.primary', { type: 'button', id: 'admGiveCard', disabled: true, onclick: () => {
      act(give, () => A.giveCard(p.uid, st.card, st.holo), (lv) => 'Gave ' + p.name + ' #' + lv.rank + ' ' + lv.name + (st.holo ? ' (holo)' : ''));
    } }, 'Give card');
    const paintChosen = () => {
      chosen.textContent = '';
      const lv = st.card && D.get(st.card);
      give.disabled = !lv;
      if (lv) chosen.append(h('span', { style: { color: lv.rarity.color } }, h('b', '#' + lv.rank + ' '), lv.name), h('small', ' · ' + lv.rarity.name));
      else chosen.append(h('span.muted', 'No level picked yet.'));
    };
    const search = () => {
      const q = st.cardQ.trim().toLowerCase().replace(/^#/, '');
      results.textContent = '';
      if (!q) return;
      const hits = D.levels.filter((lv) => String(lv.rank) === q || lv.name.toLowerCase().includes(q))
        .sort((a, b) => (String(b.rank) === q) - (String(a.rank) === q) || a.rank - b.rank).slice(0, 8);
      if (!hits.length) results.append(h('p.muted', 'No level called that.'));
      hits.forEach((lv) => results.append(h('button.adm-result' + (st.card === lv.id ? '.on' : ''), { type: 'button', role: 'option', 'data-id': lv.id,
        'aria-selected': String(st.card === lv.id), onclick: () => { st.card = lv.id; paintChosen(); search(); } },
        h('b', '#' + lv.rank), h('span', lv.name), h('small', { style: { color: lv.rarity.color } }, lv.rarity.name))));
    };
    const box = h('section.panel',
      h('h2', 'Give a card'),
      h('input', { id: 'admCardSearch', type: 'search', placeholder: 'Level name or ILL rank, e.g. 42', value: st.cardQ, 'aria-label': 'Find a level', autocomplete: 'off',
        oninput: (e) => { st.cardQ = e.target.value; search(); } }),
      results, chosen,
      h('label.check', h('input', { type: 'checkbox', id: 'admCardHolo', checked: st.holo ? true : null, onchange: (e) => { st.holo = e.target.checked; } }), ' Make it holo'),
      h('div.btn-row', give));
    paintChosen(); search();
    return box;
  }

  function player(body, d, uid) {
    const p = A.player(uid);
    if (!p) { body.append(h('section.panel', h('h2', 'Player not found'), h('p.muted', 'No player with the id ' + uid + '. (A player you reset shows up again when they next visit.)'), h('a.btn', { href: '#/admin/players' }, '‹ All players'))); return; }
    const u = d.users[uid] || {}, now = d.at;
    const cards = u.cards || {};
    const ps = p.hasSave ? ILL.game.packState(u, now) : null;
    const tiers = D.RARITIES.map((r) => {
      const all = D.tiers[r.key] || [], got = all.filter((lv) => cards[lv.id]).length;
      return h('div.tier-row', h('span.tier-name', { style: { color: r.color } }, r.name),
        h('div.bar', h('i', { style: { width: (all.length ? got / all.length * 100 : 0) + '%', background: r.color } })), h('span.tier-num', got + '/' + all.length));
    });
    const rarest = Object.keys(cards).map((id) => D.get(id)).filter(Boolean).sort((a, b) => a.rank - b.rank).slice(0, 6);
    const copyBtn = h('button.btn.small.ghost', { type: 'button', onclick: () => {
      (navigator.clipboard ? navigator.clipboard.writeText(uid) : Promise.reject()).then(() => toast('Player id copied', 'good'), () => toast(uid));
    } }, 'Copy id');

    const packsIn = h('input', { id: 'admPacks', type: 'number', min: '1', max: String(Math.max(1, 100 - p.extra)), value: '3', 'aria-label': 'Packs to give', inputmode: 'numeric' });
    const givePacks = h('button.btn.primary', { type: 'button', id: 'admGivePacks', disabled: p.hasSave ? null : true,
      onclick: () => act(givePacks, () => A.givePacks(uid, packsIn.value), (n) => 'Gave ' + p.name + ' ' + n + ' bonus pack' + (n > 1 ? 's' : '')) }, 'Give packs');
    const reason = h('input', { id: 'admBanReason', type: 'text', maxlength: '100', placeholder: 'Reason (optional, the player sees it)', 'aria-label': 'Ban reason' });
    const alsoBoard = h('input', { type: 'checkbox', id: 'admBanBoard', checked: true });
    const banBtn = p.banned
      ? h('button.btn', { type: 'button', id: 'admUnban', onclick: () => act(banBtn, () => A.unban(uid), p.name + ' is unbanned') }, 'Unban')
      : h('button.btn.danger.solid', { type: 'button', id: 'admBan', onclick: async () => {
        if (await confirmBox('Ban ' + p.name + '?', 'They will not be able to open packs, use codes or change anything until you unban them. They will see a message saying they are banned.', 'Ban player')) {
          act(banBtn, () => A.ban(uid, reason.value, alsoBoard.checked), p.name + ' is banned');
        }
      } }, 'Ban player');
    const boardBtn = h('button.btn', { type: 'button', id: 'admRemoveBoard', disabled: p.onBoard ? null : true, onclick: async () => {
      if (await confirmBox('Remove from the leaderboard?', 'Their row disappears now. It comes back the next time they play, unless they are banned.', 'Remove')) {
        act(boardBtn, () => A.removeFromBoard(uid), 'Removed ' + p.name + ' from the leaderboard');
      }
    } }, p.onBoard ? 'Remove from leaderboard' : 'Not on the leaderboard');
    const resetBtn = h('button.btn.danger', { type: 'button', id: 'admReset', disabled: p.hasSave ? null : true, onclick: async () => {
      if (await confirmBox('Reset ' + p.name + '’s progress?', 'This deletes all ' + fmt(p.owned) + ' of their cards, their dust, packs and stats, and their leaderboard row. They start again from zero next time they visit. This cannot be undone.', 'Yes, reset everything')) {
        if (await act(resetBtn, () => A.reset(uid), p.name + '’s progress was reset')) location.hash = '#/admin/players';
      }
    } }, 'Reset progress');

    body.append(h('div.adm-back', h('a', { href: '#/admin/players' }, '‹ All players')),
      h('section.panel.adm-player-head', ILL.art.cube(p.icon, 64),
        h('div', h('h2', { id: 'admPlayerName' }, p.name), h('p.adm-uid', h('code', uid), copyBtn),
          h('p.muted', 'Joined ' + (p.joined ? stamp(p.joined) : 'before join dates were saved') + ' · last active ' + ago(p.last, now)),
          h('div.adm-badges', p.banned ? h('span.badge.ban', { id: 'admBannedBadge' }, 'Banned' + (p.banned.reason ? ': ' + p.banned.reason : '')) : null,
            p.onBoard ? h('span.badge.ok', 'On the leaderboard') : h('span.badge.off', 'Not on the leaderboard'),
            p.hasSave ? null : h('span.badge.off', 'No save')))),
      h('div.adm-detail',
        h('div.adm-main',
          h('section.panel', h('h2', 'Collection'),
            h('div.big-pct', h('b', p.pct + '%'), h('span', 'complete')),
            h('div.bar.main', h('i', { style: { width: p.pct + '%' } })),
            h('div.stat-grid.adm-stats',
              h('div', h('b', { id: 'admPOwned' }, fmt(p.owned)), h('span', 'of ' + fmt(D.levels.length) + ' cards')),
              h('div', h('b', fmt(p.copies)), h('span', 'copies')),
              h('div', h('b', { id: 'admPHolo' }, fmt(p.holo)), h('span', 'holo cards')),
              h('div', h('b', fmt(p.opened)), h('span', 'packs opened')),
              h('div', h('b', { id: 'admPExtra' }, fmt(p.extra)), h('span', 'bonus packs waiting')),
              h('div', h('b', ps ? String(ps.timer) : '—'), h('span', 'timer packs ready')),
              h('div', h('b', fmt(p.dust)), h('span', 'dust')),
              h('div', h('b', fmt(p.crafted) + ' / ' + fmt(p.dusted)), h('span', 'crafted / dusted')),
              h('div', h('b', { id: 'admPGifted' }, fmt(p.gifted)), h('span', 'cards gifted by you')),
              h('div', h('b', p.bestRank ? '#' + p.bestRank : '—'), h('span', 'rarest pull'))),
            h('div.tiers', tiers)),
          rarest.length ? h('section.panel', h('h2', 'Rarest cards'), h('div.card-row.adm-rarest', rarest.map((lv) =>
            ILL.art.card(lv, { holo: cards[lv.id].holo > 0, count: cards[lv.id].n, onclick: () => ILL.ui.cardInfo(lv.id) })))) : null),
        h('div.adm-actions',
          h('section.panel', h('h2', 'Give bonus packs'),
            h('p.muted', 'Added to their bonus packs (they have ' + p.extra + '; 100 is the most). The 10-pack timer is not touched.'),
            h('div.adm-form', packsIn, givePacks)),
          cardPicker(p),
          h('section.panel', h('h2', 'Moderation'),
            p.banned ? h('p', 'Banned ' + ago(p.banned.t, now) + (p.banned.reason ? ' — “' + p.banned.reason + '”' : '') + '.') : h('div', reason,
              h('label.check', alsoBoard, ' Also remove them from the leaderboard')),
            h('div.btn-row', banBtn, boardBtn),
            h('hr.adm-hr'),
            h('p.muted', 'Reset wipes their save so they start over. Codes they already used stay used.'),
            h('div.btn-row', resetBtn)))));
  }

  // ---- Codes ----------------------------------------------------------------------------------------------------
  function codes(body, d) {
    const now = d.at;
    const code = h('input', { id: 'admCode', type: 'text', maxlength: '40', autocomplete: 'off', spellcheck: 'false', placeholder: 'Type a code or press Generate', 'aria-label': 'New code' });
    const hint = h('p.code-msg', { id: 'admCodeHint', 'aria-live': 'polite' });
    const showHint = () => { const s = A.codeStrength(code.value); hint.textContent = s.msg; hint.className = 'code-msg ' + (!s.msg ? '' : !s.ok ? 'bad' : s.weak ? 'warn' : 'good'); };
    code.addEventListener('input', showHint);
    const packs = h('select', { id: 'admCodePacks', 'aria-label': 'Packs' }, [1, 2, 3, 5, 10].map((n) => h('option', { value: String(n), selected: n === 3 ? true : null }, n + ' pack' + (n > 1 ? 's' : ''))));
    const maxUses = h('input', { id: 'admCodeMax', type: 'number', min: '0', value: '0', inputmode: 'numeric', 'aria-label': 'Max uses' });
    const expires = h('input', { id: 'admCodeExp', type: 'datetime-local', 'aria-label': 'Expires' });
    const label = h('input', { id: 'admCodeLabel', type: 'text', maxlength: '40', placeholder: 'e.g. YouTube video #3', 'aria-label': 'Label' });
    const create = h('button.btn.primary', { type: 'submit', id: 'admCodeCreate' }, 'Create code');
    const submit = async (e) => {
      e.preventDefault();
      const s = A.codeStrength(code.value);
      if (!s.ok) { showHint(); if (!s.msg) { hint.textContent = 'Type a code or press Generate.'; hint.className = 'code-msg bad'; } ILL.sound.error(); return; }
      const raw = code.value;
      const r = await act(create, () => A.createCode({ code: raw, packs: packs.value, maxUses: maxUses.value,
        expires: expires.value ? new Date(expires.value).getTime() : 0, label: label.value }), 'Code created');
      if (r && r.code) { st.made = r; ILL.render(); }
    };
    const list = Object.entries(d.codes).sort((a, b) => (b[1].t || 0) - (a[1].t || 0));
    body.append(...[
      st.made ? h('section.panel.code-made', { id: 'admCodeMade' },
        h('h2', 'New code: ' + st.made.label),
        h('p', h('code', { id: 'admMadeCode' }, st.made.code)),
        h('p.muted', 'Copy it now. Only its fingerprint is saved, so this page can’t show it again.'),
        h('div.btn-row', h('button.btn.small', { type: 'button', onclick: () => {
          (navigator.clipboard ? navigator.clipboard.writeText(st.made.code) : Promise.reject()).then(() => toast('Code copied', 'good'), () => toast(st.made.code));
        } }, 'Copy code'), h('button.btn.small.ghost', { type: 'button', onclick: () => { st.made = null; ILL.render(); } }, 'Done'))) : null,
      h('div.adm-cols.adm-cols-2',
        h('section.panel',
          h('h2', 'Make a redeem code'),
          h('div.warn', h('b', 'Use long, random codes. '), 'Anyone can read the database, so only a fingerprint (SHA-256) of each code is stored — but a short or guessable code ',
            'could still be found by trying lots of guesses. Codes need at least 8 characters; ', h('b', 'Generate'), ' makes a safe 16-character one.'),
          h('form.adm-code-form', { onsubmit: submit },
            h('label.field.wide', h('span', 'Code'), h('div.code-row', code, h('button.btn', { type: 'button', id: 'admGen', onclick: () => { code.value = A.genCode(); showHint(); } }, 'Generate'))),
            hint,
            h('div.adm-grid2',
              h('label.field', h('span', 'Gives'), packs),
              h('label.field', h('span', 'Max uses (0 = no limit)'), maxUses),
              h('label.field', h('span', 'Expires (optional)'), expires),
              h('label.field', h('span', 'Label (only you see it)'), label)),
            h('div.btn-row', create))),
        h('section.panel',
          h('h2', 'Codes (' + list.length + ')'),
          list.length ? h('div.adm-codes', { id: 'admCodeList' }, list.map(([hash, c]) => {
            const expired = c.expires && c.expires <= now, used = c.maxUses && c.uses >= c.maxUses;
            const del = h('button.btn.small.danger', { type: 'button', 'aria-label': 'Delete code ' + c.label, onclick: async () => {
              if (await confirmBox('Delete “' + c.label + '”?', 'Players will no longer be able to use it. Packs already given stay.', 'Delete code')) act(del, () => A.deleteCode(hash), 'Code deleted');
            } }, 'Delete');
            return h('div.adm-code' + (expired || used ? '.dead' : ''), { 'data-hash': hash },
              h('div', h('b', c.label), h('small', 'fingerprint ' + hash.slice(0, 10) + '…')),
              h('span.adm-cell', { 'data-l': 'Gives' }, c.packs + ' pack' + (c.packs > 1 ? 's' : '')),
              h('span.adm-cell', { 'data-l': 'Used' }, fmt(c.uses || 0) + ' / ' + (c.maxUses ? fmt(c.maxUses) : '∞')),
              h('span.adm-cell', { 'data-l': 'Expires' }, expired ? 'expired' : used ? 'used up' : c.expires ? until(c.expires, now).replace('ends', 'expires') : 'never'),
              del);
          })) : h('p.muted', 'No codes yet.'),
          h('p.muted.small-note', 'Codes made with tools/add_code.py live inside the private rules file and are not listed here; they keep working.')))].filter(Boolean));
    if (st.made) setTimeout(() => { const el = $('#admCodeMade'); if (el) el.scrollIntoView({ block: 'nearest' }); }, 0);
  }

  // ---- Site: announcement + free pack for everyone ---------------------------------------------------------------
  function site(body, d) {
    const now = d.at, a = d.announce, fp = d.freepack;
    if (st.annText == null) st.annText = a ? a.text : '';
    if (a && a.color && !st.annColorTouched) st.annColor = a.color;
    const preview = h('div.site-banner.announce.adm-preview', { id: 'admAnnPreview' }, h('span.ann-dot'), h('span.ann-text'));
    const paintPreview = () => { preview.style.setProperty('--ac', st.annColor); preview.querySelector('.ann-text').textContent = st.annText.trim() || 'Your message will look like this.'; };
    const left = h('small.muted', { id: 'admAnnLeft' });
    const text = h('textarea', { id: 'admAnnText', maxlength: '200', rows: '3', placeholder: 'e.g. Double the fun: new codes in tonight’s video!', 'aria-label': 'Announcement text',
      oninput: (e) => { st.annText = e.target.value; left.textContent = (200 - st.annText.length) + ' characters left'; paintPreview(); } }, st.annText);
    left.textContent = (200 - st.annText.length) + ' characters left';
    const swatches = h('div.swatches', { role: 'radiogroup', 'aria-label': 'Colour' }, A.COLORS.map(([c, name]) => h('button.swatch' + (c === st.annColor ? '.on' : ''),
      { type: 'button', role: 'radio', 'aria-checked': String(c === st.annColor), 'aria-label': name, title: name, 'data-color': c, style: { background: c },
        onclick: () => { st.annColor = c; st.annColorTouched = true; swatches.querySelectorAll('.swatch').forEach((b) => { const on = b.dataset.color === c; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); }); paintPreview(); } })));
    const setBtn = h('button.btn.primary', { type: 'button', id: 'admAnnSet', onclick: () => act(setBtn, () => A.setAnnounce(st.annText, st.annColor), 'Announcement is live') }, a ? 'Update message' : 'Show message');
    const clearBtn = h('button.btn', { type: 'button', id: 'admAnnClear', disabled: a ? null : true, onclick: () => act(clearBtn, async () => { await A.clearAnnounce(); st.annText = ''; }, 'Announcement removed') }, 'Remove message');
    paintPreview();

    const running = fp && fp.until > now;
    const claimed = fp ? d.players.filter((p) => p.freeId === fp.id).length : 0;
    const fPacks = h('select', { id: 'admFreePacks', 'aria-label': 'Packs each' }, [1, 2, 3, 5].map((n) => h('option', { value: String(n) }, n + ' pack' + (n > 1 ? 's' : '') + ' each')));
    const fHours = h('select', { id: 'admFreeHours', 'aria-label': 'How long' }, [[1, '1 hour'], [6, '6 hours'], [24, '1 day'], [72, '3 days'], [168, '1 week']].map(([v, t]) => h('option', { value: String(v), selected: v === 24 ? true : null }, 'for ' + t)));
    const startBtn = h('button.btn.primary', { type: 'button', id: 'admFreeStart', onclick: async () => {
      if (!running || await confirmBox('Replace the running gift?', 'Starting a new one ends the current gift. Players who did not claim it yet can claim the new one.', 'Start new gift')) {
        act(startBtn, () => A.startFree(fPacks.value, fHours.value), 'Free pack gift started');
      }
    } }, 'Start gift');
    const stopBtn = h('button.btn', { type: 'button', id: 'admFreeStop', disabled: running ? null : true, onclick: () => act(stopBtn, () => A.stopFree(), 'Gift stopped') }, 'Stop now');

    body.append(h('div.adm-cols.adm-cols-2',
      h('section.panel',
        h('h2', 'Announcement'),
        h('p.muted', 'A message at the top of every page, for everyone. Players can hide it with ×; a new message shows again.'),
        h('p.adm-status', { id: 'admAnnStatus' }, a ? h('span', h('span.badge.ok', 'Live'), ' since ' + ago(a.t, now)) : h('span.badge.off', 'No message')),
        text, left,
        h('span.field-label', 'Colour'), swatches,
        h('span.field-label', 'Preview'), preview,
        h('div.btn-row', setBtn, clearBtn)),
      h('section.panel',
        h('h2', 'Free pack for everyone'),
        h('p.muted', 'Every player (new ones too) gets a “Claim” button at the top of the site and can claim it once while it runs. The packs go to their bonus packs.'),
        h('p.adm-status', { id: 'admFreeStatus' }, running
          ? h('span', h('span.badge.ok', 'Running'), ' gift #' + fp.id + ': ' + fp.packs + ' pack' + (fp.packs > 1 ? 's' : '') + ' each, ' + until(fp.until, now) + ' · claimed by ' + fmt(claimed) + ' player' + (claimed === 1 ? '' : 's'))
          : h('span', h('span.badge.off', 'Not running'), fp ? ' last gift #' + fp.id + ' was claimed by ' + fmt(claimed) + ' player' + (claimed === 1 ? '' : 's') : '')),
        h('div.adm-form', fPacks, fHours),
        h('div.btn-row', startBtn, stopBtn))));
  }

  // ---- Log ------------------------------------------------------------------------------------------------------
  function logList(entries, d) {
    return h('ol.adm-log', entries.map(([id, e]) => h('li', { 'data-id': id },
      h('time', stamp(e.t)), h('b', e.action),
      h('span', e.target && d.users[e.target] || (e.target && A.player(e.target)) ? h('a', { href: playerHref(e.target) }, A.nameOf(e.target)) : (e.target || ''),
        e.info ? h('small', ' ' + e.info) : null))));
  }
  function log(body, d) {
    const entries = Object.entries(d.log).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    body.append(h('section.panel', h('h2', 'Admin log'), h('p.muted', 'The last 100 admin actions, newest first. Only the admin can add to it, and nobody can change it.'),
      entries.length ? logList(entries, d) : h('p.muted', 'Nothing yet.')));
  }

  const PANES = { '': overview, players, player, codes, site, log };

  function denied(view) {
    view.append(h('section.page.admin-denied', h('div.panel',
      h('h1', 'Admin only'),
      h('p', 'Sorry, this page is only for the person who runs ILL Gacha.'),
      h('p.muted', ILL.store.user ? 'Your account doesn’t have admin access.' : 'You are not signed in.'),
      h('div.btn-row', h('a.btn.primary', { href: '#/' }, 'Back to Home')))));
  }

  function render(view) {
    if (!A.is()) { denied(view); return; }
    const [, tab = '', arg = ''] = parts();
    const pane = PANES[tab] ? tab : '';
    const on = pane === 'player' ? 'players' : pane;
    const body = h('div.adm-body', { id: 'admBody', 'data-pane': pane || 'overview' });
    const refresh = h('button.btn.small', { type: 'button', id: 'admRefresh', onclick: async () => {
      refresh.disabled = true;
      try { await reload(); toast('Up to date', 'good'); ILL.render(); } catch (e) { toast(e.message, 'bad'); refresh.disabled = false; }
    } }, '↻ Refresh');
    view.append(h('section.page.admin-page',
      h('div.page-head.adm-head', h('div', h('h1', 'Admin panel'),
        h('p.muted', 'Only you can see this tab. Every change is checked by the database rules and written to the log.')), refresh),
      h('nav.tabs-row.adm-tabs', { 'aria-label': 'Admin sections' }, TABS.map(([k, label]) => h('a.tab' + (k === on ? '.on' : ''),
        { href: '#/admin' + (k ? '/' + k : ''), 'data-tab': k || 'overview', 'aria-current': k === on ? 'page' : null }, label))),
      body));
    let alive = true;
    const paint = () => {
      if (!alive) return;
      body.textContent = '';
      try { PANES[pane](body, A.data, decodeURIComponent(arg)); } catch (e) { body.append(h('p.code-msg.bad', 'Something went wrong: ' + e.message)); }
    };
    const me = ILL.store.user && ILL.store.user.uid;
    if (A.data && !stale && !(ILL.store.doc && !A.data.users[me])) paint();      // (reload once our own save exists)
    else {
      body.append(h('p.muted', 'Loading players…'));
      stale = false;
      reload().then(paint).catch((e) => { if (alive) { body.textContent = ''; body.append(h('p.code-msg.bad', 'Could not load the data (' + (e.code || e.message) + ').')); } });
    }
    return () => { alive = false; if (!/^#\/admin(\/|$)/.test(location.hash)) stale = true; };
  }

  ILL.pages.admin = { title: 'Admin', render, still: true };
})(window.ILL);
