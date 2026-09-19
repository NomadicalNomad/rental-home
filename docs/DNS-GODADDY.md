# GoDaddy DNS for rentmanor.com

Damon owns the GoDaddy clicks. This file is the exact record list after the site is connected to **Netlify** (preferred). Do not change nameservers unless you choose Netlify DNS instead.

GitHub Pages keeps working until these records propagate:

- Marketing: https://nomadicalnomad.github.io/rental-home/ → `site/`
- App: https://nomadicalnomad.github.io/rental-home/app/

## 0. One-time in Netlify (before GoDaddy)

1. Sign in at [netlify.com](https://app.netlify.com).
2. **Add new site → Import an existing project** → GitHub → `NomadicalNomad/rental-home`.
3. Build settings:
   - **Build command:** leave empty
   - **Publish directory:** `.` (repo root)
4. After the first deploy, open **Domain management → Add a domain**.
5. Add these, in order:
   - `rentmanor.com` (apex)
   - `www.rentmanor.com`
   - `app.rentmanor.com`
6. Netlify will show a site hostname like `something-something-123.netlify.app`. Copy that exact hostname. You will paste it into the CNAME values below.

If Netlify shows different record values than this page, **use Netlify’s values**. They win.

## 1. Open DNS in GoDaddy

1. Go to [godaddy.com](https://www.godaddy.com) and sign in.
2. Open **My Products**.
3. Find **rentmanor.com** → click **DNS** (or the domain → **DNS** tab).
4. You should see the **DNS Records** table.

## 2. Records to add or edit

Replace `YOUR-SITE.netlify.app` with the hostname from step 0.

| Type | Name / Host | Value | TTL |
|------|-------------|-------|-----|
| **A** | `@` | `75.2.60.5` | 1 Hour (or default) |
| **CNAME** | `www` | `YOUR-SITE.netlify.app` | 1 Hour |
| **CNAME** | `app` | `YOUR-SITE.netlify.app` | 1 Hour |

What those do:

- `@` (apex `rentmanor.com`) → Netlify load balancer
- `www` → apex via Netlify (this repo then 301s www → https://rentmanor.com)
- `app` → the PWA at https://app.rentmanor.com

### Exact clicks for each row

**Apex A record**

1. If an **A** row already exists for `@` or `rentmanor.com`, click **Edit**.
2. Otherwise click **Add New Record** → **A**.
3. **Name:** `@`
4. **Value / Points to:** `75.2.60.5`
5. Save.

**Delete leftover apex A records.** Netlify SSL fails if `@` has more than one A record. Remove parked-page IPs (common leftover: `Parked`, `Forwarded`, or a second A like `99.83.190.102`).

**www CNAME**

1. If a **CNAME** or **Forwarding** row already exists for `www`, edit or delete the forwarding first.
2. **Add New Record** → **CNAME** (or Edit).
3. **Name:** `www`
4. **Value / Points to:** `YOUR-SITE.netlify.app` (no `https://`)
5. Save.

**app CNAME**

1. **Add New Record** → **CNAME**.
2. **Name:** `app`
3. **Value / Points to:** `YOUR-SITE.netlify.app` (same hostname as www)
4. Save.

## 3. Leave these alone

- Do **not** change nameservers (`ns*.domaincontrol.com`) if you are using External DNS like this.
- Do **not** add a CNAME on `@`. GoDaddy apex must be the **A** record above (GoDaddy does not offer ALIAS).
- Do **not** put the `service_role` key anywhere.
- MX / email records: leave them if rentmanor.com already receives mail.

## 4. After saving

1. Back in Netlify → Domain management, wait until each hostname shows HTTPS / issued (can take minutes to a few hours, rarely up to 48 hours).
2. Check:
   - https://rentmanor.com/ → marketing home
   - https://www.rentmanor.com/ → should land on the apex
   - https://app.rentmanor.com/ → Sign in / Create account (RentManor), **not** “This copy isn’t connected yet”
3. In Supabase → **Authentication → URL configuration**:
   - **Site URL:** `https://app.rentmanor.com`
   - **Redirect URLs:** `https://app.rentmanor.com/**`, `https://nomadicalnomad.github.io/rental-home/app/**`, `http://localhost:8000/**`

## Cloudflare Pages alternative

If you use Cloudflare Pages instead of Netlify:

1. Create a Pages project from the same GitHub repo, publish `.`.
2. Add custom domains `rentmanor.com`, `www.rentmanor.com`, `app.rentmanor.com`.
3. In GoDaddy, point:

| Type | Name | Value |
|------|------|-------|
| CNAME | `@` | `YOUR-PROJECT.pages.dev` (GoDaddy may call this CNAME flattening; if `@` CNAME is rejected, use the A/AAAA values Cloudflare shows) |
| CNAME | `www` | `YOUR-PROJECT.pages.dev` |
| CNAME | `app` | `YOUR-PROJECT.pages.dev` |

Host-based folder splits (`site/` vs `app/`) are in `netlify.toml`. On Cloudflare Pages you would add the same rules in a `_redirects` file or two Pages projects (`site/` and `app/`). Prefer Netlify so the committed `netlify.toml` applies as-is.

## Fallback until DNS is live

Keep using GitHub Pages:

- https://nomadicalnomad.github.io/rental-home/ (marketing → `site/`)
- https://nomadicalnomad.github.io/rental-home/app/ (PWA)
