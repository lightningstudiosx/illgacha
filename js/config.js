// ILL Gacha settings. The ONLY file you need to edit after copying your Firebase web app config.
// Firebase console -> Project settings -> Your apps -> Web app -> "SDK setup and configuration" -> Config.
// The apiKey is a public identifier for the project (it is meant to be in web pages), NOT a password.
// Your data is protected by the database rules in firebase/database.rules.json, not by hiding this key.
window.ILL_CONFIG = {
  firebase: {
    apiKey: 'PASTE_API_KEY_HERE',
    authDomain: 'PASTE_AUTH_DOMAIN_HERE',          // usually kaifun-wall.firebaseapp.com
    databaseURL: 'https://kaifun-wall-default-rtdb.firebaseio.com',
    projectId: 'PASTE_PROJECT_ID_HERE',            // usually kaifun-wall
    storageBucket: 'PASTE_STORAGE_BUCKET_HERE',
    messagingSenderId: 'PASTE_SENDER_ID_HERE',
    appId: 'PASTE_APP_ID_HERE'
  },
  firebaseSdk: '10.12.2',      // pinned Firebase JS SDK version (compat build from gstatic)
  packEveryMs: 600000,         // 1 free pack every 10 minutes (must match tools/build_rules.py)
  maxStored: 10,               // up to 10 packs pile up while you are away
  cardsPerPack: 5,
  // Demo mode only (?demo or while the config above is still placeholder). These are SHA-256 hashes of
  // test codes, never real codes. Real codes live only in your private rules (see tools/add_code.py).
  demoCodes: {
    '66ec0288c7314f4a6b8ff844d16984354ddd15a5d3129d220f907105cf68c779': 3,   // test-only code used by tests/test_site.py
  }
};
