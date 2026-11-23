// Home: the pack, the countdown ring, codes, progress stats and recently collected cards.
(function (ILL) {
  'use strict';
  const { h, $, fmt, clock } = ILL.u;
  const D = ILL.data;
  const R = 52, C = 2 * Math.PI * R;

  function ring() {
    return ILL.art.svg('<svg viewBox="0 0 120 120" class="ring" aria-hidden="true"><circle cx="60" cy="60" r="' + R + '" class="ring-bg"/>' +
      '<circle cx="60" cy="60" r="' + R + '" class="ring-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '"/></svg>');
  }

  function statsPanel(doc) {
    const s = ILL.game.summary(doc);
    const best = s.bestRank && D.byRank.get(s.bestRank);
    const tiers = D.RARITIES.map((r) => {
      const all = D.tiers[r.key] || [], got = all.filter((lv) => doc && doc.cards && doc.cards[lv.id]).length;
      return h('div.tier-row', h('span.tier-name', { style: { color: r.color } }, r.name),
        h('div.bar', h('i', { style: { width: (all.length ? got / all.length * 100 : 0) + '%', background: r.color } })),
        h('span.tier-num', got + '/' + all.length));
    });
    return h('section.panel.stats', { 'aria-label': 'Your progress' },
      h('h2', 'Your collection'),
      h('div.big-pct', h('b', { id: 'pct' }, s.pct + '%'), h('span', 'complete')),
      h('div.bar.main', h('i', { style: { width: s.pct + '%' } })),
      h('div.stat-grid',
        h('div', h('b', { id: 'statOwned' }, fmt(s.owned)), h('span', 'of ' + fmt(s.total) + ' cards')),
        h('div', h('b', { id: 'statHolo' }, fmt(s.holo)), h('span', 'holo cards')),
        h('div', h('b', { id: 'statOpened' }, fmt(s.opened)), h('span', 'packs opened')),
        h('div', h('b', fmt(s.dust)), h('span', 'dust'))),
      best ? h('p.best-pull', 'Rarest pull: ', h('b', { style: { color: best.rarity.color } }, '#' + best.rank + ' ' + best.name)) : null,
      h('div.tiers', tiers));
  }

  function redeemPanel() {
    const input = h('input', { id: 'codeInput', type: 'text', maxlength: '40', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'Enter a code', 'aria-label': 'Redeem code' });
    const msg = h('p.code-msg', { id: 'codeMsg', 'aria-live': 'polite' });
    const go = async (e) => {
      e.preventDefault();
      btn.disabled = true; msg.textContent = 'Checking…'; msg.className = 'code-msg';
      try {
        const r = await ILL.game.redeem(input.value);
        msg.textContent = r.msg; msg.className = 'code-msg ' + (r.ok ? 'good' : 'bad');
        if (r.ok) { input.value = ''; ILL.sound.coin(); } else ILL.sound.error();
      } catch (err) { msg.textContent = 'Something went wrong. Try again.'; msg.className = 'code-msg bad'; }
      btn.disabled = false;
    };
    const btn = h('button.btn', { type: 'submit' }, 'Redeem');
    return h('section.panel.redeem', h('h2', 'Redeem a code'),
      h('p.muted', 'Codes give free bonus packs. Watch for them on Kai.fun!'),
      h('form.code-row', { onsubmit: go }, input, btn), msg);
  }

  function recentPanel(doc) {
    const cards = (doc && doc.cards) || {};
    const ids = Object.keys(cards).filter((id) => D.get(id)).sort((a, b) => (cards[b].t || 0) - (cards[a].t || 0)).slice(0, 8);
    return h('section.panel.recent', h('h2', 'Recently collected'),
      ids.length ? h('div.card-row', ids.map((id) => ILL.art.card(D.get(id), { holo: cards[id].holo > 0, count: cards[id].n,
        onclick: () => ILL.ui.cardInfo(id) })))
        : h('p.muted', 'Nothing yet — open your first pack!'));
  }

  function render(view) {
    const s = ILL.store, doc = s.doc;
    const signedOut = !s.user;
    const count = h('div.pack-count', { id: 'packCount' });
    const openBtn = h('button.btn.primary.big', { id: 'openBtn', type: 'button', onclick: () => {
      if (signedOut) return s.signIn().catch((e) => ILL.u.toast(e.message, 'bad'));
      ILL.ui.openPackFlow();
    } }, signedOut ? 'Sign in with Google' : 'Open a pack');
    const timerTxt = h('div.ring-txt', { id: 'ringTxt' });
    const packArt = h('button.pack-hit', { type: 'button', 'aria-label': 'Open a pack', onclick: () => openBtn.click() }, ILL.ui.packEl());
    view.append(h('section.home',
      h('div.hero',
        h('div.pack-stage', packArt, h('div.ring-wrap', ring(), timerTxt)),
        h('div.hero-info',
          h('p.kicker', 'The Impossible Levels List · card collection'),
          h('h1', 'Collect the ', h('span.glitch', { 'data-text': 'impossible' }, 'impossible'), '.'),
          h('p.lead', 'Every card is a real level from the ILL — ' + fmt(D.levels.length) + ' levels nobody can beat. ' +
            'The higher it sits on the list, the rarer the card.'),
          h('p.free', h('b', 'Packs are free.'), ' You get 1 pack every 10 minutes, and up to 10 pile up while you are away. No money, ever.'),
          signedOut ? null : count, openBtn)),
      signedOut ? h('section.panel.signin', h('h2', 'Save your cards'), h('p', 'Sign in with Google to keep your collection on every device. We only save a nickname you choose — never your email.'))
        : h('div.home-grid', statsPanel(doc), h('div.side', redeemPanel(), recentPanel(doc)))));

    const fg = view.querySelector('.ring-fg');
    function tick() {
      const st = s.doc && s.doc.packs ? ILL.game.packState(s.doc, s.now()) : null;
      if (!st) { timerTxt.textContent = signedOut ? 'Sign in' : '…'; return; }
      fg.setAttribute('stroke-dashoffset', (C * (1 - st.progress)).toFixed(1));
      timerTxt.textContent = '';
      timerTxt.append(st.capped ? h('b', 'FULL') : h('b', clock(st.nextAt - s.now())), h('span', st.capped ? '10 / 10' : 'next pack'));
      count.textContent = '';
      count.append(h('b', String(st.total)), ' pack' + (st.total === 1 ? '' : 's') + ' ready');
      if (st.extra) count.append(h('small', ' (incl. ' + st.extra + ' bonus)'));
      openBtn.disabled = st.total < 1;
      openBtn.textContent = st.total < 1 ? 'Next pack in ' + clock(st.nextAt - s.now()) : 'Open a pack';
      packArt.classList.toggle('empty', st.total < 1);
    }
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }

  ILL.pages[''] = { title: '', render, still: true };
})(window.ILL);
