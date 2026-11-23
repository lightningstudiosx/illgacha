// Collection (your cards) and Index (every ILL level). Both page through the list, 48 cards at a time.
(function (ILL) {
  'use strict';
  const { h, fmt } = ILL.u;
  const D = ILL.data;
  const PER = 48;

  function makePage(kind) {
    const st = { q: '', rarity: 'all', show: 'all', sort: 'rank', page: 0 };
    const owned = () => (ILL.store && ILL.store.doc && ILL.store.doc.cards) || {};

    function list() {
      const cards = owned(), q = st.q.trim().toLowerCase();
      let out = D.levels.filter((lv) => {
        const mine = cards[lv.id];
        if (kind === 'collection' && !mine) return false;
        if (st.show === 'owned' && !mine) return false;
        if (st.show === 'missing' && mine) return false;
        if (st.show === 'holo' && !(mine && mine.holo > 0)) return false;
        if (st.show === 'dupes' && !(mine && mine.n > 1)) return false;
        if (st.rarity !== 'all' && lv.rarity.key !== st.rarity) return false;
        return !q || lv.name.toLowerCase().includes(q) || (lv.creators || []).some((c) => c.toLowerCase().includes(q)) || String(lv.rank) === q;
      });
      if (st.sort === 'count') out = out.slice().sort((a, b) => cards[b.id].n - cards[a.id].n || a.rank - b.rank);
      if (st.sort === 'recent') out = out.slice().sort((a, b) => (cards[b.id].t || 0) - (cards[a.id].t || 0));
      if (st.sort === 'rankdesc') out = out.slice().reverse();
      return out;
    }

    function select(label, key, opts) {
      return h('label.field', h('span', label), h('select', { 'aria-label': label, onchange: (e) => { st[key] = e.target.value; st.page = 0; draw(); } },
        opts.map(([v, t]) => h('option', { value: v, selected: st[key] === v ? true : null }, t))));
    }

    let grid, pager, count;
    function draw() {
      const items = list(), cards = owned();
      const pages = Math.max(1, Math.ceil(items.length / PER));
      st.page = Math.min(st.page, pages - 1);
      const slice = items.slice(st.page * PER, st.page * PER + PER);
      grid.textContent = '';
      if (!slice.length) {
        grid.appendChild(h('p.empty', kind === 'collection' && !Object.keys(cards).length ? 'No cards yet. Open a pack on the Home page!' : 'No cards match.'));
      }
      slice.forEach((lv) => {
        const mine = cards[lv.id];
        grid.appendChild(ILL.art.card(lv, { holo: mine && mine.holo > 0, count: mine && mine.n, locked: kind === 'index' && !mine,
          onclick: () => ILL.ui.cardInfo(lv.id) }));
      });
      count.textContent = fmt(items.length) + (kind === 'collection' ? ' cards' : ' levels') + ' · page ' + (st.page + 1) + ' of ' + pages;
      pager.textContent = '';
      const go = (p) => { st.page = Math.max(0, Math.min(pages - 1, p)); draw(); grid.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
      pager.append(
        h('button.btn.small', { type: 'button', disabled: st.page === 0 ? true : null, onclick: () => go(st.page - 1), 'aria-label': 'Previous page' }, '‹ Prev'),
        h('span.pg', (st.page + 1) + ' / ' + pages),
        h('button.btn.small', { type: 'button', disabled: st.page >= pages - 1 ? true : null, onclick: () => go(st.page + 1), 'aria-label': 'Next page' }, 'Next ›'));
    }

    function render(view) {
      const cards = owned(), have = Object.keys(cards).filter((id) => D.get(id)).length;
      const search = h('input', { type: 'search', placeholder: 'Search name, creator or #rank', value: st.q, 'aria-label': 'Search cards',
        oninput: (e) => { st.q = e.target.value; st.page = 0; draw(); } });
      const rar = [['all', 'All rarities']].concat(D.RARITIES.map((r) => [r.key, r.name]));
      const show = kind === 'index'
        ? [['all', 'All levels'], ['owned', 'Collected'], ['missing', 'Missing']]
        : [['all', 'All my cards'], ['holo', 'Holo only'], ['dupes', 'Duplicates']];
      const sort = kind === 'index' ? [['rank', 'Hardest first'], ['rankdesc', 'Easiest first']]
        : [['rank', 'Hardest first'], ['count', 'Most copies'], ['recent', 'Newest'], ['rankdesc', 'Easiest first']];
      grid = h('div.grid', { id: kind + 'Grid' });
      pager = h('div.pager'); count = h('p.count');
      view.append(h('section.page',
        h('div.page-head', h('h1', kind === 'index' ? 'The Index' : 'My Collection'),
          h('p.muted', kind === 'index'
            ? 'Every level on the Impossible Levels List. Grey cards are ones you have not found yet (' + fmt(have) + ' / ' + fmt(D.levels.length) + ').'
            : 'Every card you have pulled. × shows duplicates — turn them into dust on the Crafting page.')),
        h('div.toolbar', search, select('Rarity', 'rarity', rar), select('Show', 'show', show), select('Sort', 'sort', sort)),
        count, grid, pager));
      draw();
    }
    return { title: kind === 'index' ? 'Index' : 'Collection', render };
  }

  ILL.pages.collection = makePage('collection');
  ILL.pages.index = makePage('index');
})(window.ILL);
