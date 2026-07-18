## Context

The 2026-07-18 club-pages audit found five interaction and data-readiness failures on existing club surfaces. The failures cross the club profile, application shell, replication-backed club store, public routes, and the payment/contact cards. They do not justify another club page: `/clubs`, `/clubs/:id`, `/club-admin/members`, and `/club-admin/payments` already own the work.

The current implementation exposes three important constraints:

- `ClubDetails` already uses `useUrlTab` through `useClubDetailsState`, and both `PrimaryTabs` and `ClubStatistics` are intended to update that same state. The failing layer must be proved before changing either the local composition or the shared Tabs primitive.
- `UnifiedAppLayout` currently accepts a raw `club-admin` role scope and `unifiedSidebarConfig` builds actionable URLs from it even when that ID is absent from the live replicated club set.
- `ClubDetailPage` and `useBrowseClubsData` load IndexedDB only. The application-wide replication provider skips synchronization for guests even though the `clubs_select` policy permits public reads, leaving a new guest with an empty cache and no terminal state.

The payment pre-flight checklist contains an `// INTENT:` contract: it reduces treasurer anxiety before redirecting to Stripe. That interaction and its plain-language preparation copy must remain intact. Club metadata remains replication-backed so this repair does not introduce a second data path or weaken offline behavior.

## Goals / Non-Goals

**Goals:**

- Make every audited club control complete its visible, canonical action with pointer, keyboard, and URL state kept in agreement.
- Derive club-admin navigation and page context from a role scope that has been validated against the loaded live club set.
- Let guests bootstrap the public club replica, while retaining cached data offline and rendering explicit loading, unavailable, and not-found states.
- Keep the payment checklist as the required pre-flight step and prevent any Stripe call before `Continue to Stripe`.
- Render only contact actions that have a usable destination.
- Add focused component and Playwright regression coverage for all five findings.

**Non-Goals:**

- No new page, dashboard, dialog, club switcher, or duplicate management workflow.
- No fallback to an arbitrary club when a role scope is stale or missing.
- No financial reconciliation or payout-ledger work from `unified-financial-dashboard`.
- No Stripe account, onboarding, payout, or database schema change.
- No broad shared-control migration from `interaction-state-components`; a shared primitive changes only if an assertion-first regression test proves it is the common root cause.
- No full anonymous replication session and no direct PostgREST bypass for club metadata.

## Decisions

### 1. Existing routes remain the only club surfaces

The repair SHALL update the existing profile, browse/detail, members, and payments surfaces. The sidebar may deep-link only to those routes. This keeps one concern on one page and avoids fragmenting club operations.

**Alternative considered:** Add a club landing page that validates the role and forwards users. Rejected because it adds an intermediate surface without fixing the broken destination controls.

### 2. Introduce one validated club-context selector

A pure selector, consumed through a small hook where React state is needed, SHALL combine all of the current user's `club-admin` role scopes with the current replicated clubs. It deduplicates identical scope IDs and returns a club context only when exactly one distinct scoped club ID matches a loaded live club. One live match remains usable when other scopes are stale; zero live matches produce missing/stale guidance, and more than one live match is ambiguous and remains non-actionable until the role assignments are corrected. `UnifiedAppLayout`, `unifiedSidebarConfig`, and club-admin members/payments entry points SHALL consume this result rather than reconstructing context independently.

While club data is still loading, scoped navigation remains non-actionable. When loading settles and the scope is missing, stale, or ambiguous, the shell omits dead `My Club` links and direct club-admin pages show plain-English access-configuration guidance. The system MUST NOT silently select the first club.

Before changing seed or role-assignment data, implementation SHALL inventory the related club row, role row, permission mappings, and user-role scope assignment in one read-only pass. A shared database correction is a separate approval-gated operation; the client guard is required regardless.

**Alternative considered:** Trust the role scope and let each destination handle a missing club. Rejected because it knowingly emits dead links and repeats error handling across pages.

### 3. Add a narrow cache-first public club bootstrap

The club store SHALL expose one idempotent readiness operation used by both `useBrowseClubsData` and `ClubDetailPage`:

1. Load the local replicated clubs cache.
2. If online and no successful club sync has completed in the current client session, the cache is empty, an explicitly requested club ID is absent, or an explicit retry is requested, run the existing table-specific `replicatedClubsTable.sync()` path and reload the cache.
3. Record an in-memory successful-sync marker from the readiness path so repeated route mounts do not refetch unchanged public data in the same client session; explicit retry and a missing requested ID may still force a new check.
4. Deduplicate the remote synchronization promise while allowing each caller to evaluate its own requested-club postcondition after the shared sync settles.
5. Bound caller-visible waiting with the existing `@myk9/core` 15-second network timeout. Keep the underlying sync deduplicated until it settles so a timed-out caller cannot start parallel refreshes, and allow retry after the in-flight operation completes.
6. Preserve cached clubs when remote synchronization fails or times out and expose a settled error only when the requested data remains unavailable.

This operation may run for guests because club reads are public. It SHALL NOT enable the full unauthenticated `ReplicationSyncProvider`, synchronize unrelated tables, or introduce a direct Supabase read. Public browse may render a populated cache while the first-session refresh runs; club-admin context and a terminal not-found detail decision remain non-actionable until the online freshness check settles. If that check fails or times out, public routes may continue showing usable cached metadata, but club-admin context remains unvalidated and shows retryable access-verification guidance. Offline guests with cache see it immediately; offline guests without cache receive an explicit unavailable state and retry action. A successful synchronization that returns zero public clubs is a valid empty-directory outcome, not a network failure.

