// Leaderboard: completion, holo cards, rarest pull.
(function (ILL) {
  'use strict';
  const { h, fmt, pct } = ILL.u;
  const D = ILL.data;
  const TABS = [['owned', 'Completion'], ['holo', 'Holo cards'], ['best', 'Rarest pull']];
  let tab = 'owned';

  function value(row) {
    if (tab === 'owned') return [fmt(row.owned) + ' cards', pct(row.owned, D.levels.length) + '%'];
    if (tab === 'holo') return [fmt(row.holo) + ' holo', fmt(row.owned) + ' cards'];
    const lv = D.byRank.get(row.best);
    return lv ? ['#' + lv.rank, lv.name] : ['—', 'no pulls yet'];
  }

  function render(view) {
    const body = h('ol.board', { id: 'board', 'aria-live': 'polite' }, h('li.muted', 'Loading…'));
    const tabs = h('div.tabs-row', { role: 'tablist' }, TABS.map(([k, label]) => h('button.tab' + (k === tab ? '.on' : ''),
      { type: 'button', role: 'tab', 'aria-selected': String(k === tab), onclick: () => { tab = k; view.textContent = ''; render(view); } }, label)));
    view.append(h('section.page.board-page',
      h('div.page-head', h('h1', 'Leaderboard'), h('p.muted', 'Top 50 collectors. Only nicknames are shown.')),
      tabs, body));
    let alive = true;
    ILL.store.board(tab, 50).then((rows) => {
      if (!alive) return;
      rows = rows.filter((r) => tab !== 'best' || r.best < 99999);
      body.textContent = '';
      if (!rows.length) body.appendChild(h('li.muted', 'Nobody here yet — be the first!'));
      const me = ILL.store.user && ILL.store.user.uid;
      rows.forEach((r, i) => {
        const [main, sub] = value(r), lv = tab === 'best' ? D.byRank.get(r.best) : null;
        body.appendChild(h('li.row' + (r.uid === me ? '.me' : '') + (i < 3 ? '.top' + (i + 1) : ''),
          h('span.pos', String(i + 1)), ILL.art.cube(r.icon | 0, 34),
          h('span.who', String(r.name || 'Player').slice(0, 20), r.uid === me ? h('small', ' (you)') : null),
          h('span.val', h('b', { style: lv ? { color: lv.rarity.color } : null }, main), h('small', sub))));
      });
    }).catch((e) => { if (alive) { body.textContent = ''; body.appendChild(h('li.muted', 'Could not load the leaderboard (' + (e.code || e.message) + ').')); } });
    return () => { alive = false; };
  }

  ILL.pages.leaderboard = { title: 'Leaderboard', render, still: true };
})(window.ILL);
