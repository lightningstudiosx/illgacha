# Setting up ILL Gacha (step by step)

You only do this once. It takes about 15 minutes. Take your time, one step at a time.

Until you finish step 3 the site runs in **demo mode**: it pretends you are signed in and saves cards only
in your browser. That is fine for trying it out. You can also force demo mode any time by adding `?demo`
to the address, like `https://illgacha.kaifun.fun/?demo`.

---

## Step 1 - Turn on "Sign in with Google" in Firebase

1. Go to <https://console.firebase.google.com> and open your project **kaifun-wall**
   (the one that already runs your other game).
2. In the left menu click **Build -> Authentication**. If you see a **Get started** button, click it.
3. Click the **Sign-in method** tab.
4. Click **Google**, flip the **Enable** switch on, pick your email as the "support email", and click **Save**.

## Step 2 - Allow the new website address

1. Still in **Authentication**, click the **Settings** tab.
2. Click **Authorized domains**, then **Add domain**.
3. Type `illgacha.kaifun.fun` and click **Add**.
   (`localhost` is usually already there - leave it, it helps for testing.)

## Step 3 - Copy the web app config into `js/config.js`

1. Click the **gear icon** next to "Project Overview" (top left) -> **Project settings**.
2. Scroll down to **Your apps**.
   - If there is already a **Web app** (the `</>` icon), click it.
   - If not, click the `</>` button to add one. Name it `ILL Gacha`. You do **not** need Firebase Hosting. Click **Register app**.
