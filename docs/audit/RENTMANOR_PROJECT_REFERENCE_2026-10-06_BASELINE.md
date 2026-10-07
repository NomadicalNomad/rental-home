# RentManor project reference

RentManor helps people with small rental portfolios keep property facts, current tenant contacts, expenses and supporting files in one phone-friendly account. Trusted helpers can join that account and edit its records. A public read-only sample demonstrates the interface. The product is a static progressive web app with Supabase authentication, database and private file storage.

## Table of contents

- [Baseline](#baseline)
- [Surfaces and permissions](#surfaces-and-permissions)
- [Feature inventory](#feature-inventory)
- [Workflows](#workflows)
- [Architecture and database](#architecture-and-database)
- [Operations](#operations)
- [Intent and discrepancies](#intent-and-discrepancies)
- [Prioritized remaining work](#prioritized-remaining-work)
- [Verification](#verification)
- [Maintenance](#maintenance)
- [Audit coverage](#audit-coverage)

## Baseline

| Item | Evidence |
| --- | --- |
| Audit date and timezone | October 6, 2026; America/Los_Angeles, PDT (UTC-07:00). Copy timestamps use this zone. |
| Checkout | C:\Users\Damon\Projects\rental-home |
| Product/repository | RentManor / rental-home, verified against README, app titles, package.json and remote. |
| Sanitized remote | https://github.com/NomadicalNomad/rental-home.git |
| Branch / commit | main / 238cd2755c75741b6f69de0c4951d92c0cd88b41 |
| Tracked changes before audit | None, including staged changes. |
| Existing untracked files | _migration_tabs.sql; rentmanor-local-refresh.zip; rentmanor-netlify-live.zip; rentmanor-netlify-tabs.zip; rentmanor-netlify-v13.zip; rentmanor-netlify-v14.zip. Preserved. |
| AGENTS.md | None found in repository including hidden paths or ancestors C:\, C:\Users, C:\Users\Damon, C:\Users\Damon\Projects. |
| Related repositories | No separate repository established. GitHub Pages fallback uses this same repository. |
| Related services | Supabase, Netlify, GitHub/Pages, GoDaddy DNS, jsDelivr SDK CDN. Cloudflare Pages is only a documented alternative. |
| Deployed release/commit | Unknown; no hosting-console release-to-commit proof obtained. |

The untracked SQL is byte-identical by SHA-256 to supabase/migrations/20260919_property_tenant_tabs.sql: 7474C8C81A97E66E576026B5CFF7A6CBF11AB13CFB5FAC21016EE26428183115. ZIP metadata was read without extraction: local-refresh, netlify-live and netlify-tabs contain 67 entries each; v13 and v14 contain 64 each; all contain app/app.js. Archive names do not establish deployment or authoritative source.

Read-only HTTP GETs to https://rentmanor.com/ and https://app.rentmanor.com/ returned 200 with Server: Netlify. Public app.js and sw.js returned 200 and response text exactly matched local app/app.js and app/sw.js. This confirms those two static resources at observation time, not a deployed commit, full asset match, backend migration or working integration. The web browsing tool could not access the roots; shell HTTP checks succeeded. No authenticated/customer API was queried.

Evidence paths below are repository-relative; symbols are stable anchors and line references refer to this commit. Source-confirmed findings describe code behavior, not verified production incidents. Suspected issues need isolated runtime/database verification. Recommendations are audit suggestions, not previously agreed requirements.

Implementation uses Implemented / Partial / Placeholder / Documented plan only. Verification uses Code inspected / Automated test passed / Manually exercised / Not verified. Availability uses Confirmed deployed / Local only / Disabled by configuration / Unknown. Backend workflow availability remains Unknown even when static frontend resources were served. No browser workflow was manually exercised.

## Surfaces and permissions

Marketing pages: site/index.html, features.html (How it works), for-whom.html, privacy.html and terms.html. Navigation/CTAs link to the app and substitute the Pages fallback when on github.io. Create account and Sign in use the same app root, which initially chooses sign-in. Policy pages explicitly call themselves short product stubs.

App surfaces: setup, loading, sign-in/signup, property list, add-home form, detail and expense views; Property / Tenant / Expenses detail tabs; account, invitation, backup/restore and legacy-import modals; camera/library/PDF sheets, export sheets, confirmations, image lightbox and toasts. Navigation is DOM view switching. Parsed sample hash routes are #/sample, #/sample/{propertyId}, #/sample/{propertyId}/expense/{expenseId}. Private detail pages have no equivalent durable URL routing. Invitations use ?invite=TOKEN or #invite=TOKEN, captured to sessionStorage. No manual invite-code input was found.

| Actor | Actual access |
| --- | --- |
| Visitor | Marketing, authentication forms and read-only sample. Anonymous backend SELECT intended for sample only. |
| Owner | Portfolio/file CRUD, exports, destructive restore, legacy import, member display and owner-only invite creation. |
| Member | Same portfolio editing/delete/restore as owner; cannot create invites. No viewer role. |
| Tenant | Stored current contact, not an authentication role; no tenant login/portal. |
| Operator | Manual Supabase/hosting/DNS operations in documentation; no in-app administrator console. |

Membership/RLS is the intended security boundary. Client canWrite() only excludes sample/no-account contexts, so hidden controls do not replace server authorization. Multiple account memberships exist, but no account switcher was discovered: pickAccount() chooses accepted-invite preference, otherwise owner membership, otherwise first membership.

## Feature inventory

Verification below is deliberately narrow. Existing tests inspect helpers, fixtures, markup and SQL/source patterns; they do not execute live RLS, auth, uploads or CRUD. IDs should remain stable.

| ID | Capability | Implementation | Verification | Availability |
| --- | --- | --- | --- | --- |
| RM-001 | Signup, sign-in, sessions, sign-out | Implemented | Code inspected | Unknown |
| RM-002 | Account invitation and membership display | Partial | Code inspected | Unknown |
| RM-003 | Property list, search and vacancy filters | Implemented | Code inspected; Automated test passed (scope helper) | Unknown |
| RM-004 | Add/edit/delete homes and occupancy | Partial | Code inspected; Automated test passed (row mapping) | Unknown |
| RM-005 | Home facts, utilities and trash notes | Partial | Code inspected; Automated test passed (mapping/markup) | Unknown |
| RM-006 | Three tabs, sticky context, draft prompts | Implemented | Code inspected; Automated test passed (markup/source) | Unknown |
| RM-007 | Gallery and primary photo | Partial | Code inspected; Automated test passed (paths/MIME/markup) | Unknown |
| RM-008 | Appliance list | Implemented | Code inspected; Automated test passed (sample/markup) | Unknown |
| RM-009 | One current tenant and vacancy transition | Partial | Code inspected; Automated test passed (sample/markup) | Unknown |
| RM-010 | Device Call/Text/Email shortcuts | Implemented | Code inspected; Automated test passed (markup) | Unknown |
| RM-011 | Lease copy upload/view/replace/remove | Implemented | Code inspected; Automated test passed (path) | Unknown |
| RM-012 | Saved correspondence copies | Implemented | Code inspected; Automated test passed (path/markup) | Unknown |
| RM-013 | Expense ledger and totals | Partial | Code inspected | Unknown |
| RM-014 | Expense receipt attachment | Partial | Code inspected; Automated test passed (MIME helper) | Unknown |
| RM-015 | Expense CSV/PDF and device sharing | Partial | Code inspected; Automated test passed (sharing helper) | Unknown |
| RM-016 | Property JSON backup/restore | Partial | Code inspected | Unknown |
| RM-017 | Legacy on-device import | Partial | Code inspected | Unknown |
| RM-018 | Public read-only sample/fallback | Partial | Code inspected; Automated test passed (fixtures/scoping) | Unknown |
| RM-019 | Home Screen install/shell caching | Partial | Code inspected; Automated test passed (cache name) | Confirmed deployed: worker asset only; installation/offline unverified |
| RM-020 | Friendly errors and feedback | Implemented | Code inspected; Automated test passed | Unknown |
| RM-021 | Marketing and policy pages | Partial; policies Placeholder | Code inspected; roots HTTP checked | Confirmed deployed: public roots only; individual policy content unverified |

### RM-001 — Accounts

People enter email/password confirmation (minimum six characters), optional account name, sign in and sign out through Account. auth.js signUp/signIn/startAuth (312/306/444) uses Supabase Auth, signup metadata account_name/invite_token, persisted localStorage session and auto-refresh. SQL handle_new_user creates owner account/membership or joins invite; ensure_my_account repairs missing account establishment. Reads account_members joined to accounts. Requires valid browser config, CDN SDK, Email provider and schema. Enabled email confirmation adds an external email step. No reset/change-password, email change, MFA UI, account rename/delete or member removal screen was discovered; PASSWORD_RECOVERY events are ignored by queueSession().

### RM-002 — Sharing

Owner Account -> Invite someone shows peers, accepts optional target email and calls create_invite. Eight uppercase UUID-derived characters, 14-day expiry; Copy link uses Clipboard API with prompt fallback. Receiver follows link and signs up/in; stored token goes to accept_invite; email-matching invitations can be auto-claimed. Reads/writes account_invites/account_members/accounts. No outgoing email sender, invite revocation/list-management UI, manual code-entry or role editing. Member can edit and destructively restore portfolio. Signup trigger lacks target-email comparison present in RPC; accept_invite does not reject already-accepted tokens before expiry. Account selection is incomplete for multiple portfolios. Evidence: auth.js captureInviteFromUrl/establishAccount/createInvite/inviteUrl/listMembers; app.js openInvitePanel/submitInvite (2435/2460); schema.sql handle_new_user/claim_pending_invites/create_invite/accept_invite (406/471/593/638).

### RM-003 — Portfolio

Owners/members view address/location, occupied/vacant, mirrored tenant-name text, positive monthly USD rent and primary image. In-memory case-insensitive search covers address/city/state/ZIP/tenant name; All/Occupied/Vacant filters and match counts. Empty account offers Add home and sample. Reads properties scoped by account_id and filtered again by rowsForAccount; media needs signed URLs. No pagination, remote search, income chart or financial dashboard. Evidence: app.js loadProperties/renderList (368/924), account-scope.js rowsForAccount; account-isolation tests validate pure scope helpers, not database policies.

### RM-004 — Property lifecycle

Members add required address/city/state/ZIP/status, optional rent/notes/facts/photo; ZIP five digits or ZIP+4, rent finite/nonnegative. Occupied home may exist before tenant; creation proceeds to tenant tab. Existing detail form edits facts; delete confirms, collects known object paths, deletes property and cascaded children then attempts storage cleanup. Data: properties and descendants. Missing-column retry strips optional columns; values can silently fail to persist. Clearing optional fields omits them from updates, leaving existing stored values. Photo failure can follow successful home insert. Forms use novalidate and explicit validation is narrower than HTML attributes. Evidence: app.js writePropertyRows/readForm/readPropertyDetail/submitForm/deleteProperty (284/1181/1191/1305/1358); property-row.js toPropertyRow.

### RM-005 — Facts and utilities

Property tab groups Basics, Utilities & trash, Appliances and Photos with collapsible optional sections. Address/rent, beds/baths, square feet/year built/type/description/notes, electric/gas/water companies, utility responsibilities and trash schedule/notes persist on properties. House/Townhome/Multi labels map to Single family/Townhouse/Multi-family. Manually entered notes only; no MLS, utility integration, pickup calendar or reminder. Owner/member permission; same omission/retry limitations as RM-004. Evidence: property-tabs.js PROPERTY_TYPES/propertyTabHtml, property-row.js OPTIONAL_PROPERTY_COLUMNS/toPropertyRow; schema.sql properties (63); mapping/markup tests.

### RM-006 — Navigation and drafts

Three tabs show sticky property context; dirty detail tab or return-to-list prompts Save/Discard/Cancel. Draft values are in memory; same-tab rerenders restore them. Sample hides mutations. No durable draft autosave or browser-unload guard found; new-property/expense forms lack the same guard. Evidence: app.js askConfirm/captureDetailDraft/confirmLeaveDirtyTab/switchDetailTab/renderDetail (721/768/807/826/1064); property-tabs.js detailTabsHtml; property-tabs tests assert source/markup only.

### RM-007 — Photos

Members take/select photos, multi-select gallery, view lightbox, promote primary and remove. Ten-photo client cap; first becomes primary/list thumbnail. New-home form stages one file; existing-home photo picks save immediately. Image input <=15 MiB, JPEG compression to <=450 KiB and max dimension 1280; filename MIME inference; unsupported decoding may fail. Writes private storage, property_photos and thumbnail_path. Paths account/properties/property/photos/photo.ext; legacy thumbnail.ext fallback. DB partial unique primary index; sync_property_thumbnail syncs cover/promotes on delete. Cap not DB-enforced; upload/row/cover operations separate. Gallery upload fallback can overwrite fixed thumbnail path. Evidence: app.js addGalleryPhoto/persistPickedPhotos/removePropertyPhoto/makePhotoPrimary (1260/1557/1657/1701); media.js compressImageFile/galleryPhotoPath; schema.sql property_photos/sync_property_thumbnail (168/352). No real-image compression/upload tested.

### RM-008 — Appliances

Members add name, Gas/Electric/Other fuel and notes, remove with confirmation. Requires nonempty name, notes clipped to 200 characters; reads/writes property_appliances. No edit-existing form, serial/model/service schedule. Personal load errors can look empty. Evidence: property-tabs.js appliancesHtml; app.js loadAppliances/submitAppliance/deleteAppliance (600/2245/2280); schema.sql property_appliances (153); sample/markup tests.

### RM-009 — Current tenant

Members save required name, optional phone/email/notes; basic email pattern. Save writes tenants then properties contact mirrors and occupied status. Occupied control on vacant home opens tenant editor rather than immediately saving occupied state. Vacant/Remove tenant confirms removal of tenant/files, attempts storage cleanup and clears mirrored contacts. DB enforces one tenant per property; no co-tenants/history/deposits/applications/lease-date management. Two writes can diverge; missing tenant table can fall back to property contact. Evidence: app.js loadTenant/saveTenantFromForm/markPropertyVacant (634/2050/2113), bindUi status handlers; property-tabs.js hasCurrentTenant/tenantTabHtml; schema.sql tenants (189), tenants_one_per_property_idx.

### RM-010 — Contact shortcuts

Tenant phone/email feeds tel:, sms: and mailto: links. Missing fields render disabled spans; phone strips everything except plus/digits. Device handles communication; no message sending, inbox sync or delivery log in app. Sample also displays fixture links. No communication triggered. Evidence: property-tabs.js contactButtons (344); tenant markup test only. Device handlers unverified.

### RM-011 — Lease file

Saved tenant prerequisite; members choose image/PDF, view/replace/remove one lease. Path account/properties/property/tenant/lease.ext; path/type/name on tenants. PDF <=8 MiB; image limits RM-007. PDF opens signed link in new tab, image lightbox. Upload/update independent; extension replacement can remove old file before metadata succeeds. No e-signing/generated lease/OCR/expiry reminders. Current source preserves filePickerContext before closeSheets resets it; Git history records this fix. Evidence: app.js applyPickedTenantFile/removeLease (2155/2207); media.js leaseObjectPath/assertPdfSize; schema.sql tenants lease columns. Path helper tested, live upload not verified.

### RM-012 — Correspondence copies

Members add image/PDF to existing tenant, view/remove saved Letters & emails (copies you save). Writes tenant_files kind=correspondence and account/properties/property/tenant/files/file.ext. Schema permits kind=other, no distinct UI discovered. Limits/signed viewing as lease. No email integration, auto-capture or editable text correspondence. Tenant deletion cascades metadata. Evidence: app.js loadTenantFiles/applyPickedTenantFile/deleteTenantFile (667/2155/2227); property-tabs.js tenantTabHtml; schema.sql tenant_files (209).

### RM-013 — Expenses

Members add/edit/delete date, amount, category, notes. Descending spent_on then created_at; all-time USD total/count per property. Repairs/Supplies/Utilities/Insurance/Other categories. Requires date and finite nonnegative number; blank amount becomes zero under Number('') despite required attribute/novalidate. Notes clipped 1000. DB numeric(12,2) >=0; category unconstrained text. Reads/writes expenses, optional receipts. No rent payment ledger, recurring expenses, date-range report, tax classifier or account-wide expense export. Evidence: app.js CATEGORIES/loadExpenses/expensesPanelHtml/submitExpense/deleteExpense (63/406/1026/1822/1968); schema.sql expenses (124). No CRUD runtime tests.

### RM-014 — Receipt

Members attach/view/replace/remove image/PDF; new expense stages until Save, existing picks persist immediately. Writes receipts and account/properties/property/expenses/expense/receipt.ext. File limits above; no OCR or binaries in export. One receipt is client convention, no unique expense_id constraint. Some delete calls ignore returned Supabase error. Expense may save before receipt fails; replacing extension can remove old object before metadata save. Evidence: app.js saveReceiptForExpense/applyPickedReceipt/removeCurrentReceipt (1873/1903/1945); media.js receiptObjectPath; schema.sql receipts (139). MIME helper tests only.

### RM-015 — Export

Members and sample viewers with expenses choose CSV/PDF, see filename/count/total and Share or Save file. Browser Blob/File download and Web Share capability/fallback, no backend writes. CSV: spent_on,amount,category,notes; PDF: address/export date/rows/total; all loaded property expenses, no binaries. Filename normalized address/sample prefix. Handcrafted PDF 1.1 Helvetica uses ASCII substitution, long-word truncation and potential long-note overflow. CSV quoting does not neutralize formula-leading user text. Evidence: app.js generateExpenseExport/shareExportFile (1484/1465); export.js expensesToCsv/expensesToPdf/pdfSafe/wrapWords (20/104). Only share capability helper tested; no rendered/export fidelity validation.

### RM-016 — Backup/restore

Any member downloads version-1 JSON app/exportedAt/properties. Restore accepts array or object.properties, normalizes fields/IDs, confirms replacement, invokes replace_account_properties and marks seeded. Sample excluded. RPC transaction deletes old properties (cascading all child rows), recreates properties, mirrored current tenant contacts and one primary-photo reference. Backup excludes expenses/receipts/appliances/gallery extras/tenant notes/lease/correspondence metadata and binaries. Storage may remain physically online but links disappear, including on restore of a fresh same-account backup. UI saying files stay online is not full recovery. Evidence: app.js readBackupFile/downloadBackup/handleRestore (359/2326/2341); auth.js replaceAccountProperties (368); schema.sql replace_account_properties (687) and child cascades. No restore executed.

### RM-017 — Legacy import

Reads origin localStorage rental-home-data-v1 (array/properties object); one-time empty-account offer keyed rental-home-legacy-offered:{account}, manual Account import remains if old rows exist. Generates fresh IDs and appends, marks seeded/offered. No deduplication; manual repeats duplicate; child entities/files not fully migrated; old media paths not rewritten for new IDs. Requires same-origin legacy storage and signed-in backend. Evidence: app.js getLegacyProperties/offeredKey/importLegacyProperties/afterPropertiesReady (342/192/2390/2407). Real local user records not read.

### RM-018 — Sample

Visitor/signed-in user enters View sample/hash; fixed distinct sample account, sticky read-only banner, hidden controls and write guard plus SQL sample write denial. Remote rows preferred; local synthetic properties/media/extras on sample failures. Never seeds personal account. SQL has three homes; local samplePortfolio four with different IDs, so deep links/data can differ. startAuth config/CDN gates precede sample callback; bundled fixtures do not establish independent no-config/offline startup. Evidence: app.js applySampleFallback/loadProperties/mergeSampleFacts/applySamplePath (144/368/513/983); auth.js startAuth (444); account-scope.js fixtures; schema.sql sample seed/removal (1160 onward/1315). Fixture/scoping tests passed.

### RM-019 — PWA

Safari Add to Home Screen documented; app manifest standalone ./, PNG/maskable icons. Worker rentmanor-shell-v23 precaches shell/modules/icons, network-first HTML/JS/CSS, cache-first other same-origin GET, network-only config.js. Cross-origin Supabase/CDN not intercepted; no durable private record cache/offline write queue. CDN SDK still required at startup; sample files not initial precache. Root worker cleans legacy caches/unregisters; root HTML redirects to marketing. No push/background sync. Evidence: manifest.json, app/sw.js, root sw.js/index.html, app.js registration. Public worker text matches; cache-name test does not exercise installation/offline updates.

### RM-020 — Feedback

Toasts, inline errors, busy buttons/upload indicators; friendlyError maps auth/schema/permissions/network/storage and preserves other actionable message/code/details. No structured logging/monitoring. Extras loaders sometimes suppress errors as empty/legacy data. Evidence: errors.js friendlyError/isSchemaSetupError, app.js showToast/loadPropertyExtras (2309/698); four error tests passed.

### RM-021 — Marketing/policies

Five public pages describe small portfolios/private sharing/install/contacts/backup, no marketing registration backend. Responsive styles and github.io CTA fallback. Privacy/terms explicitly placeholders, operator contact/deletion process unspecified. Create-account CTA does not select signup; marketing-origin install may create marketing shortcut (no marketing manifest discovered). Evidence: site HTML/CSS, README, DNS-GODADDY; public root GET only.

## Workflows

### Onboard and add a home

Visitor chooses signup -> frontend password/confirmation validation -> Supabase signup metadata -> SQL handle_new_user creates account/membership or joins invitation -> frontend ensure_my_account/loadMemberships/pickAccount -> properties query scoped by account and locally filtered. New account empty. Add home validates required location/status -> writePropertyRows -> optional image/storage/gallery -> occupied home Tenant tab -> tenant save and mirrored property update. Success: persisted property/contact visible to account. Failures: confirmation email external step; CDN/config/SQL prevents auth; optional-schema retry loses facts; successful home insert can precede photo failure; tenant mirror update separate transaction.

### Share a portfolio

Owner Account/Invite -> create_invite ownership check + optional email + expiry -> user manually sends link -> receiver URL capture/sessionStorage -> signup trigger or accept_invite and automatic email claim -> member sees shared rows. RPC validates not-found/expiry/wrong-email; trigger mismatch and accepted-token reuse remain. Existing owner invited elsewhere can default back to owned account on later establishment without preferred token; no switcher. Successful membership means edit/delete/restore rights, not read-only. No invite/message created in audit.

### Maintain property/current tenant/files

Member opens card -> renderDetail loads expenses/receipts and extras -> edits Property with Save and tab-leave draft prompts -> adds immediate gallery/appliance records -> Tenant save updates tenants then property mirrors/occupied -> contact links launch device handlers -> saved-tenant lease/copy picks upload then save metadata. Vacant asks confirmation, deletes tenant/cascaded file metadata, attempts file cleanup and clears property contacts. Success: current records and linked files. Failures: extras reads hide schema errors, values may not clear, sequential operations stop halfway, removals destroy current tenant rather than archive history. Browser actions unverified.

### Record/report expenses

Member Expenses/Add -> explicit date/amount validation -> expenses insert/update -> staged receipt upload then metadata -> reload total/list. Existing receipt selection persists immediately. Export generates file entirely in browser -> share/save sheet -> native sharing or download. Expense deletion confirms -> relational cascade -> best-effort file cleanup. Success: stored ledger/file or exported property report. Failures: empty amount zero; receipt failure after ledger success; no DB one-receipt enforcement; export excludes files/Unicode limitations and possible spreadsheet formulas. No backend transaction or communication exercised.

### Backup and legacy migration

Account/Backup downloads currently loaded properties. Restore parses/normalizes JSON, confirms replacement, calls transactional SQL deleting account's properties/children, reconstructs properties/contact/primary reference, reloads. Existing online bytes do not restore missing metadata. Legacy import instead reads old local array, assigns new IDs and appends without dedupe. Both member-accessible. Future tests need disposable backend, synthetic rows in every child table and storage, including failure cases. No real records restored/imported.

### Demo/install

View sample enters hash routes, read-only source/fixtures; exit returns account/auth. Demo success is not evidence of personal CRUD. App-domain Safari install uses manifest/worker; shell cache does not make SDK or backend available offline. No iPhone/browser installation tested.

## Architecture and database

Vanilla browser HTML/CSS/ES modules, no framework/bundler/app build. package.json type=module with only test script and no runtime npm dependencies/lockfile. Dynamic Supabase JS 2.112.3 from jsDelivr; hand-built PDF rather than library.

| Location | Responsibility |
| --- | --- |
| app/index.html/styles.css | DOM forms/screens/sheets, responsive/sticky/focus rules, inline config. |
| app/app.js | State/maps, rendering/events, all CRUD/import/export flows. |
| auth.js/account-scope.js | SDK/auth/membership/invite/sample mode; scope helpers and synthetic fixtures. |
| property-row.js/property-tabs.js | Row mapping/compatibility; escaped HTML tabs/forms/gallery/appliances. |
| media.js/export.js/errors.js | Image/PDF preparation/storage/signed links; ledger files/share; feedback. |
| manifest/sw/icons | PWA shell/install/cache. |
| site/, root index/sw | Marketing and root-host/legacy-worker compatibility. |
| supabase/schema.sql/migrations | Full setup and two incremental upgrades. |
| tests/, README, docs/DNS-GODADDY.md | Five test files and existing setup/operation guidance. |

Browser -> Supabase Auth/session JWT -> PostgREST tables/RPC -> Postgres; browser -> private Storage for upload/signed links; browser -> host assets and CDN SDK. No custom backend server/endpoints, edge functions, webhooks, schedules/queues, realtime subscriptions, payment provider, analytics or email sender discovered. Database auth-insert/update triggers are background processing, not scheduled tasks.

| Entity | Relationships/rules/purpose |
| --- | --- |
| auth.users | Managed identity; after-insert handle_new_user; managed Auth schema not supplied. |
| accounts | UUID/name/seeded/is_sample; unique sample flag; portfolio boundary. |
| account_members | Composite account/user PK; FKs accounts/auth.users; owner/member and peer email. |
| account_invites | Account/creator FKs; unique token, optional email, accepted/expiry times. |
| properties | Account FK; address/location, status enum check, rent text, mirrored contacts, facts/thumbnail. |
| expenses | Account/property FKs; date, numeric(12,2) amount>=0, category/notes. |
| receipts | Account/expense FKs; path/type/name; no unique expense_id. |
| property_photos | Account/property FKs, order, at most one primary via partial unique index. |
| property_appliances | Account/property FKs, name, fuel constraint, notes. |
| tenants | Account/property FKs; unique property_id; contact/notes/lease metadata. |
| tenant_files | Account/tenant/property FKs; correspondence/other kind, path/type/name. |
| storage.buckets/objects | Managed private account-media bytes; metadata references paths. |

FK cascades remove relational descendants of deleted account/property/expense/tenant. Auth-user deletion cascades memberships, not portfolio itself. Child account_id and parent FKs independently validated; no composite constraint proving same-account parentage. RLS checks child's account_id, not parent linkage, a suspected integrity/security issue for adversarial isolated testing. Extras queries usually filter parent ID and depend on RLS.

Updated-at triggers cover seven content tables; sync_property_thumbnail maintains primary cover/promotes after delete. Tenant/property mirrors maintained by frontend separate writes. Incremental tabs migration backfills old personal thumbnails/contacts; full schema table creation/sample seed does not perform that same personal backfill. Re-running setup and upgrading old installations are not identical.

### Security and storage

RLS enabled on ten public tables. Membership helper uses auth.uid(). Personal content CRUD: authenticated members, excluding sample; anonymous/authenticated SELECT for sample. Accounts readable to members/sample and mutable by non-sample members. Membership SELECT peers, no direct client membership writes. Invites owner-select/delete and owner-guarded creation RPC; restore/seeded RPC membership-guarded. Security-definer helpers/RPCs use specified search_path, explicit execute grants/revokes. Live policy installation unverified.

Private account-media permits reads by sample/member; writes authenticated non-sample members. media_account_id parses first folder UUID; later property/expense/tenant portions not parent-validated. Bucket SQL requests 10 MiB, JPEG/PNG/WebP/GIF/HEIC/HEIF/SVG/PDF allowlist, catches creation errors with notice, so schema execution alone need not prove bucket exists. Upload upsert/cache-control; signed links 3600 seconds and in-memory expiry cache, sample filename fallback to bundled files. No file recovery/export archive/garbage collector found.

## Operations

netlify.toml publish root, empty build: app.rentmanor.com rewrites app/, apex rewrites site/, www redirects apex; explicit site/app paths avoid double prefixes; config.js no-store header. Public roots indicated Netlify. Actual site ID/deploy history/branch binding/all DNS/security settings unknown. README describes Pages main/root fallback; root redirects site. DNS-GODADDY assigns Damon record changes and provides guidance; actual current DNS not verified. Cloudflare alternative has no corresponding implementation found.

Local/PWA/host sources default to configured backend; no staging project identified. README claims production photos/expenses migration applied: historical documentation claim only, not independently verified. No backend admin credentials/schema/bucket/provider settings accessed.

| Configuration name | Purpose |
| --- | --- |
| SUPABASE_URL / SUPABASE_ANON_KEY | .env.example names; static browser does not automatically read .env. |
| window.RENTAL_HOME_CONFIG.supabaseUrl / supabaseAnonKey | Actual auth.js runtime config. |
| app/config.js | Loaded after inline config and can override; tracked despite ignore rule. |
| app/config.example.js | Placeholder template. |

Inline app/index.html config present; config.js field presence inspected without printing values. No service_role marker detected there; not a comprehensive secret scan. SDK rejects placeholders and non-HTTPS except localhost HTTP. Provider confirmation/redirect URLs external and unknown. No general feature flags; gates: sample/owner/account/config, browser sharing, cap, data presence and compatibility fallback.

README startup: copy config example into app/config.js for intended environment, python3 -m http.server 8000 from root; Windows launcher alternative py -m http.server 8000 when available. Open /site/, /app/, /app/#/sample. Not run here. Local frontend can still connect to real backend through inline/committed config; future interactive verification must use isolated copy and disposable Supabase/synthetic data. Manual SQL-editor migrations: photos/expenses/sample then property/tenant tabs for old schemas; no automated migration runner/reset/history checks found. No SQL executed.

Only property JSON backup/legacy import found. Unknown platform backup/PITR plan, storage backups, retention, restore drill, RPO/RTO, host/Supabase alerts/log settings. No repository scheduled backup, telemetry/Sentry/metrics/health checks/audit trail. App toasts/errors transient. ZIPs are packaging artifacts, not proof of recovery. Existing privacy says contact operator for account deletion, without concrete support workflow.

## Intent and discrepancies

Established: RentManor branding/rental-home slug; small portfolios/trusted people; shared account isolation; member editing; fresh accounts empty; sample never copied; three detail tabs; one current tenant; primary photo drives list; private storage/path conventions; property-only backup; ledger exports exclude receipt files; Netlify preferred/Pages fallback. Tests name a Structure freeze for paths, but no separate approved freeze specification found.

Drift/conflicts: README one-photo description omits gallery/appliances/tenant file breadth and old-schema guidance omits tabs migration. README shared-password sharing conflicts with terms keep-password-private; Damon must resolve. UI files-stay-online backup wording hides deleted metadata/child rows. Remote sample three versus local four/different IDs. Full schema does not equal incremental personal backfill. Both marketing CTAs open sign-in; marketing install may create website shortcut. Sample local fixtures still behind config/CDN gates. Production SQL claim unverified.

Inference: extras extend easy family-oriented management; no proof of agreed payments/accounting/tenant-history requirements. No separate backlog/handoff/spec found beyond README/DNS/test labels/Git history. site/for-whom explicitly excludes payments, maintenance tickets, maps-as-a-product, large management firms and App Store install. Their absence is not automatically committed remaining work.

## Prioritized remaining work

Audit recommendations only; no implementation performed.

| Priority/ID | Evidence-backed finding | Certainty and next step |
| --- | --- | --- |
| P1 GAP-001 | Restore deletes properties/children; backup properties only. app.js downloadBackup/handleRestore; schema replace_account_properties/FKs. | Source-confirmed destructive semantics, no verified incident. Decide snapshot scope/retention/warnings; synthetic round-trip all children/files. |
| P1 GAP-002 | handle_new_user accepts metadata token without email restriction comparison unlike accept_invite. | Source-confirmed missing check, runtime exploit unknown. Align paths and test wrong-email signup/confirmation. |
| P1 GAP-003 | accept_invite lacks accepted-token rejection; eight hex token; repo rate-limits not established. | Source-confirmed reuse before expiry; intended reuse/platform protections unknown. Damon specify policy; replay/concurrency tests. |
| P1 GAP-004 | Independent account/parent FKs and child-account RLS don't prove parent account match. | Suspected security/integrity issue; adversarial two-account DB tests before asserting impact. |
| P2 GAP-005 | toPropertyRow omits cleared optional fields; writePropertyRows retry strips optional values silently. | Source-confirmed serialization/update loss. Define explicit empty/null persistence and compatibility feedback. |
| P2 GAP-006 | submitForm/submitExpense/tenant/file flows separate row/upload writes, removal can precede metadata save. | Source-confirmed sequence; runtime failure outcomes unverified. Test retries/partial writes; design compensation. |
| P2 GAP-007 | makePhotoPrimary/removeCurrentReceipt/form photo removal ignore some returned errors; extras loads hide failures. | Source-confirmed unchecked responses. Test denied/network/schema errors; truthful feedback. |
| P2 GAP-008 | pickAccount defaults owner after invite preference lost; no selector. | Selection policy confirmed; suspected existing-owner invitation UX failure. Decide multi-account policy/reload test. |
| P2 GAP-009 | Empty expense becomes zero; one receipt/cap not DB constraints; novalidate numeric attributes insufficient. | Source-confirmed validation gaps. Decide rules; invalid/concurrent-write tests. |
| P2 GAP-010 | CSV formula-leading values not neutralized; PDF ASCII/truncation/long-note pagination limits. | Source-confirmed transforms; device/file impact unverified. Synthetic spreadsheet/render fidelity tests. |
| P2 GAP-011 | README migration/backfill guidance incomplete; deployed schema/config unknown; no offline backend/SDK proof. | Establish release/schema/provider/bucket and isolated staging; document accurate upgrade/offline scope. |
| P3 GAP-012 | Policy stubs/password-sharing conflict/support-delete process; signup CTA/install instructions. | Source-confirmed docs gaps. Damon resolve policy and operator process; no inferred legal requirements. |
| P3 GAP-013 | Legacy manual imports duplicate; no full recovery/monitoring proof. | Scope confirmed; operational settings unknown. Specify recovery/import retention and prove synthetic restore. |

Missing meaningful tests: real RLS/RPC auth boundaries, wrong-email/reused/raced invites, parent integrity, CRUD/upload/delete, partial failure/retry, restore completeness, memberships after reload, browser/iPhone camera/HEIC, install/cache upgrade/offline, keyboard/focus accessibility and CSV/PDF fidelity. Source-pattern tests can pass with broken workflows.

Damon input: authoritative Netlify release/Supabase schema? Invite reuse and email restriction policy? Multiple portfolios per user? Required backup scope and who may restore? Shared-password policy? Operator deletion/support/retention/recovery? Tabs migration/gallery/optional media actually deployed? These are unanswered, not silently resolved.

## Verification

Existing commands reviewed before tests; local synthetic/helper tests import modules without creating SDK client or calling backend. Node v24.15.0; npm test -> node --test tests/*.test.mjs: 30 passed, 0 failed/skipped/cancelled/todo, exit 0. File groups: account-isolation 7, friendly-error 4, media 3, property-row 4, property-tabs 12. Scoping/SQL text checks do not exercise server RLS; image tests MIME only; markup/path tests not browser/files; sharing capability only; no export render tests.

Exact checks: git status --short; git branch --show-current; git rev-parse HEAD; git remote -v; rg --files and hidden AGENTS search/ancestor Get-Item; node --version; npm test; node --check for each app/*.js plus root sw.js (11 files, all pass); Invoke-WebRequest -Uri URL -TimeoutSec 15 at four public URLs above, JS Content comparison with IO.File.ReadAllText; Get-FileHash on duplicate migration; IO.Compression.ZipFile.OpenRead metadata only; git diff --exit-code and git diff --cached --exit-code (no tracked changes); document structure/path/ID/copy hash checks after authoring.

No dependencies installed, build needed (no build script), SQL run, real signup, outgoing invite/message/payment, credential change, commit/push/deploy or app/config edit. Sandbox shell and node_repl startup failed with helper setup-refresh errors; approved escalated shell execution allowed inspection/testing/docs. No automatic-approval rejection.

## Maintenance

Keep RM IDs stable; append new ones. After future changes update inventory/workflows/data/config/gaps and concise handoff, date/zone/branch/commit/uncommitted baseline, exact tests and environment. Record implementation, verification and deployment separately; helper/mocked test never proves live integration. Resolve decisions explicitly with Damon and evidence. Attach deployment/schema proof when available. Update coverage, regenerate timestamped Downloads copies and compare hashes. Close a gap only with supporting evidence.

## Audit coverage

Inspected application modules and UI/action/persistence paths, auth/account/invites, marketing/policy text, CSS responsive/sticky/focus rules, manifest/workers, schema entities/functions/triggers/RLS/grants/storage/sample, both migrations/backfill, existing docs/config examples/runtime field presence, package/ignore/workspace metadata, five tests and recent Git/status. Sample fixture/path mappings read; media/icons inventoried rather than visually rendered. Duplicate untracked SQL compared; ZIP metadata only.

Tested 30 existing offline synthetic/helper/source tests, 11 JS syntax checks, four static HTTP GETs/two text matches, tracked preservation and documentation/copy integrity. No manually exercised browser workflow.

Excluded production records/authenticated APIs, SQL execution, real account/invite/send/payment/paid services, credentials, deployments, device install, binary/visual rendering, archive contents and unrelated projects. Only requested documentation added.

Unknown exact deployed commit/full asset match; live schema/RLS/bucket/Auth/provider/redirect settings; integration success; host/DNS/monitoring/backup/retention settings; browser/iPhone/offline/CDN-failure behavior; unpublished historical decisions; actual customer impact of suspected issues. This reference is a source audit with bounded operational verification.
