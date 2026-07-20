# Secretary Class Operations Cockpit — Existing-Surface Inventory

Evidence gathered July 20, 2026 before production or schema implementation. This inventory is the boundary for the approved cockpit: Show Desk orchestrates and provides context; complex work remains on its canonical owner surface.

## Access and data foundations

- All current show-management sections are guarded together by `ShowManagementSectionRoute`. Secretary and site-admin roles are admitted directly; club admins are admitted only when scoped to the Show's Club. The route does not apply a separate granular permission per section.
- Database writes for Show-scoped staff records should use the established `public.can_manage_show(show_id)` authorization boundary. It admits the scoped club administrator, Trial Secretary, or platform administrator.
- The seeded Secretary role includes `show:manage`, `class:update`, `entry:update`, `entry:manage`, `report:generate`, and `report:export`. It does not include `report:manage`; Paperwork Print must not depend on that permission.
- Core Show, Trial, Class, Entry, Dog, Armband, Judge Assignment, and Waitlist data already have app replication tables wired to the shared `MutationManager` in `ReplicationSyncProvider`.
- Class lifecycle writes already have one canonical offline mutation: `applyManualClassStatus`. It writes through `replicatedClassesTable`, records `statusSource: 'manual'`, records Actual Start when moved to In progress, records Actual Finish when moved to Complete, clears both when returned to Not started, and preserves them on cancellation.
- `ReplicatedClass` carries Scheduled Start (`startTime`), Class Status, Actual Start, and Actual Finish. It does not carry Revised Expected Start or sport-aware Operational Area.

## Existing action and ownership map

| Current Show Map action | Approved cockpit treatment | Canonical owner / route | Current execution and data | Gap or constraint |
| --- | --- | --- | --- | --- |
| Review entry | Attention deep-link | Entry Management via `getClassReviewHref` | Current Show Map opens its own approval sheet | Remove the duplicate Show Desk review workflow; retain only the link and summary |
| Edit score | Deep-link | Paper scoring via `getPaperScoringEntryHref(classId, entryId)` | Navigates to the exact Entry row | Supported |
| Score Class / Enter paper scores | Persistent focused-Class link and attention action | Paper scoring via `getPaperScoringClassHref(classId)` | Navigates to split paper-scoring mode | Supported; use the user's “Enter paper scores” language |
| Open Class | Persistent focused-Class link | Class Details via `getShowMapClassHref(showId, trialId, classId)` | Class Details owns Entries and actual results review | Supported; this replaces the misleading Results Control destination for “Review results” |
| Print Check-In Sheet | Contextual paperwork action | Reports via `getShowMapReportHref` with report, Trial, and Class ids | Opens Reports; browser iframe print only | Class scope is supported, but no durable print confirmation exists |
| Mark Class Started | Inline lifecycle status control | `applyManualClassStatus(classId, in-progress)` | Replicated Class UPDATE; records Actual Start | Supported |
| Mark Class Complete | Inline lifecycle status control | `applyManualClassStatus(classId, completed)` | Replicated Class UPDATE; records Actual Finish | Supported; cockpit must confirm when paper scores remain unentered |
| Open Schedule | Do not surface as a competing destination | Setup page | Current route is `/shows/:showId/setup` | Setup owns planned schedule configuration; day-of Revised Expected Start belongs inline in Show Desk |
| Print Trial Reports | Link to Reports at Trial scope | Reports via report + Trial id | Current action requests Trial Secretary Report | Supported only as an explicitly broader Trial action |
| Mark checked in | Retain only as an executor-backed fast command when context makes it safe | Entry Management day-of view is canonical | Current Show Map mutation writes check-in state and performs optimistic query updates | Do not recreate a second general check-in table in the cockpit |
| Move up | Attention deep-link | Entry Management, filtered to the affected Trial/Class and day-of work | Current Show Map owns a move-up dialog, mutation, and undo | Existing inline implementation overlaps Entry Management; cockpit should link unless a later owner decision explicitly preserves the small command |
| Pull / no-show | Attention deep-link | Entry Management day-of view | Current Show Map owns a pull dialog, mutation, and undo | Same duplication boundary as Move up |
| Message handler | Small inline executor-backed command | Existing Show Map messaging executor | Resolves handler, opens/creates Show thread, sends message | May remain inline because it is a bounded command, not a duplicate management surface |
| Collect judge signature | Contextual report link | Result Catalog in Reports at Class scope | Current Show Map uses report `result-catalog` | A report open is not proof a signature was collected; keep the signal factual |
| Review results | Persistent focused-Class link | Class Details | Current Show Map incorrectly routes to Results Control | Results Control only controls exhibitor visibility; replace this destination |
| Submit final results | Closeout link | Submit Results | Navigates to `/shows/:showId/submit-results` | Supported as Trial/show closeout, not a Class results-review page |

