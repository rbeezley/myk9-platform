## Context

Class Details already owns the staff per-class run sheet, Entry Management owns show-wide entry review and bulk actions, Show Map owns ordering and class-level attention, and dedicated scoring routes own result entry. The desired Linear-inspired behavior is therefore a roll-up plus precise navigation across these surfaces, not a new command center.

The codebase already contains useful but split primitives:

- `entryCountSelectors.ts`, `entryPredicates.ts`, and `getEffectivePaymentStatus()` classify Entry Management rows.
- `features/show-map/attention.ts` defines `pending_review` and `reopened_after_closeout` attention signals.
- Entry Management already supports URL-backed trial, class, attention, mode, roster, and view state; payment is still component-local state.
- Server-authoritative class completion is represented by class status and `is_scoring_finalized`; raw `scored_count === entry_count` must not be used to infer completion because scratched, withdrawn, and pulled entries have different expected/accounted-for semantics.
- `entry_status_history` stores `previous_status`, `new_status`, `changed_by`, `changed_at`, and `reason`. Generated database types reflect those names. Some existing mapper code references a non-schema `status` property, so the new history read model must use the generated schema rather than copying that assumption.

The secretary intent is “That was easy”: the summary must be calm, immediately understandable, and take the user to the existing clearing action in one interaction. The summary must remain usable with replicated/cached show-day data and must not make core entry work wait for a secondary history query.

## Goals / Non-Goals

**Goals:**

- Establish one typed attention/readiness classification contract shared by summaries and their destinations.
- Add a compact, staff-only readiness strip to existing Class Details.
- Make actionable readiness metrics deep-link into the existing owner surface with class context preserved.
- Expose authoritative entry lifecycle status changes in the existing staff entry-detail workflow.
- Prove summary-to-destination agreement with unit, component, and focused browser verification.

**Non-Goals:**

- No new class dashboard, entry-management page, exception queue, scoring surface, or comments system.
- No Kanban drag-and-drop, manual health reporting, arbitrary priorities, or task assignees for entries.
- No replacement of Quick View presets, enrollment grouping, Show Map ordering, or dedicated scoring routes.
- No attempt in this change to combine every payment, email, check-in, and score edit into a universal event stream. The initial history is the authoritative entry lifecycle status history.
- No client-side reimplementation of server class-completion derivation.

## Decisions

### 1. Extend shared classifiers instead of adding a Class Details-only calculation

Create or consolidate a pure TypeScript operational-classification module that accepts minimal structural entry/class facts and returns typed reasons and counts. Existing Entry Management and Show Map classifiers become dependencies or delegates of that module rather than competing implementations.

Initial entry reasons are `pending_review`, `missing_information`, and `payment_due`; the existing class reason remains `reopened_after_closeout`. A single entry may yield more than one reason when facts genuinely overlap. Counts are derived from the same reason collection used to filter the destination.

Alternative considered: calculate the strip directly from `dbRawEntries` inside Class Details. Rejected because dashboard, Show Map, and Entry Management could drift again.

### 2. Make payment filter state URL-backed before linking readiness metrics

Entry Management already normalizes most filter state through search parameters. Add validated URL handling for payment state so a `payment_due` link can land on the exact class-scoped set and survive refresh/back navigation. Preserve current defaults and normalize invalid or legacy values without producing an empty, unexplained view.

Route-building helpers own parameter construction. Callers do not hand-build query strings.

Alternative considered: link payment metrics to a class-only view and ask the secretary to apply the payment filter. Rejected because the readiness signal promises an actionable destination and should remove that extra step.

### 3. Render a compact metric strip on existing Class Details

The staff Class Details view receives a compact summary adjacent to the existing class header/run sheet. It presents factual metrics rather than a synthetic manual health grade:

- total class entries;
- entries needing review or missing information;
- accepted entries with payment due;
- checked-in progress; and
- scored progress, while class completion continues to use authoritative server lifecycle fields.

