## Context

Browse Shows, Show Detail, and registration previously inferred entry membership from different snapshots. A cold local store or a delayed account/show query could therefore create a contradiction: Browse Shows reported a submitted entry while Show Detail defaulted to an empty tab. The exhibitor intent is "This respects my time"; the system must give one calm answer without adding another surface.

The route continues to read entry data through the existing replication-backed entry layer. No persistent show-day data bypasses replication and no mutation flow changes.

## Goals / Non-Goals

**Goals:**

- Derive owned submitted entry state once per Show Detail route and pass only owned rows to exhibitor children.
- Use the same lifecycle classifier to distinguish active submissions from terminal history across Browse Shows and Show Detail.
- Keep cart-only class selections visually distinct from submitted entries.
- Preserve explicit loading and error states so they never become a ready empty result.
- Prove the behavior with focused regressions and an authenticated two-viewport replay.

**Non-Goals:**

- No new route, dashboard, network request, database migration, or shared-system write.
- No change to entry ownership, payment, entry submission, staff management, or show-day mutation behavior.

## Decisions

### Use a pure submitted-entry projection at the route boundary

`submittedEntryProjection` filters owned, non-deleted entries and exposes history, the active subset, and active class IDs. The Show Detail route owns the projection and passes filtered rows into `MyEntriesTab`; children do not independently read a second store snapshot.

Alternative: change only the `My Entries 0` copy. Rejected because delayed data sources could still disagree.

### Define present-tense submission with the shared lifecycle classifier

`isActiveSubmittedEntryStatus` treats pending, accepted, waitlisted, in-ring, and move-up-requested entries as active, while terminal/pulled entries remain history. Browse Shows uses the active state for its `Entry Submitted` indicator; Show Detail keeps owned history visible and uses active class IDs for present-tense class markers.

Alternative: use raw string checks on each surface. Rejected because that recreates the drift.

### Preserve a cart boundary

Registration selection is not a submitted entry. Existing selected classes show `In cart`, while persisted submitted rows retain `Already entered`; cart state does not affect counts or Browse/Show Detail status.

Alternative: treat a selected cart class as an entry. Rejected because payment/submit can still fail or be abandoned.

### Loading and failures are not zero entries

The account-level Browse Shows query exposes loading/error state to the page. Show Detail renders its retry state on a failed authoritative entry read and defers default tab selection while loading.

Alternative: optimistically render zero. Rejected because it repeats the audited defect.

## Risks / Trade-offs

- [Risk] A broader route read could leak another exhibitor's row into child UI. → The projection filters by owned dog IDs (including the canonical row's joined owner when the dog store is cold) before rows are passed down.
- [Risk] Lifecycle semantics drift. → All present-tense decisions call the shared entry selector and focused tests include terminal/pulled states.
- [Risk] A query failure blocks orientation. → Show Detail displays an explicit retry state rather than a misleading landing/zero state.
- [Risk] Browser evidence requires a real signed-in test account. → Keep the change open until the Heartland replay at 390×844 and 1440×900 passes.

## Migration Plan

1. Deploy through the normal app PR path; no migration or deployment command is required.
2. Verify active/history/cart/loading/error regressions locally and in CI.
3. Perform the authenticated Heartland replay at both required viewport sizes before closing the audit finding.
4. Roll back by reverting this UI/helper-only change; no persisted data changes require recovery.

## Validation Profile

- Risk: high
- Validation: full
- Rationale: This affects a core exhibitor entry journey across several views and must not reintroduce a false empty state.