## Non-attention navigation

The focused Class must always expose the following work group, even when no issue exists:

- **Entries and results** → Class Details, where the secretary can see the Class roster and actual results.
- **Enter paper scores** → paper-scoring Class route.
- **Run order** → Class Management for the Trial.
- **Reports and paperwork** → Reports with the Class's exact Trial/Class scope when that report supports Class scope.

Class Management currently accepts Trial, lifecycle status, search, element, and density. It does not accept a focused Class id or run-order anchor. Any prototype URL implying exact Class focus is illustrative; task 3.2 must add and validate that contract before the production link claims exact focus.

## Current pending signals

| Signal | Current source | Canonical treatment |
| --- | --- | --- |
| Entries waiting review | Raw Entry operational classifier | Link to Entry Management review mode |
| Entries waiting check-in | Accepted/confirmed Entries without check-in state | Link to Entry Management day-of mode; current code labels this as a local filter despite already carrying a valid href |
| Payment due | Raw Entry operational classifier | Link to Entry Management with accepted + pending-payment filters |
| Classes needing judge signature | Show Map wrap-up status | Keep as Class attention; no verified single destination currently exists |
| Results pending closeout | Show Map wrap-up status | Link review to Class Details; separately link publication to Results Control only when the action is explicitly about exhibitor visibility |
| Missing paper scores | Derived from Entry score counts | Link to the exact paper-scoring Class route |
| Results or labels changed after printing | Not currently computable | Requires confirmed Paperwork Print coverage plus document fingerprints; do not show before that exists |
| Revised Expected Start slip | Not currently persisted | Requires a new replicated Class field; Scheduled Start must remain unchanged |

## Report and label scope

| Document | Registry scopes today | Current data/print path | Required correction |
| --- | --- | --- | --- |
| Check-In Sheet | Trial, Class | Replication-backed report query → HTML iframe → browser Print | Add explicit effective scope and staff confirmation after print invocation |
| Scoresheet | Trial, Class | Same Reports path | Same |
| Results Sheet | Trial, Class | Same Reports path | Same |
| Result Catalog | Show, Trial, Class | Same Reports path | Keep scope explicit; this is a report, not a durable signature state |
| Armband Labels | Show only | Direct Supabase Entry query → one item per Entry → label iframe → browser Print | Add Trial and Class invocation scope plus calendar-day Dog/Armband deduplication. Current code duplicates a Dog entered in multiple Classes |
| Result Labels | Trial, Class | Scoped report Entries → one item per Entry/result → label iframe → browser Print | Preserve one label per included Entry/result; never Dog-deduplicate |
| Trial Secretary Report | Trial | Reports path | Label as broader Trial action when invoked from a Class |

`printIframe` only verifies that iframe HTML exists and calls `contentWindow.print()`. Opening Reports, creating HTML/PDF, downloading, or invoking browser Print cannot be treated as confirmed physical output.

## Show Desk duplication boundary

The production cockpit replaces these competing projections in `ShowDeskPanel`:

- Next Best Action guidance;
- Up Next queue;
- Running Now cards;
- the full nested Show Map tree;
- overlapping closeout and report cards that repeat canonical owner pages.

The replacement is one stable daily schedule, one compact Needs Attention strip, and one focused-Class panel. The focused panel may execute only bounded existing commands such as lifecycle status or messaging. Entry review, payment resolution, general day-of Entry management, paper scoring, run-order editing, Reports, visibility control, and final submission stay on their existing owner pages and are reached by typed, context-preserving deep links.

