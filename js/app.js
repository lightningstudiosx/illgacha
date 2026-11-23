// Boot, header/nav, hash router.
(function (ILL) {
  'use strict';
  const { h, $ } = ILL.u;
  ILL.pages = ILL.pages || {};
  const ICONS = {
    home: 'M3 11 12 3l9 8v10h-6v-6H9v6H3z',
    collection: 'M4 4h7v9H4zM13 4h7v6h-7zM13 12h7v8h-7zM4 15h7v5H4z',
    index: 'M5 3h11l3 3v15H5zM8 8h8M8 12h8M8 16h5',
    craft: 'M12 2l3 6 6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z',
    leaderboard: 'M4 20V10h4v10zM10 20V4h4v16zM16 20v-7h4v7z',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6z',
    admin: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zM8.5 12l2.5 2.5 4.5-5'
  };
  const NAV = [['', 'Home', 'home', 'Home'], ['collection', 'Collection', 'collection', 'Cards'], ['index', 'Index', 'index', 'Index'],
    ['craft', 'Crafting', 'craft', 'Craft'], ['leaderboard', 'Leaderboard', 'leaderboard', 'Top 50'], ['profile', 'Profile', 'profile', 'Profile'],
    ['admin', 'Admin', 'admin', 'Admin']];   // the Admin link stays hidden unless the signed-in account is the admin
  const icon = (k) => ILL.art.svg('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + ICONS[k] + '"/></svg>', 'nav-ico');

  let current = null, cleanup = null;
  const route = () => (location.hash.replace(/^#\/?/, '').split(/[?&/]/)[0] || '');

  function navLinks(cls) {
    return h('nav.' + cls, { 'aria-label': cls === 'tabs' ? 'Pages' : 'Main' },
      NAV.map(([r, label, ic, short]) => h('a', { href: '#/' + r, 'data-route': r, 'aria-label': label, hidden: r === 'admin' ? true : null },
        icon(ic), h('span', cls === 'tabs' ? short : label))));
  }

  function shell() {
    const app = $('#app');
    app.textContent = '';
    const mute = h('button.icon-btn', { id: 'mute', type: 'button', 'aria-label': 'Sound on/off', title: 'Sound on/off', onclick: () => {
      ILL.sound.setMuted(!ILL.sound.muted); paintMute(); if (!ILL.sound.muted) ILL.sound.click();
    } });
    app.append(...[
      ILL.isDemo() ? h('div.demo-banner', { role: 'note' }, h('b', 'DEMO MODE'), ' — a pretend player' + (ILL.store.user.isAdmin ? ' (pretending to be the admin)' : '') + '; progress is saved only in this browser.') : null,
      h('div', { id: 'banners' }),
      h('header.top', h('a.brand', { href: '#/', 'aria-label': 'ILL Gacha home' }, ILL.art.logo(true)), navLinks('main-nav'),
        h('div.top-right', h('span.pack-pill', { id: 'packPill', title: 'Free packs ready' }), mute, h('a.user-chip', { id: 'userChip', href: '#/profile' }))),
      h('main', { id: 'view', tabindex: '-1' }),
      h('footer.foot', h('p', 'Level data from the ', h('a', { href: 'https://impossiblelevels.com', target: '_blank', rel: 'noopener' }, 'Impossible Levels List'),
        ' (impossiblelevels.com) · snapshot ' + String(ILL.data.meta.fetched || '').slice(0, 10) + ' · thumbnails from each level’s YouTube showcase.'),
      h('p', 'Fan-made and free: no money, no ads, no purchases. Not affiliated with the ILL team or RobTop Games. ',
        h('a', { href: '#/about' }, 'About & credits'), ' · made by ', h('a', { href: 'https://kaifun.fun', target: '_blank', rel: 'noopener' }, 'Kai.fun'))),
      navLinks('tabs')].filter(Boolean));
    paintMute();
  }

  function paintMute() {
    const b = $('#mute'); if (!b) return;
    b.textContent = ILL.sound.muted ? '\u{1F507}' : '\u{1F50A}';
    b.setAttribute('aria-pressed', String(ILL.sound.muted));
  }

  function paintHeader() {
    const s = ILL.store, pill = $('#packPill'), chip = $('#userChip');
    if (pill) {
      const ps = s.doc && s.doc.packs ? ILL.game.packState(s.doc, s.now()) : null;
      pill.textContent = ps ? ps.total + ' pack' + (ps.total === 1 ? '' : 's') : '';
      pill.hidden = !ps;
    }
    if (chip) {
      chip.textContent = '';
      const p = s.doc && s.doc.profile;
      if (p) chip.append(ILL.art.cube(p.icon, 26), h('span', p.name));
      else chip.append(h('span', s.user ? '…' : 'Sign in'));
    }
    document.querySelectorAll('[data-route]').forEach((a) => a.classList.toggle('on', a.dataset.route === current));
    const admin = !!(s.user && s.user.isAdmin);
    document.querySelectorAll('[data-route="admin"]').forEach((a) => { a.hidden = !admin; });
    paintBanners();
  }

  // Site-wide strips under the header: "you are banned", the admin's announcement, and the free pack for everyone.
  ILL.state = { announce: null, freepack: null, banned: null };
  let bannerSig = '';
  const dismissed = () => ILL.u.store.get('illgacha.dismissed', 0);
  function paintBanners() {
    const box = $('#banners'); if (!box) return;
    const st = ILL.state, a = st.announce, gift = ILL.game.freeGift();
    const showA = a && a.text && a.t !== dismissed();
    const sig = JSON.stringify([st.banned, showA ? a : 0, gift ? gift.id + ':' + gift.packs : 0]);
    if (sig === bannerSig) return;
    bannerSig = sig;
    box.textContent = '';
    if (st.banned) box.append(h('div.site-banner.ban', { id: 'banBanner', role: 'alert' }, h('b', 'Your account is banned.'),
      h('span', (st.banned.reason ? ' Reason: ' + st.banned.reason + '.' : '') + ' You can look around, but you can’t open packs or save changes.')));
    if (showA) {
      const color = /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#2ef2ff';
      box.append(h('div.site-banner.announce', { id: 'announceBanner', role: 'status', style: { '--ac': color } }, h('span.ann-dot'), h('span.ann-text', a.text),
        h('button.banner-x', { type: 'button', 'aria-label': 'Hide this message', onclick: () => { ILL.u.store.set('illgacha.dismissed', a.t); paintBanners(); } }, '×')));
    }
    if (gift) {
      const btn = h('button.btn.small.primary', { type: 'button', id: 'claimGift', onclick: async () => {
        btn.disabled = true;
        try { const n = await ILL.game.claimFree(); if (n) { ILL.sound.coin(); ILL.u.toast('+' + n + ' bonus pack' + (n > 1 ? 's' : '') + '!', 'good'); } }
        catch (e) { ILL.sound.error(); ILL.u.toast(e.message || 'Could not claim it.', 'bad'); btn.disabled = false; }
      } }, 'Claim');
      box.append(h('div.site-banner.gift', { id: 'giftBanner' }, h('span', '\u{1F381} ', h('b', 'Free gift for everyone:'), ' ' + gift.packs + ' bonus pack' + (gift.packs > 1 ? 's' : '') + '!'), btn));
    }
  }

  function render() {
    const name = ILL.pages[route()] ? route() : '';
    const page = ILL.pages[name];
    const view = $('#view'); if (!view) return;
    if (cleanup) { try { cleanup(); } catch (e) { /* ignore */ } cleanup = null; }
    const changed = name !== current;
    current = name;
    view.textContent = '';
    document.title = (page.title ? page.title + ' · ' : '') + 'ILL Gacha';
    cleanup = page.render(view) || null;
    paintHeader();
    if (changed) { window.scrollTo(0, 0); }
  }
  ILL.render = render;
  ILL.paintHeader = paintHeader;

  async function boot() {
    try { await ILL.data.load(); } catch (e) {
      $('#app').textContent = 'Could not load the level list. Please refresh. (' + e.message + ')'; return;
    }
    ILL.store = ILL.isDemo() ? ILL.LocalStore() : ILL.FirebaseStore();
    shell();
    window.addEventListener('hashchange', render);
    let first = true, lastSig = '', banUid = null, banOff = null;
    const watchBan = () => {
      const u = ILL.store.user ? ILL.store.user.uid : null;
      if (u === banUid) return;
      if (banOff) banOff();
      banUid = u; banOff = null; ILL.state.banned = null;
      if (u) banOff = ILL.store.watch('bans/' + u, (v) => { const was = !!ILL.state.banned; ILL.state.banned = v || null; if (was !== !!v) render(); else paintHeader(); });
    };
    ILL.store.start(async () => {
      watchBan();
      if (ILL.ui && ILL.ui.packOpen) { paintHeader(); return; }     // don't redraw under the pack animation
      try { if (await ILL.game.ensureUser()) return; } catch (e) { ILL.u.toast('Could not create your save: ' + e.message, 'bad'); }
      // "still" pages (home, profile, leaderboard) update themselves; redraw them only when who/whether-loaded changes
      const sig = (ILL.store.user ? ILL.store.user.uid + (ILL.store.user.isAdmin ? '*' : '') : '') + '|' + (ILL.store.doc && ILL.store.doc.packs ? 1 : 0);
      if (first || sig !== lastSig || !ILL.pages[current] || !ILL.pages[current].still) render(); else paintHeader();
      first = false; lastSig = sig;
    }).then(() => {
      ILL.store.watch('announce', (v) => { ILL.state.announce = v; paintBanners(); });
      ILL.store.watch('freepack', (v) => { ILL.state.freepack = v; paintBanners(); });
    }).catch(() => render());
    render();
    setInterval(paintHeader, 1000);
  }
  document.addEventListener('DOMContentLoaded', boot);
})(window.ILL);
