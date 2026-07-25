## Context

Show Desk already has the difficult infrastructure: replicated Show/Trial/Class/Entry data, typed Show Map actions, offline-safe mutations, attention classification, ranked recommendations, and canonical routes into Entry Management, Class Management, Reports, Results Control, Submit Results, and paper scoring. Its current presentation stacks Next Best Action, Up Next, Running Now, pending signals, a full Show Map tree, closeout, and tools with similar visual weight. That projection does not match a secretary coordinating several Classes that are preparing, running, scoring, and closing out at the same time.

The secretary's intent is “That was easy.” The replacement must stay calm and stable on tablets, keep common work within one or two taps, render immediately from replicated state, and remain truthful when schedule, Operational Area, or physical-paper evidence is missing.

Three intentionally different designs were compared:

1. **Exception Desk** — a globally ranked top-three queue with a compact class pulse.
2. **Class Binder** — a stable Class index with one persistent master-detail workspace.
3. **Today's Schedule** — a stable schedule ledger with a focused Class panel.

The selected design combines the stable Today's Schedule ledger, the Exception Desk's compact actionable strip, and the Class Binder's deliberate focus/return behavior. The global exception queue does not dominate because incomplete signal coverage could create false reassurance. The Class Binder does not dominate because it makes show-wide temporal orientation secondary.

The current database has no durable Operational Area assignment. Scent work may use named Search Areas, including multiple areas for one Class, while obedience, conformation, and agility may use numbered Rings or Courses. Judge is not a location proxy. Operational Area persistence is therefore a separately gated capability, not a prerequisite for the schedule cockpit.

The existing report registry already declares supported Show/Trial/Class scopes, but callers and individual reports apply that context inconsistently. Armband Labels currently read show-wide Entry rows and can duplicate the same Dog once per Class. Result Labels already represent one Entry/result. The design makes Report Scope a common interface and adds explicit Paperwork Print coordination.

Mockups:

- [Desktop scent-work schedule](mockups/desktop-scent-work.svg)
- [Tablet scent-work schedule](mockups/tablet-scent-work.svg)
- [Desktop numbered-ring variation](mockups/desktop-ring-sport.svg)
- [Functional prototype review guide](prototype-review.md)

## Goals / Non-Goals

**Goals:**

- Make Today's Schedule the stable default Show Desk projection.
- Surface at most three actionable cross-Class issues without reordering Classes or stealing focus.
- Show each Class's authoritative lifecycle, progress, attention, location when known, and one primary next action.
- Preserve exact context when entering and returning from canonical owner pages.
- Use one pure, presentation-ready cockpit module so React callers do not reconstruct ranking, truth, or route policy.
- Make reports inherit the invoking Show, Trial, or Class as their default Report Scope.
- Record staff-confirmed Paperwork Prints offline, including actor, timestamp, scope, coverage, corrections, reprints, and document-specific staleness.
- Deduplicate Armband Labels to one Dog/Armband per included Show day while keeping Result Labels one-per-Entry/result.
- Pass realistic scent-work and numbered-ring desktop/tablet walkthroughs before implementation approval.

**Non-Goals:**

- No new management page, report renderer, scoring workflow, entry table, or results-control implementation.
- No Stage board, Area board, draggable cockpit, or alternate layout in the first implementation.
- No new persisted Class pipeline beyond Not started, In progress, Complete, and Cancelled.
- No `classes.ring_number`, Judge-as-Ring fallback, or Operational Area database migration in this change.
- No automatic claim that browser Print produced paper.
- No blocking of scoring, Class start, or closeout because Paperwork Print confirmation is missing.
- No change to exhibitor or `/at-show` role ownership.

## Decisions

### 1. Use a stable schedule ledger as the default projection

Rows sort by Show day, planned start time when present, Trial order, then Class display order. Lifecycle, progress, and attention update in place; urgency never moves a row. Simultaneous Classes share a time block and remain stacked in stable order. Untimed Classes visibly say `Time not set` and sort after timed Classes by configured order.

