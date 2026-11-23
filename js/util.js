// Small helpers shared by every page. Everything lives on window.ILL.
window.ILL = window.ILL || {};
window.ILL.pages = window.ILL.pages || {};
(function (ILL) {
  'use strict';
  const NOW = { '.sv': 'timestamp' };           // "server time" placeholder, like Firebase ServerValue.TIMESTAMP

  // h('div.card.big', {onclick}, child, 'text', [more]) -> element
  function h(tag, attrs, ...kids) {
    const [name, ...cls] = tag.split('.');
    const el = document.createElement(name || 'div');
    if (cls.length) el.className = cls.join(' ');
    if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c == null || c === false) return;
      if (Array.isArray(c)) c.forEach(add);
      else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // localStorage that never throws (private windows, blocked storage, quota...)
  const mem = {};
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : fallback; }
    },
    set(k, v) {
      mem[k] = v;
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memory copy is enough */ }
    },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  async function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Codes are case/space-insensitive: " ill-gacha 1 " == "ILL-GACHA1". Must match tools/add_code.py.
  const normCode = (s) => String(s || '').toUpperCase().replace(/\s+/g, '');
  const codeHash = (code) => sha256('illgacha:' + normCode(code));

  // Fair random numbers from the browser's crypto generator.
  function rand() {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296;
  }

  // Apply a multi-path patch {'a/b/c': value} to a plain object tree (null deletes). NOW -> now.
  function applyPatch(tree, patch, now) {
    const fix = (v) => (v && v['.sv'] === 'timestamp') ? now
      : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v;
    for (const path in patch) {
      const segs = path.split('/').filter(Boolean);
      let node = tree;
      for (let i = 0; i < segs.length - 1; i++) {
        if (!node[segs[i]] || typeof node[segs[i]] !== 'object') node[segs[i]] = {};
        node = node[segs[i]];
      }
      const v = fix(patch[path]);
      if (v == null) delete node[segs[segs.length - 1]]; else node[segs[segs.length - 1]] = v;
    }
    return tree;
  }

  const fmt = (n) => Number(n || 0).toLocaleString('en-US');
  const pct = (a, b) => (b ? Math.floor((a / b) * 1000) / 10 : 0);
  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60), r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }
  function hashStr(s) {           // tiny stable hash for colours / placeholders
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
    return x >>> 0;
  }

  let toastTimer = 0;
  function toast(msg, kind) {
    let el = $('#toast');
    if (!el) { el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'show ' + (kind || '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3200);
  }

  function modal(content, opts) {
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); if (opts && opts.onclose) opts.onclose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const box = h('div.modal-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': (opts && opts.label) || 'Dialog' },
      h('button.modal-x', { 'aria-label': 'Close', onclick: close }, '×'), content);
    const wrap = h('div.modal', { onclick: (e) => { if (e.target === wrap) close(); } }, box);
    document.body.appendChild(wrap);
    document.addEventListener('keydown', onKey);
    setTimeout(() => { const b = box.querySelector('button:not(.modal-x), input') || box.querySelector('button'); if (b) b.focus(); }, 30);
    return close;
  }

  ILL.u = { NOW, h, $, $$, store, sha256, normCode, codeHash, rand, applyPatch, fmt, pct, clock, hashStr, toast, modal };
})(window.ILL);
