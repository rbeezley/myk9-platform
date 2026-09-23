# MYK9-694: Private, committed premium publication

> **Status:** Structural redesign implemented; final verification and integration remain.

The public-bucket draft at PR #2375 is not safe to merge because upload makes the PDF publicly downloadable before the database commit. The prior coordinator also admitted lost-response retries and the authored editor draft through separate, uncoordinated paths; the structural replacement is implemented below. This plan supersedes the old expand/contract and legacy-write design.

## Goal

Fix the publish failure, expose premium PDFs only when their show row commits them, preserve the existing publish UI and retries, and keep retained data—including Darboshea—unchanged and readable.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: changes public download authorization, Storage bucket visibility, database publication transactions, and the deployment sequence.

## Selected architecture

Make the existing `premium-published` bucket private. Keep one bucket and one publishing contract. The client stages an immutable `<show-id>/<artifact-uuid>.pdf`; the authorized monotonic-version RPC atomically commits that path and the complete experience publication state. One database boundary covers INSERT and UPDATE: non-Postgres inserts must begin with no committed premium pointer/URL/timestamp, attempt version `0`, committed version null, experience published flag false, experience timestamp/style null, and empty `{}` snapshot; every later change to those publication-owned fields is rejected outside the security-definer publication RPC. No service-role exception exists. Audited app show creation and seed fixtures use only safe defaults; migration/behavioral fixture setup may insert as the database owner. A public Edge Function reads the current committed pointer itself and signs only that object for a short duration. It supports exact historical flat `<show-id>.pdf` reads when a legacy row still points there, without changing row/object bytes. `published_premium_url` remains a canonical identity locator for existing schema consumers, not a working download link after the bucket becomes private; every app download goes through the endpoint. Remove legacy flat writes, legacy publishing fallback, and sticky schema fallback state.

