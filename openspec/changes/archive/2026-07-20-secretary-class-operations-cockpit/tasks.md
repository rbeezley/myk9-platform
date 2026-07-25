## 1. Approval Gate and Existing-Surface Inventory

- [x] 1.1 Walk the desktop and tablet scent-work mockups and the numbered-ring variation with the product owner; record approval or required revisions before application or schema implementation begins.
- [x] 1.2 Build a development-only, fixture-backed interactive cockpit prototype with scent-work, numbered-ring, and offline/two-secretary scenarios; keep the production Show Desk and all persistence untouched.
- [x] 1.3 Exercise the agreed four-to-five-Class fixture and confirm that a secretary can identify what is running, urgent, next, awaiting closeout, and unconfirmed or stale within roughly ten seconds.
- [x] 1.4 Inventory every existing Show Desk action, canonical owner route, report scope, permission, print path, lifecycle fact, and replication table used by the proposal; document unsupported signals instead of inventing destinations.
- [x] 1.5 Confirm the duplication boundary for each cockpit control: retain orchestration and context in Show Desk, link complex work to its existing owner, and identify the current redundant Show Desk blocks that the cockpit replaces.
- [x] 1.6 Inventory candidate `paperwork_prints` schema dependencies, RLS roles/permissions, replication registration, mutation patterns, and conflict behavior in one evidence pass before writing a migration.

## 2. Pure Cockpit Projection

- [x] 2.1 Add typed snapshot, view-model, filter, evidence-kind, attention, schedule-row, focus-panel, and sync-state interfaces in a focused Show Desk cockpit module.
- [x] 2.2 Implement deterministic day selection, Trial date/number grouping, stable schedule ordering, simultaneous-time grouping, missing-time handling, and current-time marker behavior as pure utilities.
- [x] 2.3 Implement deterministic attention ranking, deduplication, three-item truncation, reason text, actionable-destination checks, and timing emphasis without row reordering or automatic focus changes.
- [x] 2.4 Implement authoritative lifecycle/progress/evidence classification so unknown facts stay unknown and Prepare/Finish remain action groups rather than persisted stages.
- [x] 2.5 Implement sport-aware Operational Area display as optional metadata, using Search Area/Ring/Course labels only when supplied and never inferring Ring from Judge.
- [x] 2.6 Add focused unit tests for every pure projection rule, including concurrent Classes, tied/missing times, changing realtime facts, unknown evidence, attention overflow, and the 30-minute or next-in-order preparation reminder.

## 3. Context, Routing, and Canonical Ownership

- [x] 3.1 Add URL-backed selected day, quick filter, focused Class, and schedule anchor state with initial-focus fallback to earliest active and then next upcoming Class.
- [x] 3.2 Add typed deep-link builders for Entry Management, Class Management, paper scoring, Reports, Results Control, and Submit Results using exact Show/Trial/Class filters and validated internal return URLs.
- [x] 3.3 Add `Back to Show Desk` handling on supported owner surfaces and restore day, filter, focus, and anchor through both the explicit link and browser Back.
- [x] 3.4 Replace generic or non-resolving Show Desk signals with exact canonical destinations or non-actionable information; keep existing small executor-backed commands inline.
- [x] 3.5 Add routing and component tests proving exact issue destinations, rejected untrusted returns, context restoration, zero-Entry print suppression, and no focus stealing after replicated updates.
- [x] 3.6 Add a persistent focused-Class work group for Entries and results, paper score entry, and run order; verify each destination against the canonical owner and keep it present without attention.

## 4. Report Scope and Label Selection

- [x] 4.1 Introduce the shared discriminated `ReportScope` type and thread it through report route builders, selectors, data preparation, and registry-supported-scope checks.
- [x] 4.2 Make Show, Trial, and Class callers default Reports to their invoking scope while allowing an explicit supported scope change inside Reports.
- [x] 4.3 Expose direct report actions only at supported scope; label unavoidable broader actions explicitly, such as `Open Trial report`, and never silently widen to Show scope.
- [x] 4.4 Write the assertion-first failing test that one Dog/Armband entered in eight same-day Classes produces one Armband Label, then replace show-wide Entry mapping with scope-first Dog/Armband/calendar-day selection.
- [x] 4.5 Add Armband Label tests for two Show days, multiple Dogs per Handler, and Trial/Class scope narrowing; verify the same Dog retains one Show armband number.
- [x] 4.6 Preserve Result Labels as one per included Entry/result and add tests proving no cross-Class Dog deduplication and correct Class-scoped result fields.

## 5. Offline Paperwork Print Coordination

