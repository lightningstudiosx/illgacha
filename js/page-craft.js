// Crafting: turn duplicate cards into dust, and spend dust to craft a card you are missing.
(function (ILL) {
  'use strict';
  const { h, fmt } = ILL.u;
  const D = ILL.data;
  const st = { q: '', rarity: 'all', page: 0 };
  const PER = 12;

  async function run(fn, okMsg) {
    try { const r = await fn(); if (r) { ILL.sound.coin(); ILL.u.toast(okMsg(r), 'good'); } }
    catch (e) { ILL.sound.error(); ILL.u.toast(e.message || 'That did not work.', 'bad'); }
  }

  function dustPanel(doc) {
    const cards = (doc && doc.cards) || {};
    const dupes = Object.keys(cards).filter((id) => D.get(id) && cards[id].n > 1)
      .map((id) => ({ id, lv: D.get(id), v: ILL.game.dustValue(id, cards[id]) }))
      .sort((a, b) => b.v.dust - a.v.dust);
    const total = dupes.reduce((s, d) => s + d.v.dust, 0), copies = dupes.reduce((s, d) => s + d.v.copies, 0);
    const all = h('button.btn.primary', { type: 'button', id: 'dustAll', disabled: copies ? null : true, onclick: () => {
      const close = ILL.u.modal(h('div.confirm', h('h2', 'Dust all duplicates?'),
        h('p', 'You keep 1 copy of every card (a holo one if you have it). ' + fmt(copies) + ' extra copies become ' + fmt(total) + ' dust.'),
        h('div.btn-row', h('button.btn.primary', { type: 'button', id: 'dustYes', onclick: () => { close(); run(() => ILL.game.dust(dupes.map((d) => d.id)), (g) => '+' + fmt(g) + ' dust'); } }, 'Yes, dust them'),
          h('button.btn', { type: 'button', onclick: () => close() }, 'Cancel'))), { label: 'Dust all duplicates' });
    } }, copies ? 'Dust all duplicates (+' + fmt(total) + ')' : 'No duplicates yet');
    return h('section.panel.dust-panel',
      h('h2', 'Dust'),
      h('div.dust-big', h('b', { id: 'dustBal' }, fmt((doc && doc.dust) || 0)), h('span', 'dust')),
      h('p.muted', 'Extra copies of a card turn into dust. Holo copies are worth ' + D.HOLO_DUST + '× more.'),
      all,
      h('div.dupe-list', dupes.slice(0, 24).map((d) => h('div.dupe',
        ILL.art.card(d.lv, { holo: cards[d.id].holo > 0, count: cards[d.id].n, onclick: () => ILL.ui.cardInfo(d.id) }),
        h('button.btn.small', { type: 'button', onclick: () => run(() => ILL.game.dust([d.id]), (g) => '+' + fmt(g) + ' dust') },
          'Dust ×' + d.v.copies + ' → +' + d.v.dust)))),
      dupes.length > 24 ? h('p.muted', '+ ' + (dupes.length - 24) + ' more cards with duplicates') : null);
  }

  function craftPanel(doc, view) {
    const cards = (doc && doc.cards) || {}, dust = (doc && doc.dust) || 0;
    const q = st.q.trim().toLowerCase();
    const missing = D.levels.filter((lv) => !cards[lv.id] && (st.rarity === 'all' || lv.rarity.key === st.rarity) &&
      (!q || lv.name.toLowerCase().includes(q) || String(lv.rank) === q));
    const pages = Math.max(1, Math.ceil(missing.length / PER));
    st.page = Math.min(st.page, pages - 1);
    const redraw = () => { view.textContent = ''; render(view); const i = view.querySelector('#craftSearch'); if (i && st.q) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } };
    return h('section.panel.craft-panel',
      h('h2', 'Craft a card'),
      h('div.cost-table', D.RARITIES.map((r) => h('span.cost', { style: { borderColor: r.color } }, h('b', { style: { color: r.color } }, r.name), ' ' + fmt(r.craft)))),
      h('div.toolbar',
        h('input', { id: 'craftSearch', type: 'search', placeholder: 'Find a missing level', value: st.q, 'aria-label': 'Find a missing level',
          oninput: (e) => { st.q = e.target.value; st.page = 0; redraw(); } }),
        h('select', { 'aria-label': 'Rarity', onchange: (e) => { st.rarity = e.target.value; st.page = 0; redraw(); } },
          [['all', 'All rarities']].concat(D.RARITIES.map((r) => [r.key, r.name])).map(([v, t]) => h('option', { value: v, selected: st.rarity === v ? true : null }, t)))),
      h('p.count', fmt(missing.length) + ' missing cards'),
      h('div.craft-list', missing.slice(st.page * PER, st.page * PER + PER).map((lv) => h('div.craft-item',
        ILL.art.card(lv, { onclick: () => ILL.ui.cardInfo(lv.id) }),
        h('button.btn.small' + (dust >= lv.rarity.craft ? '.primary' : ''), { type: 'button', disabled: dust >= lv.rarity.craft ? null : true,
          'aria-label': 'Craft ' + lv.name + ' for ' + lv.rarity.craft + ' dust',
          onclick: () => run(() => ILL.game.craft(lv.id), () => 'Crafted ' + lv.name + '!') }, 'Craft · ' + fmt(lv.rarity.craft))))),
      h('div.pager',
        h('button.btn.small', { type: 'button', disabled: st.page ? null : true, onclick: () => { st.page--; redraw(); } }, '‹ Prev'),
        h('span.pg', (st.page + 1) + ' / ' + pages),
        h('button.btn.small', { type: 'button', disabled: st.page < pages - 1 ? null : true, onclick: () => { st.page++; redraw(); } }, 'Next ›')));
  }

  function render(view) {
    const doc = ILL.store.doc;
    if (!ILL.store.user) { view.append(h('section.page', h('h1', 'Crafting'), h('p', 'Sign in on the Home page to start crafting.'))); return; }
    view.append(h('section.page',
      h('div.page-head', h('h1', 'Crafting'), h('p.muted', 'Dust your duplicates, then craft the exact level you want.')),
      h('div.craft-grid', dustPanel(doc), craftPanel(doc, view))));
  }

  ILL.pages.craft = { title: 'Crafting', render };
})(window.ILL);
