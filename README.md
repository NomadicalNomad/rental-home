# RentManor

RentManor is a static browser/Home Screen app for small rental portfolios: properties, facts/utilities/trash, galleries, appliances, one current tenant, lease/correspondence copies, expenses and receipts. The repository slug remains rental-home. Your properties. Your people.

This remediation is prepared on codex/rentmanor-complete-remediation. It has NOT been deployed or applied to production. See docs/RENTMANOR_COMPLETE_REMEDIATION_SUMMARY.md for exact tests and blockers and docs/RELEASE_RECOVERY_RUNBOOK.md for upgrade, release and rollback procedures.

## Use and share

Open https://app.rentmanor.com/; Create account opens signup. Complete email confirmation if required by the provider. New accounts start empty. Each person uses an individual sign-in. Owners create, inspect and revoke invitation links; optionally restrict them to an email. New links are cryptographically random, expire after 14 days and are consumed once by a confirmed identity. Legacy short links require manual reissue after the migration. No invitation emails are automatically sent.

Owners and trusted members can view, edit, delete and completely replace their shared account's records. Only owners administer invitations. Account selection lists actual memberships and remembers the selection for that user. Never share passwords or invite a person who should not have these destructive permissions.

Open https://app.rentmanor.com/#/sample for three read-only sample homes. They are never copied into private accounts. The local sample also works without configuration or the SDK CDN. Private edits require a connection; the cached shell is not an offline private database.

For iPhone Home Screen installation, open **app.rentmanor.com** in Safari, tap Share, Add to Home Screen, Add. Physical iPhone camera/install/sharing behavior still needs device verification; automated mobile-width Chromium/WebKit tests are not a physical iPhone test.

## Files and recovery

Each property supports up to ten gallery photos, one primary cover, appliance notes, one current tenant, one lease and saved correspondence copies. Each expense has at most one receipt. Uploads use unique paths; replacements commit metadata before retiring original bytes. Failed cleanup retains unreferenced files for scoped operator review. Database constraints enforce account/parent integrity and the gallery/receipt limits.

Photos are compressed to JPEG (up to 450 KiB); source images are limited to 15 MiB. PDFs are limited to 8 MiB in normal upload forms. Private Storage limits objects to 10 MiB and supported JPEG/PNG/WebP/GIF/PDF formats. File signatures are checked in the client; hosted Storage MIME validation is not arbitrary-content antivirus/decoder validation. Convert unsupported HEIC/HEIF to JPEG if the browser cannot decode it.

Account → Backup & restore downloads a version-2 **complete recovery archive**, containing canonical records from all seven content tables and every referenced private file with counts/SHA-256 checksums. Missing files, inconsistent snapshots and unsupported media prevent a complete export. Archives contain sensitive tenant/property information, are not encrypted by the app, and must be privately stored.

Complete replacement previews the archive, downloads a verified recovery point of the current account, requires REPLACE, stages/verifies incoming files, and commits rows transactionally. Original files remain for operator rollback. Browser limits: 5,000 homes, 50,000 rows per table, 70 MiB binary data, 100 MiB JSON. Larger portfolios require operator export. No automatic backup service is configured.

Version-1/object/array property files and older device lists are limited non-destructive imports. They preserve existing children/records, deduplicate provenance fingerprints, preview conflicts and do not recreate omitted attachments. Older device source records are retained.

Expense CSV/PDF reports contain the selected property's expenses, not receipt binaries. CSV neutralizes formula-leading text with an apostrophe. PDF embeds Noto Sans, wraps long text and paginates; unsupported scripts/emoji produce an actionable CSV alternative.

## Setup and tests

Use Node 22 or newer:

    npm ci
    npm test
    npx playwright install chromium webkit
    npm run test:browser
    node scripts/build-static.mjs

The browser test harness serves null backend configuration and blocks all remote requests. PostgreSQL tests use disposable PGlite with synthetic Auth/Storage tables. These are meaningful SQL tests, not full Supabase provider integration or independent-session concurrency proof. The runbook lists required isolated Supabase release tests.

For local development, serve the repository with a static server, for example python -m http.server 8000, then open http://localhost:8000/app/#/sample. For private local tests, back up your public config, copy app/config.example.js to app/config.js and explicitly configure a DISPOSABLE project with environment='local' and localhost in allowedHosts. The committed production configuration is rejected on localhost. Do not use production as a test environment. Restore intended deployment configuration before packaging.

app/config.js is the only configuration source. index.html has no inline backend configuration; .env.example is not consumed by the static browser. The Supabase anon key is public and protected by server RLS; never place a service-role key or access token in browser files.

New database installations apply supabase/schema.sql. Tabs-enabled existing installations apply the new complete-remediation migration only after compatibility checks and verified record/media backups. Pre-tabs installations use the documented forward bridge; historical tabs migration has a reproduced seed/backfill collision. **Read docs/RELEASE_RECOVERY_RUNBOOK.md before any upgrade.** Do not rewrite/delete conflicting production data automatically.

## Release and operations

Netlify uses netlify.toml, builds through scripts/build-static.mjs and publishes dist (curated app/site files only). GitHub Pages main/root remains the historical fallback. Branch publication is separate from merging/deployment. Frontend and database upgrades must be coordinated. No production migration, deployment, DNS change or test email was performed here.

    node scripts/verify-backup.mjs <private-archive.json>
    node scripts/health-check.mjs https://app.rentmanor.com/

These checks are manual mechanisms, not configured monitoring or scheduled backups. Operator identity/contact, support intake, retention and account deletion policy need owner approval. Privacy and terms are explicitly marked drafts. The runbook supplies scoped deletion/recovery procedures; the app has no self-service account deletion or published support address.

Current documentation: docs/RENTMANOR_PROJECT_REFERENCE.md; docs/RENTMANOR_CHATGPT_HANDOFF.md; docs/RENTMANOR_COMPLETE_REMEDIATION_SUMMARY.md; docs/RELEASE_RECOVERY_RUNBOOK.md; docs/THIRD_PARTY_NOTICES.md. Historical audit copies are preserved under docs/audit and do not describe the current code.