All publication entry points (generated Premium List card/header and the editor's authored unsaved draft) call one coordinator. The coordinator installs a synchronous per-show lock before its first await; matching mode and intent key share a promise, a different intent receives a typed conflict, and another show proceeds independently. The editor remains because its authored unsaved premium content is distinct from generated current-source publishing. The authorized `begin_or_reconcile_premium_publish(show_id, prior_version, prior_path)` RPC locks the show row: it returns `already_committed` only when the exact prior version and immutable path are the current committed pointer; otherwise it atomically reserves and returns a new monotonic version. A generated retry checks this result before calling the nondeterministic generator, so a lost commit response is reconciled without a duplicate PDF. If still uncommitted, it reserves a fresh version, regenerates current sources, and reuses staged bytes only when persisted mode, intent key, complete content, and publisher identity all match. A draft retry reconciles only its exact persisted draft intent; changed content takes a new reservation and artifact. Database row locking serializes browser tabs and commit operations; a later reservation makes earlier attempts stale.

Rejected: a new private bucket alongside the existing public bucket. That keeps parallel read/write contracts and leaves old-client/legacy uploads publicly downloadable before commit. Prelaunch status and disposable test data make compatibility an unjustified permanent branch; no real users exist. Do not touch Darboshea's data.

## Implementation sequence

1. Add download Edge Function and tests. It accepts show ID only and reads the committed pointer server-side. Anonymous users may download only shows matching the canonical public predicate (`deleted_at IS NULL` and status in `published`, `upcoming`, `in_progress`, `completed`). Preserve the management-card preview for a committed draft: if an Authorization bearer is present, validate it with the service client's `auth.getUser(token)`, then construct an anon-key user client with that same bearer and call existing `can_manage_show(show_id)` / `is_show_secretary(show_id)` RPC helpers; do not duplicate RBAC joins. Only then may service-role sign the exact committed path. Invalid bearer, unrelated manager, and soft-deleted rows never sign; missing/invalid optional-auth config fails closed for draft access. Published anonymous downloads still work. Since the function is deployed before migration, compatibility query must work without `published_premium_path` and read only pre-existing `published_premium_url`; recognize exact missing-column failures from either PostgREST (`PGRST204`) or PostgreSQL (`42703`) and test both codes in pre-migration mode. Refuse no-pointer, caller-selected, other-show, superseded, or missing objects. Mint signed URLs only on explicit download action, return them with no-store semantics, and do not retain them in background query/UI state.
2. Replace draft migration with one private-bucket migration. Add trusted path/version fields and authorized begin/reconcile/commit RPCs; scope inserts to valid show paths and managers/club-scoped secretaries; reject non-PDF/oversize metadata; remove authenticated update/delete for versioned artifacts; explicitly set bucket `public=false` and assert there is no broad anon-read policy (the historical policy is already dropped by `20260712130000_advisor_sweep_mechanical.sql`); preserve object rows/bytes and Darboshea. Use one BEFORE INSERT OR UPDATE trigger boundary for all publication-owned show columns: safe-default inserts only for non-Postgres roles, and direct authenticated changes on update denied while begin/reconcile/commit RPCs still work. SQL must prove safe-default creation passes, prefilled direct authenticated insertion is rejected, exact committed path/version reconcile without another reservation, all protected updates fail, and commit RPCs still work. Keep fixed search paths, minimal grants, schema notification, and required explicit table/function grants. A same-version idempotent retry must compare style and normalized snapshot as well as version/path/URL; changed intent is rejected without altering committed state.
3. Update client upload/read flows: no `getPublicUrl` for private staged bytes; separate durable publication readiness/metadata from ephemeral download URLs; sign only when the user clicks Download, do not cache the signed URL, and keep endpoint failure from disabling republish or hiding committed status. Recognize exact `PGRST204` and `42703` missing-column fallback, preserving legacy/Darboshea reads. No missing-RPC fallback to flat writes; no sticky `legacySchemaByShowId`; a missing API returns retryable setup guidance and the next attempt checks again.
4. Repair SQL fixture teardown at the failure on direct `DELETE FROM storage.objects` (line 473 in the reviewed test). Use transactional rollback or test-owner cleanup; do not bypass `storage.protect_delete`, add broad delete privileges, or weaken artifact immutability. Test safe-default authenticated show creation, prefilled direct publication-state insert denial, direct authenticated updates to every publication-owned show column, and lost-response reconcile under the show-row lock; verify denied operations preserve the committed row.
5. Integrate sequentially with PR #2377, which overlaps `showMappers.ts`, `ShowDetailsPage.test.tsx`, and the behavioral SQL registry. Rebase after #2377 lands and preserve its MYK9-691 show-style behavior. Review the combined diff before pushing.
6. Run strict OpenSpec validation, focused client/Edge Function checks, registered behavioral SQL in CI, typecheck/lint/format/quality ratchet for changed paths, then required PR checks/review. Update final PR description with risks, evidence, rollout order, and agent involvement.
7. After final CI/review, deploy the download Edge Function from the reviewed head only with separate approval and verify retained legacy reads, published anonymous access, anonymous draft denial, and authenticated authorized draft preview. Merge; Vercel starts frontend auto-deploy immediately before CI finishes. Until the separately approved migration is applied, the new app reads through the endpoint and disables publish with retryable setup guidance; old clients and direct public URLs retain current behavior, including the residual risk that legacy uploaded bytes are public before their row commits. The strict no-precommit-download guarantee begins at private-bucket migration. Verify fresh publish, staged-object denial, current-pointer download, failed-republish preservation, production build, and unchanged/readable Darboshea before closing the issue.

## Tasks

### Task 1: Add a public committed-pointer download endpoint

- Test first: unit-test a pure resolver for versioned and exact legacy flat pointers, public-show anonymous visibility, committed-draft manager preview, deleted denial, malformed/null/missing paths, and caller-injected/other-show paths; verify every denial signs no URL. Test valid/invalid tokens, unrelated manager, show manager, show-scoped secretary, platform admin, and published anonymous access. Test exact missing-column fallback for both `PGRST204` and `42703`, and prove unrelated errors do not fall back.
- Implement a public endpoint that accepts only show ID, validates any supplied bearer, checks manager access through existing RPC authorization under the validated user JWT for drafts, checks canonical public visibility for anon access, and only then uses service role to sign. The response must not be CDN/query-cached.
- Verify: run endpoint helper, authorization and route tests; expected result is published anon and authorized manager draft downloads pass, while anonymous/invalid-token/unrelated-manager draft requests and soft-deleted requests sign no URL.

### Task 2: Remove the sticky missing-schema publisher fallback

- Test first: when the begin RPC returns a structured missing-function/schema-cache error, publication fails with retry guidance and the legacy writer is not called; after the RPC becomes available, a new invocation calls it again and uses the versioned path.
- Implement: remove `legacySchemaByShowId`, the `publishExperienceLegacy` branches, and sentinel version `0`. Reserve a fresh version before each explicit retry's generation; preserve the immutable staged artifact ID only when complete generated content and publisher identity match, rebinding it to the fresh version. Changed intent or account gets a new artifact. Preserve different-intent conflict and in-flight arbitration.
- Verify: run premium coordinator tests; expected result is all coordinator tests pass and no legacy writer is invoked.

### Task 3: Connect private staging and current-pointer reads

- Test first: upload does not request a public URL; publish readiness derives from durable row metadata independently of signing; Download click requests a fresh endpoint URL; signing 404/outage does not hide committed status or disable republish; draft publish leaves an authorized manager preview available while anonymous draft access stays denied; missing RPC never falls back to a legacy flat upload.
- Implement: make staging return a path only; separate durable publication metadata from ephemeral signed URLs; sign only on explicit Download and do not cache the result; preserve useful retry/error messaging.
- Verify: run focused upload, metadata/readiness, download-action, success-card, and existing publish-surface tests; expected result is versioned path commit, stable status during signing failures, fresh endpoint-backed downloads, and preserved manager draft preview.

### Task 3a: Keep Show Desk publication status aligned with durable metadata

- Test first: mock the actual `usePublishInfo` result shape (`publishedLocator`, publication timestamp, update timestamp, and durable `hasPublishedPremium`) and assert an already-published Show Desk does not show the unpublished warning.
- Implement: update Show Desk and test consumers to use the durable metadata contract; do not restore signed-URL coupling.
- Verify: run Show Desk and header publish-action tests; expected result is published metadata remains recognized without minting a download URL.

### Task 4: Replace the migration and repair behavioral SQL assertions

- Test first: assert the existing bucket is private and no broad anon-read policy exists; authorized staging is exact-path/PDF/size bounded; a safe-default authenticated show insert succeeds, a direct prefilled publication-state insert is rejected, organizers cannot update/delete versioned rows or directly change any publication-owned show field, and RPC publication succeeds; failures/stale versions preserve previous committed state; exact same-intent retries succeed but changed-style/snapshot retries fail; anon cannot list/download staged objects. Remove obsolete legacy flat delete expectations. Catch the intentional versioned delete-protection exception in a sub-block and assert the object remains.
- Implement: replace the migration's public URL contract with private bucket and atomic trusted-path commit; use a single INSERT+UPDATE publication-state guard with no service-role exception; preserve all rows/object bytes, including Darboshea; keep strict grants/RLS.
- Verify: run SQL registration locally and the actual behavioral SQL in CI; expected result is assertions pass without bypassing `storage.protect_delete`.

### Task 5: Full validation and handoff

- Run strict OpenSpec validation, `pnpm qa:plans`, focused tests, app/type checks, lint/format checks, code-quality ratchet, and final diff review. Coordinate overlap with PR #2377 serially and preserve MYK9-691 style behavior.
- After final CI and review, deploy the backward-compatible endpoint only with separate approval, verify legacy read and non-public denial, merge, observe Vercel auto-deploy, then request separate database approval before migration. Verify production build, fresh publish, private staging, endpoint read, and Darboshea integrity.

## Deployment and recovery

Order: approved Edge Function deployment → PR merge (Vercel auto-deploy begins immediately, before CI completes) → approved migration → production verification. Between merge and migration, the new frontend reads existing committed flat data through the endpoint and shows a retryable setup error for publishing; it does not fall back to old writes. Direct legacy URLs remain usable until the migration privatizes the bucket. After cutover, the endpoint serves retained flat files by signing the exact DB pointer; old-client direct links and writes are unsupported. The project is prelaunch with no real users. After migration, rollback to the old frontend bundle is unsupported; recover forward with the endpoint/migration-compatible frontend. Do not push the migration from this implementation worktree.

### Access and revocation semantics

The invariant is that an uncommitted object is never anonymously downloadable and each new endpoint request signs only the path currently committed for that show. An already-issued signed URL remains a bearer link until its expiry; changing the show pointer does not immediately revoke it. Supabase documents that signed URLs remain valid until expiry and that revocation requires contacting Supabase ([Serving assets from Storage](https://supabase.com/docs/guides/storage/serving/downloads)). Set a short explicit TTL, do not persist or log signed URLs, and test that later endpoint requests use only the new pointer while an earlier issued URL remains valid only for its documented expiry window. Do not claim immediate revocation.

## Coverage audit

| Acceptance area                                      | Planned proof                                                                                        | Coverage status |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------- |
| Valid publication and clear success                  | Client + RPC behavioral coverage                                                                     | Planned         |
| Anonymous committed downloads                        | Anonymous direct GET denial + endpoint pointer tests, including draft/deleted/non-public show denial | Planned         |
| Manager can preview draft publication                | Valid manager/secretary/admin JWT allowed; anon/invalid/unrelated manager denied                     | Planned         |
| Publication state is atomic                          | Safe-default manager insert succeeds; prefilled inserts and direct updates fail; RPC writes pass     | Planned         |
| Endpoint deploys safely before migration             | Pre-schema test uses only legacy URL column; post-schema test resolves versioned path                | Planned         |
| Failure/retry/partial upload safety                  | Client retries + atomic SQL preservation                                                             | Planned         |
| Stale version/concurrency                            | RPC behavioral test + client coordination test                                                       | Planned         |
| Lost commit response and cross-surface arbitration    | Exact-pointer reconcile test + synchronous same-show lock/conflict tests                              | Planned         |
| Same-version idempotency binds complete intent       | Exact retry succeeds; changed style/snapshot retry rejects and preserves committed row               | Planned         |
| Authorization/configuration recovery                 | SQL manager/secretary/stranger/anon; UI actionable errors                                            | Planned         |
| Download readiness and URL freshness                 | Signing only on click; no-store URL; outage cannot mask durable status or disable republish          | Planned         |
| PostgREST pre-migration compatibility                | Exact missing-column fallback tests `PGRST204` and `42703`, including retained legacy data           | Planned         |
| Retained legacy/Darboshea data                       | Endpoint exact flat read + before/after row/object evidence                                          | Planned         |
| Regression from sticky fallback                      | Missing-RPC test followed by retry after API availability                                            | Planned         |
| Fixture cleanup without policy weakening             | Registered SQL behavioral run                                                                        | Planned         |
| Show Desk durable metadata                           | Real `usePublishInfo` shape does not show a false unpublished warning                                | Planned         |
| Pre-migration residual-risk and safe-client behavior | New client makes no legacy write; old-client exposure is disclosed and cutover promptly after merge  | Planned         |

Coverage score: every acceptance area has explicit planned evidence (100% planned coverage); implementation and test evidence will be updated after the structural correction and verification. This is a test-map score, not a claim that code or CI is green.

## Risks

- Signed URLs are bearer credentials until expiry and are not immediately revocable through the normal Storage API: use short TTL, do not log/cache them long-term, and document that a previously issued URL can serve a previously committed object until it expires.
- The publication is intentionally public after commit; the endpoint must never trust caller-provided paths.
- Security-definer functions require fixed search path, explicit role checks, and minimal execute grants.
- Existing direct links stop working when the bucket becomes private; endpoint must be deployed and verified before bucket cutover.
- Until migration applies, old clients and direct public URLs retain current behavior, including the existing precommit exposure of flat uploads. Minimize that interval; the strict no-precommit-download guarantee begins only at private-bucket cutover.
- Storage cleanup is separate privileged maintenance; publication never gets object update/delete authority.

## Non-goals

- A second publishing surface or premium visual redesign.
- Old-client publication/rollback compatibility.
- Deleting/moving/editing Darboshea or any retained PDF as part of this change.
- Applying the linked-database migration or closing MYK9-694 before post-merge evidence.