Within the selected day, Classes are visibly grouped by Trial in configured Trial order. Every group header names both `Trial <number>` and the Trial date. Groups start expanded so active or urgent Classes are not hidden, but the secretary may collapse a group to reduce scrolling. A collapsed header continues to show Class, In progress, attention, and focused-Class summaries; filters apply across Trials and preserve the grouping of matching Classes.

The initial day is today during a Show, the next Show day before it, or the most recent day with unfinished closeout afterward. Every Show day remains reachable in one tap. The page scrolls to a visible `Now` marker and provides `Jump to now`.

**Alternatives considered:** A completely flat same-day list makes two same-date Trials ambiguous. Making Trial groups collapsed by default risks hiding urgent work. A Stage board makes status distribution obvious but destroys schedule continuity as cards move. Operational Area columns fail for scent work Classes that use multiple areas and cannot work before area data exists. A global queue is fast for triage but overstates the completeness of tracked signals.

### 2. Keep cross-Class attention prominent but non-disruptive

The `Needs attention` strip shows at most three actionable items plus `View all`. It explains why each item is ranked, never automatically changes the focused Class, and never changes schedule order.

Ranking is deterministic:

1. Explicit conflicts or requests blocking an active or imminent Class.
2. Incomplete operational work in an active Class.
3. Preparation for a Class starting within 30 minutes or next in configured order.
4. Completed-Class closeout.
5. Administrative follow-up.

Before the Show, entry readiness and preparation receive emphasis. During the Show, conflicts, move-ups, active scoring, and imminent preparation receive emphasis. After Class completion, signatures, results, labels, and submission receive emphasis. Timing changes emphasis only; it never hides a section.

An item is clickable only when it has an exact resolving destination or an existing Show Desk executor. Items without a verified destination render as non-actionable information or stay out of the strip.

### 3. Use a small, deep cockpit module

Introduce a pure module whose interface accepts one operational snapshot and returns presentation-ready state:

```typescript
type EvidenceKind = 'recorded' | 'computed' | 'staff-confirmed' | 'unknown';

interface SecretaryCockpitSnapshot {
  show: Show;
  trials: readonly ShowMapTrialInput[];
  classes: readonly ShowMapClassInput[];
  entries: readonly ShowMapEntryInput[];
  actions: readonly ShowMapAction[];
  paperworkPrints: readonly PaperworkPrint[];
  now: Date;
}

interface SecretaryCockpitModel {
  day: { selected: string; available: readonly string[]; nowMarker?: string };
  attention: readonly AttentionItemModel[];
  schedule: readonly ScheduledClassModel[];
  focusedClass: FocusedClassModel | null;
  sync: { state: 'saved-on-device' | 'up-to-date' | 'needs-attention' };
}

declare function buildSecretaryCockpitModel(
  snapshot: SecretaryCockpitSnapshot,
  state: { focusedClassId?: string; filter: CockpitFilter }
): SecretaryCockpitModel;
```

The module hides truth classification, stable sorting, timing emphasis, attention deduplication, action routing, Paperwork Print coverage/staleness, sport-aware location wording, and empty/unknown handling. The existing Show Map tree, action catalog, href builders, and executor remain inputs rather than being reimplemented.

The interface is the primary unit-test seam. React components test rendering and interaction through the resulting model rather than retesting ranking internals.

### 4. Keep Class focus deliberate and URL-backed

On first load, focus restores the last selected Class for the Show/day. Otherwise it selects the earliest scheduled active Class, then the next upcoming Class. Focus never changes automatically after realtime or sync updates.

State is encoded in a shareable internal URL such as:

```text
/shows/:showId/show-desk?day=2026-07-19&focus=:classId&filter=all
```

