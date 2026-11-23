// Drawn-in-code art: the logo, player cube icons, card faces, card backs and placeholder thumbnails.
(function (ILL) {
  'use strict';
  const { h, hashStr } = ILL.u;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (markup, cls) => {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    const el = t.content.firstChild;
    if (cls) el.setAttribute('class', cls);
    return el;
  };

  // The ILL Gacha mark: a cracked cube with an RGB-split glitch, plus the word mark.
  const MARK = '<g><rect x="6" y="6" width="52" height="52" rx="9" fill="#0d0a1c" stroke="currentColor" stroke-width="4"/>' +
    '<rect x="18" y="18" width="28" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="3" opacity=".8"/>' +
    '<path d="M36 4 L28 24 L38 30 L24 60" fill="none" stroke="#07050f" stroke-width="6" stroke-linejoin="round"/>' +
    '<path d="M36 4 L28 24 L38 30 L24 60" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g>';
  function logo(withText) {
    const w = withText ? 236 : 64;
    return svg('<svg xmlns="' + NS + '" viewBox="0 0 ' + w + ' 64" role="img" aria-label="ILL Gacha">' +
      '<g transform="translate(-2 1)" style="color:#2ef2ff" opacity=".85">' + MARK + '</g>' +
      '<g transform="translate(2 -1)" style="color:#ff2fb3" opacity=".85">' + MARK + '</g>' +
      '<g style="color:#f3f0ff">' + MARK + '</g>' +
      (withText ? '<text x="72" y="44" class="logo-ill" fill="#ff2fb3" transform="translate(2 0)">ILL</text>' +
        '<text x="72" y="44" class="logo-ill" fill="#2ef2ff" transform="translate(-2 0)">ILL</text>' +
        '<text x="72" y="44" class="logo-ill" fill="#f3f0ff">ILL</text>' +
        '<text x="140" y="43" class="logo-gacha" fill="#f3f0ff">GACHA</text>' +
        '<rect x="140" y="49" width="88" height="4" fill="url(#lg)"/><defs><linearGradient id="lg"><stop offset="0" stop-color="#2ef2ff"/>' +
        '<stop offset="1" stop-color="#ff2fb3"/></linearGradient></defs>' : '') + '</svg>', 'logo');
  }

  // Player icons: 16 original cube faces (8 colour pairs x 2 faces).
  const PAIRS = [['#2ef2ff', '#1b2a6b'], ['#ff2fb3', '#4a0d3b'], ['#ffd23f', '#6b3b00'], ['#33e08a', '#0b4a2a'],
    ['#b65cff', '#2a0f55'], ['#ff6a3d', '#5a1500'], ['#f3f0ff', '#33304a'], ['#3a9bff', '#0a2550']];
  function cube(i, size) {
    const [a, b] = PAIRS[i % 8];
    const face = i < 8
      ? '<rect x="17" y="22" width="8" height="10" fill="' + b + '"/><rect x="39" y="22" width="8" height="10" fill="' + b + '"/><rect x="20" y="40" width="24" height="5" fill="' + b + '"/>'
      : '<path d="M15 26 l10 -5 v8 z M49 26 l-10 -5 v8 z" fill="' + b + '"/><path d="M20 42 q12 8 24 0" stroke="' + b + '" stroke-width="5" fill="none"/>';
    return svg('<svg xmlns="' + NS + '" viewBox="0 0 64 64" width="' + (size || 40) + '" height="' + (size || 40) + '" aria-hidden="true">' +
      '<rect x="3" y="3" width="58" height="58" rx="6" fill="' + b + '"/><rect x="8" y="8" width="48" height="48" rx="3" fill="' + a + '"/>' + face + '</svg>', 'cube');
  }

  // Placeholder thumbnail when a level has no video (or the image fails): gradient + spikes + name.
  function placeholder(lv) {
    const x = hashStr(lv.name + lv.id);
    const h1 = x % 360, h2 = (h1 + 40 + (x >> 9) % 120) % 360;
    const spikes = Array.from({ length: 9 }, (_, i) => {
      const s = 8 + ((x >> (i % 16)) & 7) * 3, px = i * 36 + ((x >> i) & 15);
      return '<path d="M' + px + ' 180 l' + s / 2 + ' -' + s * 1.6 + ' l' + s / 2 + ' ' + s * 1.6 + 'z" fill="#07050f" opacity=".75"/>';
    }).join('');
    const name = lv.name.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return svg('<svg xmlns="' + NS + '" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="g' + x + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + h1 + ' 85% 45%)"/>' +
      '<stop offset="1" stop-color="hsl(' + h2 + ' 80% 18%)"/></linearGradient></defs><rect width="320" height="180" fill="url(#g' + x + ')"/>' +
      '<g opacity=".18" stroke="#fff">' + [40, 80, 120, 160, 200, 240, 280].map((v) => '<path d="M' + v + ' 0v180"/>').join('') + '</g>' + spikes +
      '<text x="160" y="92" text-anchor="middle" class="ph-text">' + name + '</text></svg>', 'ph');
  }

  function artFor(lv) {
    const box = h('div.card-art');
    const src = ILL.data.thumb(lv);
    if (!src) { box.appendChild(placeholder(lv)); return box; }
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: 'false' });
    img.addEventListener('error', () => { img.replaceWith(placeholder(lv)); }, { once: true });
    box.appendChild(img);
    return box;
  }

  // A full card face. opts: {holo, count, locked, isNew, onclick}
  function card(lv, opts) {
    const o = opts || {};
    const r = lv.rarity;
    const status = lv.unbeaten ? h('span.status.unbeaten', 'UNBEATEN') : h('span.status.cleared', 'CLEARED');
    const el = h((o.onclick ? 'button' : 'div') + '.card.r-' + r.key + (o.holo ? '.holo' : '') + (o.locked ? '.locked' : ''),
      { 'data-id': lv.id, type: o.onclick ? 'button' : null, onclick: o.onclick || null,
        'aria-label': (o.locked ? 'Not collected: ' : '') + lv.name + ', ILL #' + lv.rank + ', ' + r.name + (o.holo ? ', holo' : '') },
      h('div.card-in',
        h('div.card-top', h('span.rank', '#' + lv.rank), h('span.rar', r.name)),
        artFor(lv),
        h('div.card-name', lv.name),
        h('div.card-by', 'by ' + ILL.data.creators(lv)),
        h('div.card-best', ILL.data.bestText(lv)),
        h('div.card-foot', status, lv.fps ? h('span.fps', lv.fps + ' FPS') : null)),
      o.holo ? h('div.holo-layer') : null,
      o.count > 1 ? h('span.count', '×' + o.count) : null,
      o.isNew ? h('span.new', 'NEW') : null,
      o.locked ? h('span.lock', { 'aria-hidden': 'true' }, '?') : null);
    return el;
  }

  function back(rarityKey) {
    return h('div.card.back' + (rarityKey ? '.hint-' + rarityKey : ''), h('div.card-in', logo(false), h('span.back-txt', 'ILL GACHA')));
  }

  // Holo cards shimmer with the pointer.
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.card.holo');
    if (!c) return;
    const b = c.getBoundingClientRect();
    c.style.setProperty('--mx', ((e.clientX - b.left) / b.width * 100).toFixed(1) + '%');
    c.style.setProperty('--my', ((e.clientY - b.top) / b.height * 100).toFixed(1) + '%');
  }, { passive: true });

  ILL.art = { logo, cube, card, back, placeholder, svg };
})(window.ILL);
