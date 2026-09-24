## ADDED Requirements

### Requirement: Premium publishing exposes only committed PDFs

After the private-bucket migration is applied, the canonical publish flow SHALL stage one append-only PDF in private Storage, SHALL atomically commit the exact artifact path and complete experience state for an authorized show, and SHALL make a PDF downloadable only through an endpoint that resolves the currently committed path from the database. Anonymous downloads require the same public-show visibility predicate as `public.shows`; committed drafts may additionally be previewed by authenticated, authorized show managers through the existing RBAC helpers. It SHALL reject superseded attempts, safely retry partial progress, and give actionable recovery without exposing technical payloads. Before the migration, the new frontend SHALL disable publication with retryable setup guidance; old clients and the existing public bucket retain their current behavior until cutover.

The legacy `published_premium_url` column may retain its canonical public-form Storage locator for existing database metadata consumers, but after the bucket becomes private it is not a download URL. Every app download SHALL use the committed-pointer endpoint. Anonymous requests SHALL be limited to shows satisfying the canonical public-show predicate. An authenticated show manager/secretary/platform admin SHALL retain preview access to a committed draft through validated identity and the existing `can_manage_show` / `is_show_secretary` authorization helpers under that user's JWT; the Edge Function SHALL NOT reimplement role-table joins. An invalid bearer or unrelated authenticated user SHALL not receive a draft download.

The database SHALL enforce one publication-state boundary on both show insertion and update for every publication-owned column: `published_premium_path`, `published_premium_url`, `published_premium_at`, `premium_publish_version`, `published_premium_version`, `experience_is_published`, `experience_published_at`, `experience_published_style`, and `experience_published_content`. Non-Postgres inserts SHALL be limited to the safe initial state (null premium pointer/URL/timestamp, attempt version zero, committed version null, experience unpublished with null timestamp/style and empty `{}` snapshot); direct authenticated attempts to prefill committed publication state SHALL fail. Only the authorized publication RPCs may transition these values after creation; no service-role exception exists. The generic replicated-show mutation path SHALL not send these fields.

Client publication readiness and durable metadata SHALL not depend on obtaining a signed download URL. The app SHALL request a fresh signed URL only after an explicit download action and SHALL NOT retain it in background query state or persistent storage. Endpoint signing failures SHALL NOT hide the committed publication state or disable republishing.

#### Scenario: Valid show publishes successfully

- **WHEN** an authorized organizer publishes a valid premium
- **THEN** one PDF and its matching experience state are committed and the user sees a clear success state

#### Scenario: Staged bytes are private

- **WHEN** the private-bucket migration is active and a PDF has uploaded but its publication RPC has not committed
- **THEN** an anonymous request cannot download it directly or obtain a signed URL through the download endpoint

#### Scenario: Pre-migration cutover interval

- **WHEN** the new frontend is deployed but the private-bucket migration has not yet been applied
- **THEN** the new frontend does not start publication without the RPCs and shows retryable setup guidance, while old clients and direct URLs retain the existing public-bucket behavior, including the residual risk that legacy upload bytes are fetchable before their row commits; the system does not claim the post-cutover no-precommit guarantee during this interval

#### Scenario: Committed artifact is downloadable

- **WHEN** an exhibitor requests a published premium for a show
- **THEN** the endpoint resolves the path from that show's current database row and returns a short-lived signed URL for only that object

#### Scenario: Endpoint runs before the private-path migration

- **WHEN** the backward-compatible endpoint is deployed before `published_premium_path` exists
- **THEN** it still reads the legacy `published_premium_url` using columns available before migration and signs only the exact allowlisted flat legacy object; after migration it resolves versioned paths, and tests cover both schema states

#### Scenario: Pre-migration column error uses narrow compatibility fallback

- **WHEN** a pre-migration `published_premium_path` query returns exact PostgREST `PGRST204` or PostgreSQL `42703` missing-column error
- **THEN** the endpoint and client metadata reader retry with legacy columns only, preserve existing legacy/Darboshea reads, and propagate unrelated errors without fallback

#### Scenario: Draft premium remains private to authorized management

- **WHEN** a draft show has a committed premium pointer
- **THEN** anonymous requests, invalid bearer tokens, and authenticated users without show manager/secretary/platform-admin access return not-found and create no signed URL; an authorized manager can preview it through the existing RBAC helpers

#### Scenario: Soft-deleted premium is not downloadable

- **WHEN** a show is soft-deleted, even if its row has a committed premium pointer
- **THEN** the endpoint returns not-found and creates no signed URL for either anonymous or authenticated callers