Unique Show Desk tools such as People at show, access codes, incident log, volunteers, tasks/notes, judge hospitality, and the schedule-slip script remain reachable from one compact Tools affordance; they are not copied into the Class cockpit.

## `paperwork_prints` dependency inventory

No `paperwork_prints` table, replication class, durable print timestamp, print history, or print-confirmation mutation exists.

### Schema dependencies

- Stable client-generated UUID primary key so offline INSERT retries are idempotent; the mutation executor already treats a duplicate primary key from a retried INSERT as success.
- Required `show_id`; nullable `trial_id` and `class_id`; validated scope kind must agree with which foreign keys are present.
- `report_id`, actor id/name, client-observed `printed_at`, server timestamps, compact coverage, document fingerprint, void actor/time/reason, and integer `version` for replication/OCC conventions.
- Foreign keys should cascade from Show and retain coherent Trial/Class scope. Actor identity should not make offline records impossible to replay if a profile row later changes.
- Append-only semantics: reprints create new rows. Correction is a void UPDATE, never destructive DELETE or in-place rewriting of print facts.
- Indexes needed for latest valid coverage by Show/report, Trial/report, Class/report, and `printed_at desc`; partial indexing for non-void records is appropriate.

### Authorization dependencies

- SELECT, INSERT, and void UPDATE should be limited to authenticated users for whom `can_manage_show(show_id)` is true.
- INSERT must require `printed_by = auth.uid()` (with a separately captured display name) and a valid Show/Trial/Class relationship.
- UPDATE must allow only the void fields to transition from null to a correction; a guarded RPC is preferable if column-level immutability cannot be expressed safely with RLS alone.
- DELETE should not be granted. `report:manage` cannot be required because Secretaries do not receive it. The existing Show-management boundary plus `report:generate`/`report:export` is the verified role model.
- Database tests must cover two authorized Secretaries on the same Show, cross-Show denial, unrelated authenticated users, immutable print facts, and allowed voiding.

### Replication dependencies

- Add a focused `ReplicatedPaperworkPrintsTable`, export it from the replication index, register it in `REPLICATED_TABLES`, attach the shared mutation manager, and include it in provider tests/mocks and sync status.
- Sync must be Show-scoped and preserve concurrent rows. Because the entity is append-only, conflict resolution should union independent records by UUID; it must never select one secretary's latest row and discard the other secretary's row.
- `Mark printed` queues an INSERT after explicit confirmation. Offline rows remain visible as pending so co-secretary copy remains truthful about synchronization.
- Undo/Mark incorrect queues a narrow void UPDATE with an OCC version. A collision must surface rather than silently overwrite the other device's correction.
- Derived “latest printed” state must select the latest valid record whose coverage includes the Class/report subjects, then compare the stored document-specific fingerprint. It must not be stored as mutable Class stage.

### Lifecycle and realtime gaps

- `/at-show` maps replicated Class status, but its host replication adapter currently updates only status and optional `start_time`; it does not carry Revised Expected Start.
- The at-show ClassInfo adapter omits Scheduled/Revised Expected Start, and its replication-change subscription is intentionally a no-op. Already-open steward/exhibitor surfaces therefore cannot yet satisfy the approved live timing requirement.
- Actual Start and Actual Finish are staff operational facts and remain staff-only. Exhibitor/steward schedules receive Scheduled Start, Revised Expected Start when present, and current Class status according to their existing role surfaces.

## Unsupported claims that must stay absent until implemented

- A printed timestamp without explicit staff confirmation.
- “Current” or “stale” paperwork without coverage and a document-specific fingerprint.
- An exact run-order Class focus before Class Management supports it.
- Ring data inferred from Judge. Scent work uses named Search Areas; numbered Ring is optional sport-aware metadata.
- Realtime Revised Expected Start on `/at-show` before replicated mapping and active invalidation/subscription exist.
- “Reviewed results” when the destination only controls whether exhibitors can see results.