`ClubDetailPage` SHALL pass its requested club ID to the readiness operation and wait only until that operation settles. If an online cache contains other clubs but not the requested ID, the route SHALL complete one synchronized check before declaring it missing. A valid ID renders the club, an ID absent after that check renders an in-page not-found state with a link back to `/clubs`, and a failed check without the requested club renders an unavailable state. It SHALL NOT show an endless skeleton, silently redirect a valid guest detail route, or render malformed placeholder text.

**Alternative considered:** Fetch `/clubs` directly from Supabase for guests. Rejected because it creates a second source of truth and bypasses the established replication layer.

### 4. Diagnose interaction failures assertion-first

For club tabs and the payment checklist, implementation starts with user-level tests that reproduce the observed failure using `userEvent` pointer/keyboard activation and a focused Playwright path. DOM-only `.click()` is not sufficient evidence.

The club profile keeps `?tab=` as the canonical state. Tab triggers and statistic cards SHALL invoke the same setter, update the URL, select the matching trigger, and render the matching panel. Statistic cards that navigate SHALL use native button semantics or an equivalent accessible control with a visible focus state and keyboard activation. If a primitive-level test proves the shared Tabs wrapper drops activation, fix that wrapper once and coordinate the change with `interaction-state-components`; otherwise keep the patch local to `ClubDetails`/`PrimaryTabs`.

The payment checklist SHALL open from `Connect payment account`, close from `Not now`, and invoke `startConnectOnboarding` only from `Continue to Stripe` (or the already-existing resume/retry actions). If a shared Button defect is proved, patch it with primitive-level regression coverage; otherwise keep the repair in `ClubPaymentsCard`. The pre-flight content and `// INTENT:` comment remain unchanged.

**Alternative considered:** Replace the affected controls preemptively. Rejected because it would obscure the root cause and overlap a separate shared-component change.

### 5. Derive contact affordances from normalized destinations

`ClubHeader` and `AboutTab` SHALL normalize contact values by trimming whitespace and validating that a destination exists before rendering an action. Bare website hosts receive `https://`; explicit website schemes are limited to `http:` and `https:` so unsupported or executable schemes cannot become navigation actions. Email, phone, and website controls render independently. Missing or unsafe values produce no clickable menu item or link; descriptive profile content may use a non-interactive `Not provided` value where the field label is retained.

If no header contact action is available and no administrative action is present, the options trigger SHALL be omitted rather than opening an empty menu. Existing edit, branding, and delete permissions remain unchanged.

**Alternative considered:** Keep disabled contact items. Rejected because disabled destinations add noise and still imply club contact data exists.

### 6. Preserve offline and authorization boundaries

This change only reads replicated club metadata and changes local UI state. It adds no show-day mutation, outbox behavior, RLS policy, permission, or payment write. Authorization continues to come from established role/permission data; validating a club scope narrows navigation and never grants access.

## Risks / Trade-offs

- **[Guest sync accidentally broadens data access]** → Use only the existing public `clubs` replication query and retain RLS as the server-side boundary; add a test proving unrelated tables are not requested.
- **[Stale cache misclassifies a valid role scope]** → Keep context in a loading state until cache-first readiness settles, permit explicit retry, and never convert uncertainty into an arbitrary club selection.
- **[Concurrent browse/detail mounts duplicate network work]** → Deduplicate the readiness promise in the store and test concurrent callers.
- **[Shared primitive repair conflicts with active work]** → Require a red primitive-level test before editing shared Tabs/Button code, keep the diff minimal, and rebase/coordinate with `interaction-state-components` before merge.
- **[Payment repair changes external onboarding behavior]** → Mock `startConnectOnboarding` in component tests and assert zero calls before `Continue to Stripe`; leave provider integration code unchanged.
- **[Not-found and network failure become indistinguishable]** → Model loading, available, unavailable, and settled-not-found states separately and cover each route state.
- **[Public readiness failures become invisible operationally]** → Log one sanitized failure through the existing logging service while keeping internal error details out of guest-facing copy.
- **[A populated cache is treated as live forever]** → Require one successful online club refresh per client session before validating club-admin scope or declaring a detail route terminal, while allowing browse to show cache-first content.
- **[A stalled network request recreates an endless loader]** → Use the existing 15-second network timeout for caller-visible readiness, preserve cache, and expose retry without starting parallel sync work.

## Migration Plan

1. Land assertion-first tests and the validated context/public readiness helpers behind existing routes.
2. Wire the existing shell and pages to the helpers, then repair the proven interaction layer and contact guards.
3. Run the named focused Vitest files, TypeScript/lint checks, and a dedicated read-only clean Chromium club-integrity suite; re-walk authenticated club-admin and guest routes at 375px and desktop widths.
4. Record evidence in the audit and findings registry. No data migration or feature flag is required.

Rollback is a normal code revert. Because there is no schema, provider, or persisted-data format change, rollback restores the previous client behavior without data repair. Any separately approved role-scope data correction must have its own evidence and rollback record.

## Open Questions

- The exact interaction fault layer (local composition versus shared Tabs/Button primitive) remains intentionally unresolved until the assertion-first tests identify it. This is an implementation diagnostic, not a product decision.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: The change spans authorization-derived navigation, public replication readiness, shared interaction primitives if implicated, and a payment setup surface, so focused tests plus app typechecking and browser regression evidence are required before merge.