#### Scenario: Non-public published-state is not anonymously downloadable

- **WHEN** a non-deleted show is outside the canonical anonymous-public statuses
- **THEN** anonymous access returns not-found; authenticated manager access may preview only if the canonical authorization helpers approve the caller

#### Scenario: Caller cannot choose another artifact

- **WHEN** a caller supplies an arbitrary path, another show's path, or a superseded path
- **THEN** the endpoint ignores/rejects it and never signs it

#### Scenario: Previously issued link has bounded lifetime

- **WHEN** a new publication changes the show's current pointer after a signed URL was issued
- **THEN** a subsequent endpoint request signs only the new committed pointer, while the prior bearer URL may remain usable only until its short expiry; the system does not claim immediate revocation

#### Scenario: Download URL is minted on demand

- **WHEN** a page loads, refreshes in the background, or displays publication readiness
- **THEN** it does not mint or retain a signed URL; an explicit Download action obtains a fresh link, and signing errors do not hide durable publication state or disable republishing

#### Scenario: Direct update cannot break atomic publication state

- **WHEN** an authenticated show manager attempts to change a publication pointer, version counter, or experience published snapshot/style/flag outside the publication RPC
- **THEN** the database rejects the update and leaves the full committed state unchanged, while authorized begin/commit RPC calls continue to work

#### Scenario: Show insertion starts without committed publication state

- **WHEN** an authenticated show manager creates a show with the safe initial publication defaults
- **THEN** insertion succeeds, but an authenticated insert that prepopulates a premium path/URL/timestamp, nonzero attempt or committed version, or published experience snapshot/flag is rejected

#### Scenario: Existing legacy PDF remains readable

- **WHEN** a show row still points to the exact historical flat `<show-id>.pdf` URL
- **THEN** the endpoint may sign that exact private object without changing the row or bytes

#### Scenario: No publication exists

- **WHEN** a show has no committed premium path or valid legacy URL
- **THEN** the endpoint returns not-found and does not reveal Storage object names

#### Scenario: Versioned publication is immutable

- **WHEN** an organizer stages or has published a versioned artifact
- **THEN** the bucket accepts only PDF content within the size limit and organizer credentials cannot update or delete the object

#### Scenario: Failed or stale commit preserves the last good publication

- **WHEN** an upload succeeds but commit fails or its attempt version is stale
- **THEN** the show row and current download remain unchanged, and retry of the same validated intent can complete safely

#### Scenario: Retry intent changes

- **WHEN** a concurrent or retried publish changes `premium` or `inkSaver`
- **THEN** it cannot join or reuse a different intent's artifact and attempt

#### Scenario: Explicit retry regenerates current intent

- **WHEN** an organizer retries a failed publish after show data or the signed-in account may have changed
- **THEN** the row-locked RPC reconciles the exact prior version/path before generation; if not committed, it reserves a fresh version before regenerating current sources, reusing staged bytes only when the persisted mode, intent key, complete generated content, and publisher are unchanged, otherwise it stages a new artifact

#### Scenario: Commit succeeded but its response was lost

- **WHEN** a retry presents the exact version and immutable path of an attempt that is already the current committed pointer
- **THEN** the server returns the committed metadata without reserving another version, invoking generation, uploading another PDF, or changing the published row

#### Scenario: Authored draft shares the publication boundary

- **WHEN** a user saves an authored premium draft while another premium operation for that show is already running
- **THEN** the draft uses the same synchronous per-show lock; identical mode and intent key share the active promise, a different mode or key receives a typed conflict, and an operation for another show remains independent

#### Scenario: Same-version retry changes committed intent

- **WHEN** a retry uses the already-committed version, path, and URL but changes the experience style or snapshot
- **THEN** the RPC rejects the request and preserves the committed style and snapshot; only an exact same-intent retry is idempotent

#### Scenario: Missing schema is recoverable without legacy writes

- **WHEN** the RPC is missing or not yet visible in schema cache
- **THEN** the client shows a retryable setup error, performs no flat-path write, and checks the RPC again on the next attempt

#### Scenario: Required data or configuration is missing

- **WHEN** a known required field or configuration prevents publishing
- **THEN** the UI names the specific correction and does not claim success

#### Scenario: Existing publish surfaces share recovery state

- **WHEN** publishing starts from any existing premium action or editor surface
- **THEN** it uses the same per-show coordinator, duplicate-submit latch, and retry identity

#### Scenario: Unknown failure

- **WHEN** publishing fails for an unclassified reason
- **THEN** the UI offers a safe retry and logs technical evidence without exposing it to the organizer
