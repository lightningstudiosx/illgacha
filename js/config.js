// ILL Gacha settings. The ONLY file you need to edit after copying your Firebase web app config.
// Firebase console -> Project settings -> Your apps -> Web app -> "SDK setup and configuration" -> Config.
// The apiKey is a public identifier for the project (it is meant to be in web pages), NOT a password.
// Your data is protected by the database rules in firebase/database.rules.json, not by hiding this key.
window.ILL_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyAXEDOzOAz9QBPQSjhOCVgtJ6VllSh9B_A',
    authDomain: 'kaifun-wall.firebaseapp.com',
    databaseURL: 'https://kaifun-wall-default-rtdb.firebaseio.com',
    projectId: 'kaifun-wall',
    storageBucket: 'kaifun-wall.firebasestorage.app',
    messagingSenderId: '443917138607',
    appId: '1:443917138607:web:9b5327e8f19be8a1b0f25a'
  },
  firebaseSdk: '10.12.2',      // pinned Firebase JS SDK version (compat build from gstatic)
  packEveryMs: 600000,         // 1 free pack every 10 minutes (must match tools/build_rules.py)
  maxStored: 10,               // up to 10 packs pile up while you are away
  cardsPerPack: 5,
  // Admin panel: SHA-256 of the owner's lower-cased Google email (the address itself is NOT in the website).
  // The database rules (tools/build_rules.py + the git-ignored firebase/admin.local.json) are what really decide who is admin.
  adminHash: 'a75d0916cbd81bf1a0c9a0fad48d9efe251586441c888e2dbd43af9ff3d945ff',
  // Demo mode only (?demo or while the config above is still placeholder). These are SHA-256 hashes of
  // test codes, never real codes. Real codes live only in your private rules (see tools/add_code.py).
  demoCodes: {
    '66ec0288c7314f4a6b8ff844d16984354ddd15a5d3129d220f907105cf68c779': 3,   // test-only code used by tests/test_site.py
  }
};