Each actionable metric links to the existing owner surface. Entry, review, payment, and check-in metrics route to class-scoped Entry Management; scoring routes to the dedicated class scoresheet. A metric is not rendered as an action unless its destination contains the clearing affordance.

Alternative considered: a separate Class Command Center. Rejected as direct duplication of Class Details, Entry Management, Show Map, and scoring.

### 4. Treat lifecycle history as a secondary, read-only staff enhancement

Add a typed history read adapter that selects the generated `entry_status_history` fields and maps `new_status`/`previous_status` explicitly. The timeline is available from the existing staff entry-detail/edit workflow and does not create another route.

History is staff-only and read-only. Existing RLS remains the authorization boundary; the UI also avoids requesting or rendering it for unauthorized roles. The initial version is explicitly an online-enhanced secondary read because `entry_status_history` is not currently replicated. React Query may retain previously loaded history, but a first-time offline or failed history load shows a quiet unavailable/retry state while all core entry actions remain usable.

Alternative considered: add status history to replication in the same change. Rejected because that expands replication schema, storage, and sync risk for a secondary view. If show-day validation proves offline history is operationally required, that becomes a separate replication change.

### 5. Preserve truthful partial states

Readiness uses the already-loaded class/entry source and does not issue a second competing count query. While that source is loading, the strip uses a compact skeleton. If the source fails, it does not render confident zeros. History failures remain scoped to history and never replace the run sheet or Entry Management content.

### 6. Ship in dependency order

The implementation order is:

1. canonical reasons, route builders, and URL-backed payment filter;
2. Class Details readiness strip and destination agreement;
3. lifecycle history read adapter and existing-surface timeline;
4. focused browser walk and documentation/tracking synchronization.

This ordering lets later UI depend on tested contracts and keeps each Linear issue PR-sized.

## Risks / Trade-offs

- **[Risk] Class Details and Entry Management consume different row shapes.** → Use minimal structural input types plus explicit adapters, and test both raw and normalized inputs against the same classification cases.
- **[Risk] Enrollment-level payment can be counted differently from class-line entries.** → Define the unit as one dog/enrollment entry visible in the selected class and add multi-class enrollment fixtures to count-to-filter tests.
- **[Risk] Raw scored totals imply false completion when scratches or pulls exist.** → Label the metric “Scored,” never infer “complete” from raw equality, and continue to use server status/`is_scoring_finalized` for lifecycle state.
- **[Risk] New URL parameters combine into contradictory filters.** → Centralize normalization, reset incompatible preset state, and test direct links, refresh, back navigation, and invalid parameters.
- **[Risk] History schema mapping silently reads the wrong property.** → Type the selected row from generated database types and assert `previous_status`/`new_status` mapping with value-sensitive tests.
- **[Risk] Secondary history reads fail offline or under RLS.** → Keep history out of core load/action paths, provide a calm scoped state, and verify unauthorized access returns no history.
- **[Trade-off] Lifecycle history does not yet include every money/check-in/scoring event.** → Use an honest “Entry status history” label and defer a universal activity stream until its sources and offline requirements are separately designed.

## Migration Plan

No database migration is expected for the initial scope because `entry_status_history` and its staff-scoped RLS already exist. If implementation discovers missing authoritative writes, stop and update this design before adding schema or triggers.

Deploy the shared classifier/URL contract first, then the readiness UI, then the read-only history UI. Rollback removes the new UI and URL handling; no user data is rewritten. Existing links without the new parameters retain their current behavior.

## Open Questions

- During implementation, confirm the existing entry-detail/edit surface that can host the history without obscuring routine corrections. Prefer an inline section in that existing surface; do not introduce a standalone page or sheet merely for history.
- Confirm through seeded browser verification whether the checked-in metric needs an exact `checkIn` URL filter. Add it only if class-scoped Day-of mode does not make the clearing action obvious within one interaction.