3. You will see a block that looks like `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`.
4. Open `js/config.js` in this folder and replace each `PASTE_..._HERE` with the matching value
   (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
   Keep the quotes. The `databaseURL` line is already filled in.
5. Save the file.

> **Is it safe to put the apiKey in the website?** Yes. A Firebase `apiKey` is a *public name tag* for
> your project, not a password. Every Firebase website shows it. What keeps the data safe are the
> **database rules** in step 4.

## Step 4 - Paste the database rules (do not skip!)

Your database is shared with your other game, so the rules file in this folder contains **both**:
your other game's rules (copied exactly, nothing changed) **plus** the new `illgacha` rules.

1. In the Firebase console click **Build -> Realtime Database**, then the **Rules** tab.
2. Run `python -I tools/build_rules.py` (it makes the rules files, which stay on your PC only), then open `firebase/database.rules.json` from this folder, select everything (Ctrl+A), copy (Ctrl+C).
   - If you made secret codes (see "Making redeem codes" below), use
     `firebase/database.rules.with-codes.json` instead.
3. In the console, click inside the rules box, select everything, and paste (Ctrl+V) to replace it.
4. Click **Publish**.
5. Quick check: open your other game - it should still work exactly like before.

## Step 5 - Point `illgacha.kaifun.fun` at GitHub (GoDaddy DNS)

Your domain kaifun.fun is managed at GoDaddy (its nameservers are `domaincontrol.com`).

1. Sign in at <https://www.godaddy.com>, go to **My Products**, find **kaifun.fun**, and click **DNS**
   (or "Manage DNS").
2. Click **Add New Record** and fill in:
   - **Type:** `CNAME`
   - **Name:** `illgacha`
   - **Value:** `lightningstudiosx.github.io`
   - **TTL:** leave the default (1 hour is fine)
3. Click **Save**. It can take from a few minutes up to a few hours to start working.
   Don't change any other records.

## Step 6 - Put the site on GitHub Pages

1. On GitHub, create a **new public repository** (for example `illgacha`) under `lightningstudiosx`.
   Don't add a README there (this folder already has one).
2. Upload this folder to it. From this folder you can run:
   ```
   git remote add origin https://github.com/lightningstudiosx/illgacha.git
   git push -u origin main
   ```
   (`firebase/codes.local.json` and `firebase/database.rules.with-codes.json` are git-ignored on purpose -
   they never get uploaded.)
3. In the repository go to **Settings -> Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
5. Under **Custom domain** type `illgacha.kaifun.fun` and click **Save** (the `CNAME` file in this folder already says this).
6. When the DNS check turns green, tick **Enforce HTTPS**. (If it is greyed out, wait a little - GitHub
   needs to make the certificate first, sometimes up to an hour.)
7. Visit <https://illgacha.kaifun.fun> - click **Sign in with Google** and open your first pack!

---

## Making redeem codes (optional)

Codes give players free bonus packs (1, 2, 3, 5 or 10). The code itself is never stored in the website,
the repository or the database - only its SHA-256 "fingerprint" goes into the rules, which players can't read.

1. In this folder run: `python -I tools/add_code.py`
2. Type your code (at least 8 characters, e.g. a random word mix) and how many packs.
3. It saves the fingerprint in `firebase/codes.local.json` (private) and builds
   `firebase/database.rules.with-codes.json`.
4. Paste **that** file into the Rules tab and click **Publish** (like step 4).
5. Share the code with your players. Each player can use each code once.

Why not keep codes in the database? Your other game needs the whole database to be readable
(`".read": true` at the top), and in Firebase a read permission at the top can't be taken away lower down.
So anything in the database could be listed by anyone - the rules are the only private place.

## Admin panel

You (and only you) get an extra **Admin** tab when you sign in with your own Google account - the one written in
`firebase/admin.local.json` (kept only on your PC). Everyone else never sees the tab, and opening `#/admin` just says "Admin only".

**Do this once so it works:** the admin powers live in the new database rules, so **paste the rules again**:
open `firebase/database.rules.json` (or `firebase/database.rules.with-codes.json` if you made codes with
`tools/add_code.py` - then run `python -I tools/build_rules.py` first so that file is rebuilt), copy everything, and
paste it into **Firebase console -> Build -> Realtime Database -> Rules -> Publish**, exactly like step 4.
Until you do, the Admin tab still shows but every button says "The database said no".

What it can do:
- **Overview** - number of players, packs opened, cards collected, newest and most active players.
- **Players** - search by nickname or player id, sort, open a player to see their collection.
  On a player you can **give bonus packs**, **give any card** (search by name or ILL rank, optional holo),
  **remove them from the leaderboard**, **ban / unban** (a banned player sees a message and the database refuses
  all their changes) and **reset their progress** (asks first; can't be undone).
- **Codes** - make redeem codes right in the site: type one or press **Generate** (recommended), pick 1-10 packs,
  an optional use limit and expiry. Only the code's fingerprint is saved, but the database can be read by anyone,
  so always use long random codes (at least 8 characters; generated ones are 16). The code is shown **once** -
  copy it then. Codes from `tools/add_code.py` keep working too.
- **Site** - an **announcement** banner at the top of every page (pick a colour), and a **free pack for everyone**
  that each player can claim once while it runs.
- **Log** - every admin action is written to `illgacha/adminlog` (only you can add to it).

Try it without touching the real database: open `https://illgacha.kaifun.fun/?demo&admin` (demo mode pretending
you are the admin; nothing leaves your browser).

The website never contains your email - only its SHA-256 fingerprint (`adminHash` in `js/config.js`). The real
check is in the rules: only a signed-in Google account with that exact, verified email can do admin writes.
`firebase/admin.local.json` (the email) and every generated rules file are git-ignored, so they exist only on your PC
and never reach the public repository. If you ever change admin email, edit `firebase/admin.local.json`, run `python -I tools/build_rules.py`, update
`adminHash` (SHA-256 of the lower-case email) and paste the rules again.

## If something goes wrong

- **"Sign-in failed" / popup closes at once:** check step 2 (authorized domain) and that Google is enabled (step 1).
- **Popup blocked on a phone:** the site falls back to a full-page Google sign-in automatically. If Safari still
  refuses, try again in Chrome or allow popups for the site.
- **"Permission denied" when opening packs:** the rules from step 4 were not published, or an old copy was pasted.
- **Admin buttons say "The database said no":** paste the newest rules again (see "Admin panel").
- **Still in demo mode after step 3:** a `PASTE_..._HERE` value is left in `js/config.js`, or the address has `?demo`.
