# Rental Home

A simple iPhone Home Screen PWA for a small rental portfolio. Each **account** has its own homes. Account A never sees Account B. Two people can share one account.

Live site: https://nomadicalnomad.github.io/rental-home/

## Create an account

1. Open the site in Safari (or a desktop browser).
2. Tap **Create an account**.
3. Enter an email and a password (at least 6 characters).
4. You land on **Your properties**. Those homes belong only to this account.

It is okay if Mom and a helper both use the **same email and password**. That is the simplest way to share.

## Invite / share

Two ways to let a second person see the same portfolio:

1. **Shared sign-in** — give them the same email and password.
2. **Invite** — the owner taps **Account → Invite someone**. Optionally type their email, then **Create invite link**. Send the link or the short code. They create their own sign-in (or sign in) and then see the same homes.

Invites work for 14 days. They join as a member of *this* account; they do not get a copy of someone else’s properties.

## Add to Home Screen (iPhone)

1. Open the hosted URL in **Safari** (not Chrome).
2. Tap **Share → Add to Home Screen → Add**.
3. Open the new icon. Sign in once; stay signed in on that phone.

## Backup & restore

- **Account → Backup & restore** downloads a JSON file of the signed-in account.
- Restoring a JSON file **replaces properties in the signed-in account only**.
- After sign-in, if this phone still has the old on-device list, the app offers a **one-time import** into the account.

Sample Folsom homes are added only for a brand-new empty account (not on every sign-in).

## How to configure (Damon)

This app talks to **Supabase** (email/password auth + Postgres + row-level security). There are no demo logins in the repo.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL editor:** paste and run `supabase/schema.sql`.
3. **Authentication → Providers → Email:** enable Email. For Mom-simple sign-up, turn **Confirm email** off (otherwise she must click a mail link).
4. **Authentication → URL configuration:**
   - Site URL: `https://nomadicalnomad.github.io/rental-home`
   - Redirect URLs: that origin and `http://localhost:8000/**`
5. **Settings → API:** copy **Project URL** and the **anon public** key. Never copy `service_role`.
6. `cp config.example.js config.js` and paste those two values. Same names are listed in `.env.example`.
7. GitHub Pages only serves committed files. Because the anon key is public (RLS is what protects data), add `config.js` with:

   ```bash
   git add -f config.js
   git commit -m "Add public Supabase anon config for Pages"
   git push
   ```

8. Reload the Pages URL. You should see **Sign in**, not “This copy isn’t connected yet”.

`.gitignore` ignores `.env`, `config.js`, and `config.local.js`. Do not commit `service_role`.

## Files

- `index.html`, `styles.css`, `app.js`, `auth.js` — app
- `config.example.js`, `.env.example` — how to point the PWA at Supabase
- `supabase/schema.sql` — tables, RLS, invite functions
- `manifest.json`, `sw.js`, `icons/` — PWA install / offline shell
- `rental-home.code-workspace` — VS Code / Cursor workspace

## Run locally

```bash
cd rental-home
cp config.example.js config.js   # then paste your URL + anon key
python3 -m http.server 8000
```

Open http://localhost:8000 — a static server is needed for the service worker (it won’t register from `file://`).

Without `config.js`, the app shows a clear setup message and does not invent credentials.

## Deploy

- **GitHub Pages:** branch `main` / root. After `config.js` is present (force-added), the hosted app can sign people in.
- **Netlify:** publish directory = repo root, empty build command. Same `config.js` need.

## Privacy

Tenant contact info lives in your Supabase project, isolated per account by RLS. Treat JSON backups like any file with tenant contact info.
