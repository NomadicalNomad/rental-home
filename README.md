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
2. Tap **Create an account**.
3. Enter an email and a password (at least 6 characters).
4. You land on **Your properties**. A new account starts empty — add your first rental when you are ready.

It is okay if Mom and a helper both use the **same email and password**. That is the simplest way to share.

To see how the app looks with example homes, tap **View sample** (or open `/#/sample`). The sample is read only. It is not copied into your account. Use **Back to my account** to return.

## Invite / share

Two ways to let a second person see the same portfolio:

1. **Shared sign-in** — give them the same email and password.
2. **Invite** — the owner taps **Account → Invite someone**. Optionally type their email, then **Create invite link**. Send the link or the short code. They create their own sign-in (or sign in) and then see the same homes.

Invites work for 14 days. They join as a member of *this* account; they do not get a copy of someone else’s properties.

## Add to Home Screen (iPhone)

1. Open rentmanor.com in Safari (not Chrome).
2. Tap the Share button.
3. Tap Add to Home Screen.
4. Tap Add.

Until DNS is live, the same steps work from the GitHub Pages URLs (Safari, not Chrome):

- Marketing: https://nomadicalnomad.github.io/rental-home/
- App icon / sign-in: https://nomadicalnomad.github.io/rental-home/app/

On a computer, bookmark the site. Home Screen install is for iPhone Safari.

## Backup & restore

- **Account → Backup & restore** downloads a JSON file of the signed-in account.
- Restoring a JSON file **replaces properties in the signed-in account only**.
- After sign-in, if this phone still has the old on-device list, the app offers a **one-time import** into the account.
- JSON backups cover properties. Photos and receipts stay in private Storage; a full media zip is out of scope for v1.

New accounts start with **zero** properties. Folsom sample homes appear only in shared sample mode at `/#/sample` (logical account `00000000-0000-4000-8000-000000000001`). They are never copied into a personal account.

## Sample portfolio

Anyone can open the shared demo without signing in:

- App: https://app.rentmanor.com/#/sample
- GitHub Pages: https://nomadicalnomad.github.io/rental-home/app/#/sample

A sticky **SAMPLE · Read only** banner stays on list, detail, and expense. Writes are hidden. Exit with **Back to my account** (signed in) or **Sign in** / **Create account**. There is no “load sample into my account” button. The demo homes also ship as local files so `#/sample` works before sample SQL is applied.

## Photos, expenses, receipts

On a property you own:

- Add, replace, or remove one primary photo (camera or library). It shows on the list and the detail screen.
- Track expenses (date, amount, category, notes) with an all-time total.
- Export that property’s expenses as CSV or PDF, then **Share…** or **Save file**. Receipt files are not included.
- Attach one receipt per expense — camera, photo library, or PDF — then view or remove it.

Photos and receipts live in the private `account-media` bucket:

- Thumbnail: `{account_id}/properties/{property_id}/thumbnail` (+ extension)
- Receipt: `{account_id}/properties/{property_id}/expenses/{expense_id}/{receipt_id}` (+ extension)

## Ops — run the photos/expenses SQL on live

**Builder is applying this in parallel. Live personal Add home / photos / expenses will fail until it lands.**

If the project already applied an older `supabase/schema.sql`, run `supabase/migrations/20260919_photos_expenses_sample.sql` in the Supabase SQL editor (safe to re-run; does not wipe personal accounts or auto-seed Folsom into them). New projects can paste the current `supabase/schema.sql` instead.

That SQL adds `properties.thumbnail_path`, `expenses`, `receipts`, private `account-media`, and the shared sample account. Until it is applied, Add home without a photo still works (the app omits the empty thumbnail column). Saving a photo or expense needs the new columns. The app now shows “This app update needs a database update — contact support” (or the real PostgREST message) instead of a generic “Something went wrong.”

## How to configure (Damon)

This app talks to **Supabase** (email/password auth + Postgres + row-level security). There are no demo logins in the repo.

1. Create a free project at [supabase.com](https://supabase.com).
2. **SQL editor:** paste and run `supabase/schema.sql` (full setup). If this project already ran an older schema, run `supabase/migrations/20260919_photos_expenses_sample.sql` instead. Either file adds photos/expenses tables and does **not** wipe personal accounts or auto-seed Folsom into them.
3. **Storage:** confirm a **private** bucket named `account-media` exists (the SQL tries to create it). If the insert was skipped:
   1. Dashboard → **Storage → New bucket**
   2. Name: `account-media`
   3. Public: **off**
   4. Re-run the SQL so the path policies attach
4. **Optional sample media:** upload files from `supabase/sample-media/` into `account-media` using the `storage_path` values in the migration. The app also ships the same files as a sample-only fallback.
5. **Authentication → Providers → Email:** enable Email. For simplest sign-up, turn **Confirm email** off (otherwise she must click a mail link).
6. **Authentication → URL configuration:**
   - Site URL: `https://app.rentmanor.com`
   - Redirect URLs: that origin, `https://nomadicalnomad.github.io/rental-home/app/**`, and `http://localhost:8000/**`
7. **Settings → API:** copy **Project URL** and the **anon public** key. Never copy `service_role`.
8. `cp app/config.example.js app/config.js` and paste those two values. Same names are listed in `.env.example`.
9. GitHub Pages only serves committed files. Because the anon key is public (RLS is what protects data), add `app/config.js` with:

   ```bash
   git add -f app/config.js
   git commit -m "Add public Supabase anon config for Pages"
   git push
   ```

10. Reload the app URL. You should see **Sign in / Create account**, not “This copy isn’t connected yet”. Then open `/#/sample` to confirm the shared portfolio loads.

`.gitignore` ignores `.env`, `config.js`, and `config.local.js`. Do not commit `service_role`.

Production `app/index.html` also inlines the same public `window.RENTAL_HOME_CONFIG` values so a missing or service-worker-blocked `config.js` cannot wall visitors. `app/config.js` still loads afterward and can override.

## Files

- `site/` — marketing pages for rentmanor.com (home, how it works, who it’s for, privacy, terms)
- `app/` — PWA for app.rentmanor.com (`index.html`, `styles.css`, `app.js`, `auth.js`, `errors.js`, `property-row.js`, `media.js`, `export.js`, `manifest.json`, `sw.js`, `icons/`, `sample-media/`, `config.js`)
- `app/config.example.js`, `.env.example` — how to point the PWA at Supabase
- `supabase/schema.sql` — tables, RLS, invite functions, sample seed, storage policies
- `supabase/migrations/20260919_photos_expenses_sample.sql` — incremental SQL if the older schema is already applied
- `supabase/sample-media/` — optional upload set for the shared sample bucket prefix
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
- http://localhost:8000/app/#/sample — shared read-only sample

Without `config.js` *and* without the inline production values, the app shows a clear setup message and does not invent credentials.

## Deploy

- **GitHub Pages (fallback):** branch `main` / root. `/` redirects to `site/`. App is at `/app/`.
- **Netlify (preferred for rentmanor.com):** publish directory = repo root, empty build command. `netlify.toml` rewrites apex → `site/` and `app.rentmanor.com` → `app/`. Then follow [`docs/DNS-GODADDY.md`](docs/DNS-GODADDY.md).

## Privacy

Tenant contact info, photos, and receipts live in your Supabase project, isolated per account by RLS. The sample portfolio is a separate read-only account. Treat JSON backups like any file with tenant contact info.
