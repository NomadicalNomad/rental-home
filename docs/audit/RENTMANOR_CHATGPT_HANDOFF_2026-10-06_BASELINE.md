# RentManor — ChatGPT handoff

RentManor is a simple phone-friendly rental-record manager for small portfolios and trusted family/partners/helpers. A shared account owns homes, current tenant contacts, expenses and private supporting files. It is a static browser PWA, not a tenant portal/payment platform. Use [RENTMANOR_PROJECT_REFERENCE.md](RENTMANOR_PROJECT_REFERENCE.md) for the complete feature inventory, workflow traces, evidence and limitations.

## Reviewed baseline

- Audit: October 6, 2026, America/Los_Angeles (PDT, UTC-07:00).
- Repository: C:\Users\Damon\Projects\rental-home; https://github.com/NomadicalNomad/rental-home.git.
- Branch main; commit 238cd2755c75741b6f69de0c4951d92c0cd88b41.
- No tracked/staged changes at audit start. Existing untracked _migration_tabs.sql and five rentmanor ZIP archives preserved; SQL matches tracked tabs migration. Archive names are not release proof.
- No applicable AGENTS.md found. Audit added documentation only; no application/config fixes, SQL, commit, push or deploy.

## Actual capabilities

| Feature IDs | Status and limits |
| --- | --- |
| RM-001–003 | Email/password auth, account invites/member display, searchable/filterable property list exist. Members edit/delete/restore; only owners invite. Multi-account switching incomplete. |
| RM-004–006 | Home CRUD, facts/utilities/trash and Property/Tenant/Expenses tabs with draft prompts exist; optional clearing/compatibility persistence gaps. |
| RM-007–012 | Gallery (ten-photo client cap), primary cover, appliances, one current tenant, device contact shortcuts, one lease and saved correspondence image/PDF copies exist. Separate uploads/row writes can fail halfway. No actual mail integration. |
| RM-013–015 | Expense CRUD, all-time USD totals, receipt, browser CSV/PDF/share/save exist. No live CRUD/upload validation; export fidelity gaps. |
| RM-016–017 | Property-only JSON backup/replacement restore and old-browser-record append import exist. Restore deletes child metadata; import can duplicate. |
| RM-018–021 | Public read-only sample with fixtures, PWA shell, errors and marketing pages exist. Sample startup depends on config/CDN; offline behavior unverified; privacy/terms are explicit stubs. |

Complete workflow availability is **Unknown**: source inspection and helper tests do not prove backend deployment. Public roots returned HTTP 200/Netlify; served app.js and sw.js exactly matched local text. Those assets are confirmed served; full release/commit, migration and live integration are unverified. No browser workflow was manually exercised.

## Architecture and operations

Vanilla HTML/CSS/ES modules, no bundler/build script. app/app.js owns UI/state/CRUD; auth.js loads Supabase JS 2.112.3 from jsDelivr and handles sessions/accounts/invites; property-row/property-tabs map records/build HTML; media.js uploads/compresses/signs files; export.js hand-builds CSV/PDF; errors.js formats feedback. Static marketing site lives in site/.

Supabase Auth -> PostgREST/RPC -> Postgres and private account-media Storage. Core tables: accounts, account_members, account_invites, properties, expenses, receipts, property_photos, property_appliances, tenants, tenant_files. RLS checks account membership, sample SELECT only; private objects use account UUID prefix. Child parent/account consistency needs isolated DB tests. No custom server, edge functions, webhooks, jobs, payments or outgoing message service found.

Netlify root publish/empty build with host rewrites to site/ or app/; www to apex. GoDaddy DNS tasks assigned to Damon in existing docs, actual records unverified. GitHub Pages fallback uses same repo. Deployed commit, Supabase migration/provider/bucket settings, stage environment, monitoring/backup plan unknown. Runtime window.RENTAL_HOME_CONFIG.supabaseUrl/supabaseAnonKey from inline config and app/config.js; SUPABASE_URL/SUPABASE_ANON_KEY examples are not automatically read from .env. Never include credentials/keys/tokens/customer data in handoffs.

Local documented startup: configure an isolated copy, python3 -m http.server 8000 (Windows py alternative), /site/ and /app/. Localhost alone does not isolate backend: committed/inline config can point at a real project. Old-schema upgrade order: photos/expenses/sample migration, then property/tenant tabs migration with personal backfill. Do not run production SQL to validate this reference.

## Established decisions and conflicts

RentManor branding/rental-home slug; small portfolios/trusted people; owners/members with editing; fresh personal accounts empty; sample never copied; one current tenant; gallery primary drives list; private storage; property-only backups and no receipt binaries in exports; Netlify preferred/Pages fallback. Site positioning explicitly excludes payments, maintenance tickets, maps-as-product, large management firms and App Store installs. Do not invent commitments to add these.

README understates gallery/appliances/tenant files and omits tabs upgrade guidance. README shared-password guidance conflicts with terms keep-password-private. SQL demo three homes versus local fixture four/different IDs. Backup UI's files-stay-online wording does not describe loss of references/child records. Treat these as unresolved discrepancies, not silently resolved design decisions.

## Highest-priority gaps

1. **Restore data loss:** replacement deletes all child rows while JSON only saves properties; contacts/one cover reference recreated, expenses/receipts/appliances/gallery/lease/correspondence metadata lost. Source-confirmed; no production incident verified.
2. **Invite checks:** signup trigger omits target-email comparison; acceptance RPC reuses already-accepted token until expiry. Source-confirmed checks/semantics; intended policy and live exploit unverified.
3. **Account/parent integrity:** independent FKs plus row-account-only RLS may allow inconsistent parent relationships. Suspected issue; adversarial disposable DB tests needed.
4. **Persistence/failures:** optional fields cannot reliably clear; older-schema retry silently drops extras; independent row/storage/mirror updates and ignored error objects risk partial results/orphans.
5. **Coverage/operations:** live auth/RLS/files/restore, multi-membership reload, iPhone/offline/cache updates and export fidelity untested. CSV formulas/PDF character/pagination limits, empty expense amount becomes zero, client-only receipt/gallery limits.

These are audit recommendations, not authorized fixes. Full reference lists GAP-001–013 and source symbols.

## Checks and open questions

Node v24.15.0; npm test (node --test tests/*.test.mjs): **30 passed, zero failed**. All 11 app/root JavaScript files passed node --check. Tests are offline helpers/fixtures/markup/source/SQL-text assertions; no live RLS or integration proof. Four read-only public static GETs, two JS text matches, migration SHA-256 comparison, archive metadata and clean tracked diffs checked. Sandbox startup failed; approved escalated shell used. No real records or production changes.

Damon input required: authoritative Netlify release and Supabase migration/config? Single-use/reusable and email-restricted invite policy? Multiple portfolios/account switching? Backup scope and member destructive-restore rights? Shared-password policy? Support/deletion/retention/recovery/monitoring ownership? Galleries/tabs migration and optional sample media deployed?

## Keeping documents current

After future work update BOTH documents in the same pass: retain RM/GAP identifiers; revise behaviors, workflow/evidence, schema/config changes and gaps; record date/timezone/branch/commit/uncommitted work. Keep implementation, test verification and deployment evidence separate. Add exact test environment/results; never promote helper/mocked tests to live proof. Resolve choices with actual Damon approval/evidence, update coverage/unknowns, regenerate timestamped copies of both files in Windows-resolved Downloads and compare hashes. No commit/push/deploy implied by document maintenance.
