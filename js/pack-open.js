// The pack: tear it open, then flip the 5 cards one at a time. Also the card detail popup.
(function (ILL) {
  'use strict';
  const { h, $ } = ILL.u;
  const D = ILL.data;
  const UI = ILL.ui = ILL.ui || {};
  const ORDER = D.RARITIES.map((r) => r.key);           // mythic first
  const isBig = (k) => ORDER.indexOf(k) <= 2;            // epic, legendary, mythic get the big show

  UI.packEl = () => h('div.pack', { 'aria-hidden': 'true' },
    h('div.pack-top', h('span', 'TEAR HERE')),
    h('div.pack-body', h('div.pack-shine'), ILL.art.logo(false), h('b.pack-title', 'ILL GACHA'),
      h('span.pack-sub', 'IMPOSSIBLE LEVELS EDITION'), h('span.pack-n', '5 CARDS · FREE')));

  function burst(stage, color, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = 120 + Math.random() * 160;
      const p = h('i.spark', { style: { background: color, '--dx': Math.cos(a) * d + 'px', '--dy': Math.sin(a) * d + 'px' } });
      stage.appendChild(p); setTimeout(() => p.remove(), 900);
    }
  }

  UI.openPackFlow = async function () {
    if (UI.packOpen) return;
    let pulls;
    try { pulls = await ILL.game.openPack(); } catch (e) { ILL.u.toast(e.message, 'bad'); ILL.sound.error(); return; }
    if (!pulls) return;
    UI.packOpen = true;
    ILL.sound.whoosh();
    let shown = 0, phase = 'pack';
    const pack = UI.packEl();
    const stage = h('div.po-stage');
    const row = h('div.po-row', { 'aria-live': 'polite' });
    const hint = h('p.po-hint', 'Tap the pack (or drag across the top) to tear it open');
    const skip = h('button.btn.ghost', { type: 'button', onclick: () => revealAll() }, 'Reveal all');
    const ctrl = h('div.po-ctrl', hint, skip);
    const ov = h('div.pack-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Opening a pack', 'data-phase': phase, tabindex: '-1' },
      h('div.po-bg'), stage, row, ctrl);
    stage.appendChild(pack);
    document.body.appendChild(ov);
    document.body.classList.add('no-scroll');
    ov.focus();

    const stack = h('button.po-stack', { type: 'button', 'aria-label': 'Reveal the next card' });
    const best = pulls.reduce((m, c) => Math.min(m, ORDER.indexOf(D.get(c.id).rarity.key)), 9);
    if (best <= 1) pack.classList.add('glow-' + ORDER[best]);   // a legendary+ pack hums before you open it

    function setPhase(p) { phase = p; ov.dataset.phase = p; }
    function tear() {
      if (phase !== 'pack') return;
      setPhase('tearing'); ILL.sound.tear(); pack.classList.add('torn');
      setTimeout(() => {
        pack.remove();
        pulls.forEach((c, i) => stack.appendChild(h('div.stack-card', { style: { '--i': pulls.length - 1 - i } }, ILL.art.back(isBig(D.get(c.id).rarity.key) ? D.get(c.id).rarity.key : ''))));
        stage.appendChild(stack); setPhase('cards'); hint.textContent = 'Tap the cards to flip them one by one';
      }, 650);
    }
    function flipNext() {
      if (phase !== 'cards' || shown >= pulls.length) return;
      const c = pulls[shown], lv = D.get(c.id), rk = lv.rarity.key;
      shown++; ov.dataset.revealed = String(shown);
      hint.textContent = shown < pulls.length ? 'Card ' + shown + ' of ' + pulls.length + ' \u00b7 tap to flip the next one' : 'That\u2019s all 5!';
      const top = stack.lastElementChild; if (top) top.remove();
      const prev = stage.querySelector('.flip');
      if (prev) prev.remove();
      const flip = h('div.flip.r-' + rk, h('div.flip-in', h('div.face.f-back', ILL.art.back(isBig(rk) ? rk : '')),
        h('div.face.f-front', ILL.art.card(lv, { holo: c.holo, isNew: c.isNew }))),
        h('div.rar-pop', { style: { color: lv.rarity.color } }, (c.holo ? 'HOLO ' : '') + lv.rarity.name.toUpperCase() + (isBig(rk) ? '!' : '')));
      stage.appendChild(flip);
      ILL.sound.flip();
      requestAnimationFrame(() => requestAnimationFrame(() => flip.classList.add('open')));
      setTimeout(() => {
        ILL.sound.reveal(rk, c.holo);
        if (isBig(rk) || c.holo) burst(stage, lv.rarity.color, rk === 'mythic' ? 40 : 22);
        if (rk === 'mythic' || rk === 'legendary') { ov.classList.remove('shake', 'flash-mythic', 'flash-legendary'); void ov.offsetWidth; ov.classList.add('shake', 'flash-' + rk); }
      }, 260);
      row.appendChild(ILL.art.card(lv, { holo: c.holo, isNew: c.isNew, onclick: () => UI.cardInfo(c.id) }));
      if (shown === pulls.length) setTimeout(done, 500);
    }
    function revealAll() {
      if (phase === 'pack') { tear(); setTimeout(revealAll, 700); return; }
      while (phase === 'cards' && shown < pulls.length) flipNext();
    }
    function done() {
      setPhase('done'); stack.remove();
      const left = ILL.game.packState(ILL.store.doc, ILL.store.now()).total;
      ctrl.textContent = '';
      ctrl.append(...[h('p.po-hint', 'Added to your collection!'),
        left > 0 ? h('button.btn.primary', { type: 'button', id: 'againBtn', onclick: () => { close(); setTimeout(UI.openPackFlow, 60); } }, 'Open another (' + left + ' left)') : null,
        h('button.btn', { type: 'button', id: 'doneBtn', onclick: close }, 'Done')].filter(Boolean));
      const b = $('#againBtn') || $('#doneBtn'); if (b) b.focus();
    }
    function close() {
      ov.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey);
      UI.packOpen = false; ILL.render();
    }
    function onKey(e) {
      if (e.key === 'Escape' && phase === 'done') close();
      else if (e.key === ' ' || e.key === 'Enter') {
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;   // buttons handle their own keys
        e.preventDefault(); phase === 'pack' ? tear() : flipNext();
      }
    }
    document.addEventListener('keydown', onKey);
    // Drag across the top strip, or just tap.
    let sx = null;
    pack.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    pack.addEventListener('pointermove', (e) => { if (sx != null && Math.abs(e.clientX - sx) > 60) { sx = null; tear(); } });
    pack.addEventListener('click', tear);
    stage.addEventListener('click', () => { if (phase === 'cards') flipNext(); });   // tap anywhere on the cards
  };

  UI.cardInfo = function (id) {
    const lv = D.get(id); if (!lv) return;
    const mine = ILL.store && ILL.store.doc && ILL.store.doc.cards && ILL.store.doc.cards[id];
    const row = (k, v) => v == null || v === '' ? null : h('div.info-row', h('span', k), h('b', String(v)));
    ILL.u.modal(h('div.card-info',
      ILL.art.card(lv, { holo: mine && mine.holo > 0, locked: !mine }),
      h('div.info-text',
        h('h2', lv.name), h('p.muted', 'ILL #' + lv.rank + ' · ' + lv.rarity.name),
        row('Creators', (lv.creators || []).join(', ')), row('Status', lv.unbeaten ? 'Unbeaten' : 'Cleared'),
        row('Best run', D.bestText(lv)), row('Listed FPS', lv.fps), row('GD level ID', lv.gdId), row('Year', lv.year),
        row('You own', mine ? mine.n + ' (' + mine.holo + ' holo)' : 'Not yet'),
        h('p.links', lv.yt ? h('a.btn', { href: 'https://www.youtube.com/watch?v=' + lv.yt, target: '_blank', rel: 'noopener' }, 'Watch showcase') : null,
          h('a.btn.ghost', { href: 'https://impossiblelevels.com/level/' + lv.id, target: '_blank', rel: 'noopener' }, 'View on the ILL')))),
    { label: lv.name });
  };
})(window.ILL);