Desktop and landscape tablet use schedule plus side panel. Portrait tablet and narrow widths expand the selected row inline; only one Class expands. The primary action remains visible without expansion.

On split layouts, the schedule title and its filters live inside the left schedule panel. The schedule panel and focused-Class panel share one top edge, making them read as two coordinated panes. Trial groups become sections within the schedule panel rather than separate floating outer cards; filters remain visually contained on the left because they affect only the schedule.

The panel contains lifecycle/progress, blockers, primary/supporting actions, Paperwork Print status, and links to specialized tools. A persistent `Class work` group keeps Entries and results, paper score entry, and run order reachable even when the Class has no attention item. Attention cards and the primary action remain fast paths, not the navigation system. The panel does not contain a complete Entry table, Class configuration form, report preview, or Results Control.

### 5. Deep-link to canonical owner surfaces and restore context

Existing small Show Desk commands remain inline through the shared executor. Complex work routes to its owner:

- Entry review, payments, waitlist, move-ups, and pulls → typed Entry Management filters.
- Per-Class entries, check-in, run order, entered results, and result edits → the existing Class surface.
- Structural Class edits → Class Management.
- Paper score entry → the exact Class paper-scoring route.
- Check-in sheet, score sheet, results, labels, and official paperwork → Reports with exact Report Scope.
- Results visibility and release → Results Control with exact Class scope; this surface does not review the entered result values.
- Final submission → Submit Results with exact Trial/Show context.

Typed route builders carry an internal return URL. Owner pages show `Back to Show Desk`, and browser Back restores the same day, filter, focused Class, and scroll anchor. Internal return URLs are validated against known app routes rather than accepted as arbitrary redirects.

This is the explicit duplication answer: Show Desk owns orchestration and context, not a second implementation of any owner workflow. The current Next Best Action / Up Next / Running Now / full Show Map stack is replaced rather than left above or below the cockpit.

### 6. Treat lifecycle and physical work as different kinds of truth

The only Class lifecycle values are Not started, In progress, Complete, and Cancelled. Progress and wrap-up readiness are computed from recorded Class/Entry/score/signature/submission data. `Prepare this class` and `Finish this class` are action groupings, not persisted stages.

The lifecycle badge in both the schedule and focused-Class panel is an explicit manual control. It delegates to the existing replicated manual Class-status mutation rather than adding another status implementation, so a secretary using paper scoring instead of `/at-show` can record when judging starts and finishes while offline. The menu uses the same four lifecycle terms everywhere, visually separates cancellation, and confirms exceptional or consequential transitions.

Changing Not started to In progress records Actual Start at the transition time. Changing a Class to Complete records Actual Finish at the transition time. These operational timestamps display beside lifecycle status and remain distinct from Scheduled Start, Revised Expected Start, score-entry completion, and results release.

Class Lifecycle Status, Revised Expected Start, Actual Start, and Actual Finish use the established offline-safe Class replication path. Secretary changes update Show Desk immediately, then converge into the steward `/at-show` experience and exhibitor-facing schedule surfaces as replication reaches each device. Already-open consumers subscribe to replicated Class changes rather than requiring a manual reload. Offline updates remain local-first and reach other devices after connectivity returns.

Visibility follows role need: exhibitors see Class Lifecycle Status and Revised Expected Start so they know where and when to be ready; secretaries and stewards also see Actual Start and Actual Finish for operational coordination. Exhibitors remain in the main myK9Show schedule/My Entries experience rather than the staff `/at-show` surface.

Complete means physical judging has finished. It does not claim that paper scores have been entered, reviewed, signed, printed, released, or submitted. When a secretary marks a Class Complete with unentered paper scores, the control explains the remaining count and preserves that score-entry work as a prominent attention item.

Unknown time, Operational Area, Judge, or incomplete replica evidence stays unknown. No inferred fact is rendered as staff confirmation.

Paperwork is authoritative only through a Paperwork Print. Opening Reports, generating a PDF, downloading, or invoking browser Print creates a pending attempt at most; it never creates a Paperwork Print.

