# RentManor

RentManor is a simple iPhone Home Screen app for managing rentals — for you and the people you trust. Each account’s properties stay private. Invite a partner or helper to the same account when you want to share.

The GitHub repo slug stays `rental-home`. The user-facing name is **RentManor**.

**Tagline:** Your properties. Your people.

## Live URLs

After DNS (Damon / GoDaddy — see [`docs/DNS-GODADDY.md`](docs/DNS-GODADDY.md)):

- Marketing: https://rentmanor.com/ (`www` → apex)
- App (Sign in / Create account): https://app.rentmanor.com/

Until DNS is live, GitHub Pages still works:

- Marketing: https://nomadicalnomad.github.io/rental-home/ → `site/`
- App: https://nomadicalnomad.github.io/rental-home/app/

## Create an account

1. Open the app in Safari (or a desktop browser): https://app.rentmanor.com/ (or the github.io `/app/` URL above).
2. If you tapped **Create account** / **Get started** on the site, you land on **Create your RentManor account** (`/app/#signup`). **Sign in** links stay on Welcome back (`/app/` or `/app/#signin`).
3. Enter an email and a password (at least 6 characters).
4. You land on **Your properties**. Those homes belong only to this account.

Share a portfolio by **invite**, not by handing out the password.

## Invite / share

The owner taps **Account → Invite someone**. Optionally type their email, then **Create invite link**. Send the link or the short code. They create their own sign-in (or sign in) and then see the same homes.

Invites work for 14 days. They join as a **member** of *this* account: they can view and edit the same properties you do (including add and delete). They do not get a copy of someone else’s properties. Only the owner can send invites. Invites are for people you trust with this portfolio.

Prefer not to invite? Two people can sign in with the same email and password, but invite is the clearer way to share.

## Forgot password

On **Sign in**, tap **Forgot password?** and enter the account email. The app emails a reset link (`resetPasswordForEmail`) that returns to the same app origin you opened — github.io `/app/` or `https://app.rentmanor.com/`. After you choose a new password, you’re signed in.

Those destinations must stay on the Supabase **Redirect URLs** list (see Configure below).

## Add to Home Screen (iPhone)

Until DNS is live, use the working app URL in Safari (not Chrome):

1. Open https://nomadicalnomad.github.io/rental-home/app/ in Safari (not Chrome). When rentmanor.com / app.rentmanor.com are live, open https://app.rentmanor.com/ instead.
2. Tap the Share button.
3. Tap Add to Home Screen.
4. Tap Add.

On a computer, bookmark the site. Home Screen install is for iPhone Safari.

## Backup & restore

- **Account → Backup & restore** downloads a JSON file of the signed-in account.
- Restoring a JSON file **replaces properties in the signed-in account only**.
- After sign-in, if this phone still has the old on-device list, the app offers a **one-time import** into the account.

Sample Folsom homes are added only for a brand-new empty account (not on every sign-in).

There are **no demo logins** and nothing auto-signs anyone into a shared QA mailbox. A signed-in screen on `/app/` means this browser already had a Supabase session in `localStorage`. On a shared computer used for screenshots, tap **Account → Sign out** first so the next person is not left in someone else’s portfolio.

## How to configure (Damon)

This app talks to **Supabase** (email/password auth + Postgres + row-level security). There are no demo logins in the repo.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL editor:** paste and run `supabase/schema.sql`.
3. **Authentication → Providers → Email:** enable Email. For simplest sign-up, turn **Confirm email** off (otherwise she must click a mail link).
4. **Authentication → URL configuration:**
   - Site URL: `https://app.rentmanor.com`
   - Redirect URLs: that origin, `https://nomadicalnomad.github.io/rental-home/app/**`, and `http://localhost:8000/**`
5. **Settings → API:** copy **Project URL** and the **anon public** key. Never copy `service_role`.
6. `cp app/config.example.js app/config.js` and paste those two values. Same names are listed in `.env.example`.
7. GitHub Pages only serves committed files. Because the anon key is public (RLS is what protects data), add `app/config.js` with:

   ```bash
   git add -f app/config.js
   git commit -m "Add public Supabase anon config for Pages"
   git push
   ```

8. Reload the app URL. You should see **Sign in / Create account**, not “This copy isn’t connected yet”.

`.gitignore` ignores `.env`, `config.js`, and `config.local.js`. Do not commit `service_role`.

Production `app/index.html` also inlines the same public `window.RENTAL_HOME_CONFIG` values so a missing or service-worker-blocked `config.js` cannot wall visitors. `app/config.js` still loads afterward and can override.

## Files

- `site/` — marketing pages for rentmanor.com (home, how it works, who it’s for, privacy, terms). `site/app-cta.js` rewrites Create account → `/app/#signup` and Sign in → `/app/#signin` on github.io.
- `app/` — PWA for app.rentmanor.com (`index.html`, `styles.css`, `app.js`, `auth.js`, `manifest.json`, `sw.js`, `icons/`, `config.js`)
- `app/config.example.js`, `.env.example` — how to point the PWA at Supabase
- `supabase/schema.sql` — tables, RLS, invite functions
- `netlify.toml` — host-based routing (`site/` on apex, `app/` on `app.`)
- `docs/DNS-GODADDY.md` — exact GoDaddy records Damon must add
- `rental-home.code-workspace` — VS Code / Cursor workspace

## Run locally

```bash
cd rental-home
cp app/config.example.js app/config.js   # then paste your URL + anon key
python3 -m http.server 8000
```

Open:

- http://localhost:8000/site/ — marketing
- http://localhost:8000/app/ — app (a static server is needed for the service worker; it won’t register from `file://`)

Without `config.js` *and* without the inline production values, the app shows a clear setup message and does not invent credentials.

## Deploy

- **GitHub Pages (fallback):** branch `main` / root. `/` redirects to `site/`. App is at `/app/`.
- **Netlify (preferred for rentmanor.com):** publish directory = repo root, empty build command. `netlify.toml` rewrites apex → `site/` and `app.rentmanor.com` → `app/`. Then follow [`docs/DNS-GODADDY.md`](docs/DNS-GODADDY.md).

## Privacy

Tenant contact info lives in your Supabase project, isolated per account by RLS. Treat JSON backups like any file with tenant contact info.