- [x] 5.1 Write and review a migration for append-only `paperwork_prints` with stable client ids, Show/Trial/Class scope, report id, actor/time, compact coverage and fingerprints, void metadata, replication versioning, indexes, constraints, and timestamp handling.
- [x] 5.2 Add least-privilege RLS policies using the verified existing report/show-management permissions for read, insert, and void operations; add database tests for authorized co-secretaries and denied users.
- [x] 5.3 Register Paperwork Prints with `@myk9/replication` and the established mutation manager so confirmations and corrections save locally, replay safely, and preserve concurrent append-only records from two devices.
- [x] 5.4 Implement pure document-specific coverage and fingerprint builders for check-in/score sheets, results/Result Labels, and Armband Labels using effective Report Scope and actual selected subjects.
- [x] 5.5 Implement latest-valid-covering-record and per-subject staleness derivation, including Trial/Show batch coverage, one-Class stale changes, and later Class-only reprint precedence.
- [x] 5.6 Implement explicit `Mark printed`, `Not yet`, and `Record as printed` flows after exact report invocation; never create confirmation from report open, download, PDF generation, or browser Print alone.
- [x] 5.7 Implement Undo and later `Mark as incorrect` as void operations that retain actor, time, and reason and fall back to the previous valid covering record.
- [x] 5.8 Add focused tests for offline save/replay, concurrent confirmations, permission denial, append-only reprints, void/fallback, broad-scope coverage, document-specific staleness, irrelevant changes, and truthful `not confirmed printed` wording.

## 6. Cockpit Interface and Responsive Behavior

- [x] 6.1 Replace the competing Next Best Action, Up Next, Running Now, full Show Map, and overlapping closeout/tool projections with one stable daily schedule, compact Needs Attention strip, and focused Class panel.
- [x] 6.2 Build the desktop/landscape split layout with aligned outer schedule/focused-Class panels, schedule-owned title and filters, expanded-by-default collapsible Trial sections, Trial date/number headers, stable schedule rows, lifecycle/progress/location metadata, one primary action, deliberate focus, and a panel limited to orchestration plus canonical links.
- [x] 6.3 Build the portrait/narrow inline expansion with one selected Class at a time, visible row-level primary action, keyboard support, screen-reader names, and touch targets meeting the project minimum.
- [x] 6.4 Add quick filters for All, In progress, Needs attention, and Needs closeout without adding alternate Stage or Operational Area layouts.
- [x] 6.5 Make schedule and focused-panel lifecycle badges one shared, touch-accessible manual control backed by the canonical replicated status mutation; add inline Revised Expected Start editing while preserving Scheduled Start; record and display Actual Start/Actual Finish; separate cancellation; and confirm completion when paper scores remain unentered.
- [x] 6.6 Replace the Show Desk hero/publish cards with the approved compact context bar while keeping Setup unchanged, surfacing publish exceptions and sync state, and updating the protected `// INTENT:` comment to the owner-approved behavior.
- [x] 6.7 Render Paperwork Print actor/time, broader-scope coverage, current/stale state, history, and calm reminders in the focused Class panel without gating Class lifecycle work.
- [x] 6.8 Add component tests for attention interaction, deliberate focus, Trial grouping/collapse summaries, responsive expansion, filters, lifecycle changes with unentered paper scores, compact chrome exceptions, offline/sync text, print history, staleness, and canonical-link labels.
- [x] 6.9 Map replicated Class status and Revised Expected Start into steward `/at-show` and exhibitor schedule adapters, add replicated-Class subscriptions/invalidation for already-open surfaces, and keep Actual Start/Actual Finish staff-only.

## 7. Scenario Verification and Release Gate

- [x] 7.1 Add deterministic test fixtures for concurrent scent-work Classes using named/multiple Search Areas and for obedience/conformation/agility Classes using numbered Rings, including missing Operational Area data.
- [x] 7.2 Run focused Vitest suites for cockpit projection, routing, report selection, Paperwork Print replication/domain logic, and affected components; run myK9Show typecheck and build for the touched implementation.
- [x] 7.3 Walk desktop, landscape tablet, and portrait tablet with the scent-work fixture while online and offline; capture evidence for running/urgent/next/closeout/stale orientation, touch access, deep-link return context, and two-secretary coordination.
- [x] 7.4 Walk the numbered-ring fixture and verify the same schedule model works with Ring terminology and never substitutes Judge when location is missing.
- [x] 7.5 Verify on two devices that online status/expected-start changes appear without reload and offline changes converge after reconnect; confirm exhibitor and steward timing visibility differs as specified.
- [x] 7.6 Run strict OpenSpec verification and review the final diff for duplicated owner workflows, hidden exception paths, unsupported state claims, unrelated changes, and files exceeding project limits.
- [x] 7.7 Update the linked Linear issue, launch-readiness tracking, and product documentation with implementation evidence, test results, risks, intentional non-goals, and any separately approved Operational Area follow-up.
- [x] 7.8 Open the PR with the repository template, obtain CI and code/product review, address blocking findings, merge only after the recorded acceptance gate passes, then archive the OpenSpec change and complete branch/worktree cleanup.