### 7. Add append-only, offline-safe Paperwork Print coordination

Add a replicated `paperwork_prints` entity scoped to a Show, Trial, or Class. A confirmed record contains:

- stable client-generated id;
- `show_id`, optional `trial_id`, optional `class_id`, and `scope_kind`;
- canonical `report_id` / document kind;
- `printed_at` and `printed_by`;
- a compact coverage manifest describing which Classes, Entries, Dogs/Armbands, and Show days were included as appropriate for the document;
- relevant per-subject fingerprints used for document-specific staleness;
- optional `voided_at`, `voided_by`, and correction reason;
- replication version and timestamps.

Each confirmation/reprint inserts a new record. Undo or `Mark as incorrect` voids the mistaken record instead of deleting it. Concurrent confirmations remain separate; the latest valid covering record is the normal display, and history exposes both.

A broader-scope print stores one record plus its coverage manifest. A Class may therefore show `Printed as part of Trial 1 print`. If relevant data for only that Class changes later, only that Class becomes stale. A Class-only reprint becomes that Class's latest valid covering record.

The print flow is:

1. `Print/Reprint` opens the exact scoped report.
2. After print invocation, Reports and the return context offer `Did it print? Mark printed · Not yet`.
3. `Mark printed` inserts the replicated record and offers an Undo toast.
4. `Record as printed` remains available for paper produced elsewhere.

Missing confirmation may create a low-priority reminder for a Class starting within 30 minutes or next in configured order. The wording is `not confirmed printed`, never `not printed`, and it never blocks Class work.

Staleness is document-specific:

- Check-in/score sheets: included Entry lifecycle, move-up/scratch state, run order, and relevant Class configuration.
- Results/results labels: score, result status, placement, and relevant Class identity.
- Armband labels: included Dog/Armband/day identity and configured label content.

Fingerprints are computed in one Paperwork Print module so callers do not maintain parallel change lists.

**Alternatives considered:** A single timestamp on Class cannot distinguish documents or reprints. Automatically recording Print clicks is not physically truthful. One child record per Class for a broad print creates noisy duplication and loses the fact that the paper was produced as one batch.

### 8. Make Report Scope inherit the invoking context

Introduce one typed `ReportScope` interface shared by route builders, report selectors, data preparation, and Paperwork Print coverage:

```typescript
type ReportScope =
  | { kind: 'show'; showId: string }
  | { kind: 'trial'; showId: string; trialId: string }
  | { kind: 'class'; showId: string; trialId: string; classId: string };
```

Show, Trial, and Class pages pass their own context as the default. Reports may deliberately change to another supported scope. A page exposes direct actions only for reports supporting that scope. When a broader report is relevant, its label names the broader scope, such as `Open Trial report`; it never silently expands to Show scope.

The report registry remains the canonical definition of supported scopes. Armband Labels expand from Show-only to Show/Trial/Class. All report data selection applies scope before document-specific inclusion rules.

### 9. Keep Armband Label and Result Label identity distinct

An Armband belongs to one Dog for the entire Show. Armband Label selection narrows Entries to the chosen Report Scope, then groups by Dog/Armband and included calendar day:

- eight Classes on one day produce one Armband Label;
- entries on two Show days produce two labels;
- different Dogs handled by one person retain distinct labels;
- Class/Trial scope narrows eligibility before the same Dog/Armband/day grouping.

Result Labels remain one-per-Entry/result because each Class result is distinct. They are never deduplicated across Classes.

These rules live in pure report-selection functions and are covered by assertion-first tests. The current show-wide Entry-to-Armband-label mapping is replaced rather than layered with a UI-only deduplication.

### 10. Compact Show Desk chrome with explicit owner approval

