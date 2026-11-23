// Real backend: Firebase Authentication (Google) + Realtime Database, compat SDK from gstatic (pinned version).
(function (ILL) {
  'use strict';
  function loadScript(src) {
    return new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src; s.async = false; s.crossOrigin = 'anonymous';
      s.onload = ok; s.onerror = () => fail(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }

  function FirebaseStore() {
    const cfg = window.ILL_CONFIG;
    const base = 'https://www.gstatic.com/firebasejs/' + cfg.firebaseSdk + '/';
    let fb = null, auth = null, db = null, offset = 0, doc = null, docRef = null, ready = false;
    const listeners = [];
    const emit = () => listeners.forEach((f) => f());
    const isPhone = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

    // Turn our NOW placeholders into Firebase server timestamps.
    const conv = (v) => (v && v['.sv'] === 'timestamp') ? fb.database.ServerValue.TIMESTAMP
      : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)])) : v;

    const S = {
      mode: 'firebase',
      user: null,
      get doc() { return doc; },
      get ready() { return ready; },
      now: () => Date.now() + offset,
      async start(onChange) {
        listeners.push(onChange);
        try {
          await loadScript(base + 'firebase-app-compat.js');
          await loadScript(base + 'firebase-auth-compat.js');
          await loadScript(base + 'firebase-database-compat.js');
        } catch (e) { ILL.u.toast('Could not reach Firebase. Check your internet and refresh.', 'bad'); throw e; }
        fb = window.firebase;
        fb.initializeApp(cfg.firebase);
        auth = fb.auth(); db = fb.database();
        db.ref('.info/serverTimeOffset').on('value', (s) => { offset = s.val() || 0; });
        auth.getRedirectResult().catch((e) => ILL.u.toast('Sign-in failed: ' + (e.message || e.code), 'bad'));
        auth.onAuthStateChanged((u) => {
          if (docRef) { docRef.off(); docRef = null; }
          doc = null;
          S.user = u ? { uid: u.uid, name: u.displayName || 'Player' } : null;   // the name is only a suggestion, never saved as-is
          ready = !u;
          if (u) {
            docRef = db.ref('illgacha/users/' + u.uid);
            docRef.on('value', (snap) => { doc = snap.val(); ready = true; emit(); },
              (err) => ILL.u.toast('Database error: ' + err.code, 'bad'));
          }
          emit();
        });
      },
      async signIn() {
        const provider = new fb.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
          await auth.signInWithPopup(provider);
        } catch (e) {
          const fallback = ['auth/popup-blocked', 'auth/operation-not-supported-in-environment', 'auth/web-storage-unsupported'];
          if (fallback.includes(e.code) || (isPhone() && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request')) {
            return auth.signInWithRedirect(provider);
          }
          if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
        }
      },
      signOut: () => auth.signOut(),
      update(patch) {
        const out = {};
        for (const k in patch) out[k] = conv(patch[k]);
        return db.ref('illgacha').update(out);
      },
      async board(field, n) {
        const q = db.ref('illgacha/leaderboard').orderByChild(field);
        const snap = await (field === 'best' ? q.limitToFirst(n || 50) : q.limitToLast(n || 50)).once('value');
        const rows = [];
        snap.forEach((c) => { rows.push(Object.assign({ uid: c.key }, c.val())); });
        rows.sort((a, b) => field === 'best' ? a.best - b.best : b[field] - a[field]);
        return rows;
      }
    };
    return S;
  }

  ILL.FirebaseStore = FirebaseStore;
  ILL.isDemo = function () {
    const c = (window.ILL_CONFIG || {}).firebase || {};
    const placeholder = !c.apiKey || /PASTE/.test(c.apiKey + c.appId + c.authDomain + c.projectId);
    return placeholder || /[?&]demo\b/.test(location.search) || /[#&?]demo\b/.test(location.hash);
  };
})(window.ILL);
