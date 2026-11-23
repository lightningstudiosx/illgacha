// Profile & settings, plus the About / credits page.
(function (ILL) {
  'use strict';
  const { h, fmt } = ILL.u;
  const D = ILL.data;

  function profile(view) {
    const s = ILL.store, doc = s.doc;
    if (!s.user) {
      view.append(h('section.page', h('h1', 'Profile'), h('p', 'You are not signed in.'),
        h('button.btn.primary', { type: 'button', onclick: () => s.signIn().catch((e) => ILL.u.toast(e.message, 'bad')) }, 'Sign in with Google')));
      return;
    }
    if (!doc || !doc.profile) { view.append(h('section.page', h('h1', 'Profile'), h('p.muted', 'Loading your save…'))); return; }
    let icon = doc.profile.icon | 0;
    const name = h('input', { id: 'nameInput', type: 'text', value: doc.profile.name, maxlength: '20', 'aria-label': 'Nickname', autocomplete: 'off' });
    const icons = h('div.icon-pick', { role: 'radiogroup', 'aria-label': 'Player icon' }, Array.from({ length: 16 }, (_, i) => h('button.icon-opt' + (i === icon ? '.on' : ''),
      { type: 'button', role: 'radio', 'aria-checked': String(i === icon), 'aria-label': 'Icon ' + (i + 1), onclick: (e) => {
        icon = i; icons.querySelectorAll('.icon-opt').forEach((b, j) => { b.classList.toggle('on', j === i); b.setAttribute('aria-checked', String(j === i)); });
      } }, ILL.art.cube(i, 44))));
    const save = async (e) => {
      e.preventDefault();
      try { await ILL.game.setProfile(name.value, icon); ILL.u.toast('Saved!', 'good'); ILL.paintHeader(); }
      catch (err) { ILL.u.toast(err.message, 'bad'); }
    };
    const sm = ILL.game.summary(doc);
    view.append(h('section.page.profile-page',
      h('div.page-head', h('h1', 'Profile & settings')),
      h('div.profile-grid',
        h('form.panel', { onsubmit: save },
          h('h2', 'Your player'),
          h('label.field.wide', h('span', 'Nickname (shown on the leaderboard)'), name),
          h('p.muted', 'Please don’t use your real name. 2–20 letters, numbers, spaces, _ . -'),
          h('span.field-label', 'Icon'), icons,
          h('div.btn-row', h('button.btn.primary', { type: 'submit', id: 'saveProfile' }, 'Save'),
            h('button.btn', { type: 'button', onclick: () => { name.value = ILL.game.randomName(); } }, 'Random name'))),
        h('div.panel',
          h('h2', 'Stats'),
          h('div.stat-grid', h('div', h('b', fmt(sm.owned)), h('span', 'unique cards')), h('div', h('b', fmt(sm.copies)), h('span', 'total copies')),
            h('div', h('b', fmt(sm.holo)), h('span', 'holo cards')), h('div', h('b', fmt(sm.opened)), h('span', 'packs opened')),
            h('div', h('b', fmt(sm.dust)), h('span', 'dust')), h('div', h('b', sm.pct + '%'), h('span', 'complete'))),
          h('h2', 'Settings'),
          h('label.check', h('input', { type: 'checkbox', checked: ILL.sound.muted ? null : true, onchange: (e) => { ILL.sound.setMuted(!e.target.checked); ILL.render(); } }), ' Sound effects'),
          h('div.btn-row',
            s.mode === 'demo'
              ? h('button.btn.danger', { type: 'button', onclick: () => { if (confirm('Reset the demo player? All demo cards in this browser are deleted.')) s.reset(); } }, 'Reset demo progress')
              : h('button.btn', { type: 'button', onclick: () => s.signOut() }, 'Sign out')),
          h('p.muted', s.mode === 'demo' ? 'Demo mode: nothing leaves this browser.' : 'Signed in with Google. We store only your nickname, icon and cards — not your email.')))));
  }

  function about(view) {
    const odds = D.RARITIES.map((r) => h('tr', h('td', h('b', { style: { color: r.color } }, r.name)),
      h('td', r.upTo === Infinity ? '#' + (D.RARITIES[4].upTo + 1) + ' and below' : 'Top ' + r.upTo),
      h('td', fmt((D.tiers[r.key] || []).length)), h('td', r.weight + '%'), h('td', fmt(r.dust)), h('td', fmt(r.craft))));
    view.append(h('section.page.about',
      h('h1', 'About ILL Gacha'),
      h('p', 'ILL Gacha is a free fan-made card collecting game for Geometry Dash fans. Every card is a level from the ',
        h('a', { href: 'https://impossiblelevels.com', target: '_blank', rel: 'noopener' }, 'Impossible Levels List (ILL)'),
        ' — the community list of levels that are impossible to beat, ranked hardest first.'),
      h('h2', 'Credits'),
      h('ul',
        h('li', 'Level names, ranks, creators, FPS and records: the Impossible Levels List and its team (impossiblelevels.com), via its public API. Snapshot taken ' + String(D.meta.fetched || '').slice(0, 10) + ' (' + fmt(D.meta.count) + ' levels).'),
        h('li', 'Card pictures are thumbnails of each level’s YouTube showcase video and belong to their creators.'),
        h('li', 'Geometry Dash is made by RobTop Games. This site is not affiliated with RobTop Games or the ILL team.'),
        h('li', 'Made by ', h('a', { href: 'https://kaifun.fun', target: '_blank', rel: 'noopener' }, 'Kai.fun'), '. Logo, icons and card designs are drawn in code.')),
      h('h2', 'How packs work'),
      h('p', 'Packs are always free. You get 1 pack every 10 minutes and up to 10 wait for you. Each pack has 5 cards and the last card is always Uncommon or better. About 1 in 25 cards is a shiny holo.'),
      h('div.table-wrap', h('table.odds', h('thead', h('tr', ['Rarity', 'ILL place', 'Cards', 'Chance per card', 'Dust', 'Craft cost'].map((t) => h('th', t)))), h('tbody', odds))),
      h('h2', 'Safe and fair'),
      h('p', 'There is nothing to buy, no ads and no real money anywhere. Sign-in is only used to save your cards; the leaderboard shows only the nickname you pick.')));
  }

  ILL.pages.profile = { title: 'Profile', render: profile, still: true };
  ILL.pages.about = { title: 'About', render: about };
})(window.ILL);