Setup retains the full hero, quick facts, and publishing controls. Show Desk replaces them with a compact context bar containing Show identity, selected day/Trial context, status, published-state exception when relevant, and offline/sync state. Publishing remains reachable but routine publish cards no longer dominate show-day work.

This deliberately revises the existing protected always-visible publish-row intent with product-owner approval. The new intent must be documented in an `// INTENT:` comment near the conditional shell behavior.

### 11. Use one design approval gate before implementation

The static mockups and later functional prototype must be walked with:

- a scent-work Show using Gym, Storage Room, Kitchen, and Conference Rooms A + B;
- a numbered-ring sport variant;
- four or five concurrent Classes including late move-up/conflict, pre-Class paperwork, active paper scoring, completed results, labels, and stale prints;
- desktop and tablet widths;
- offline state and two staff print confirmations.

Within roughly ten seconds, a secretary must identify what is running, what needs immediate attention, what is next, which completed Class needs closeout, and which paperwork is unconfirmed or stale. The walk must also prove exact deep links and context restoration.

## Risks / Trade-offs

- **[Risk] Schedule times are missing or inaccurate.** → Use configured order as a stable fallback, display `Time not set`, and never manufacture time precision.
- **[Risk] Attention ranking creates false confidence.** → Keep the complete schedule permanently visible, explain each ranking, limit alerts to verified destinations, and test ranking as a pure module.
- **[Risk] The focused panel duplicates Class Details.** → Limit it to orchestration facts/actions and route full data/configuration to the canonical Class page.
- **[Risk] Paperwork Print confirmation adds friction.** → Ask only after print invocation, keep `Not yet` harmless, provide direct `Record as printed`, and never block workflow.
- **[Risk] Absence of a Paperwork Print is mistaken for proof of no paper.** → Use `not confirmed printed`, keep reminders low-priority, and allow staff to record externally produced paper.
- **[Risk] Coverage manifests become large for Show-wide reports.** → Store compact stable subject keys and per-Class/document fingerprints; set practical size tests using launch-scale fixtures before migration approval.
- **[Risk] Two offline secretaries produce simultaneous confirmations.** → Append both records; do not use last-write-wins for confirmation inserts.
- **[Risk] Staleness rules drift across reports.** → Centralize document fingerprint builders in the Paperwork Print module and test the public interface.
- **[Risk] Context return parameters become an open redirect.** → Accept only validated internal route shapes built by typed helpers.
- **[Risk] Compact chrome hides publishing health.** → Keep exceptions visible in the context bar and keep full controls on Setup.
- **[Risk] Operational Area becomes accidental scope growth.** → Display area only when supplied; keep its persistence behind a separate approval/change.

## Migration Plan

1. Approve the static scent-work/tablet/ring-sport mockups against the scenario gate; revise artifacts without production changes.
2. Build and test the pure schedule/attention/focus projection behind the existing Show Desk seam, initially rendering it under a development flag or test harness.
3. Replace the current stacked Show Desk projection in one controlled cutover; preserve the shared action executor and owner routes. Rollback restores the former renderer without data migration.
4. Add typed Report Scope routing and pure label-selection tests; expand Armband Labels to Trial/Class scope before exposing those actions.
5. Add the Paperwork Print migration, RLS, replication table, offline mutations, correction behavior, and document fingerprints. Rollback can hide confirmation UI while retaining append-only audit rows.
6. Add compact Show Desk chrome and its replacement `// INTENT:` documentation.
7. Run focused unit/component tests, offline/concurrency tests, desktop/tablet browser walks, and both scenario acceptance walks before rollout.

## Open Questions

- Durable Operational Area configuration remains intentionally deferred. If later approved, it must support named Search Areas, numbered Rings/Courses, and multiple assignments per Class.
- The functional prototype should confirm whether 30 minutes is sufficient for every supported sport; 30 minutes is the approved default, not a user-facing setting in this change.
- Launch-scale testing must set a safe upper bound for a broad Paperwork Print coverage manifest before the migration is finalized.
