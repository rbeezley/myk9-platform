# Entry Management UX Audit

**Scope:** Authenticated show-secretary Entry Management (`/shows/:showId/entry-management`)

**Date:** 2026-07-20

**Intent anchor:** The secretary should feel “That was easy.” Entry Management should absorb entry, payment, and exception complexity instead of presenting every state and operation at once.

## Executive finding

Entry Management is not suffering from a lack of capability. It is suffering from competing projections of the same capability.

The page currently exposes:

- four peer page tabs: Entries, Move-ups, Pulls, Waitlist;
- two quick-view modes: Review and Day-of;
- two additional presets: Payment due and All entries;
- attention and payment filter controls;
- trial and class scope selectors;
- a trial-scoped List/Roster switch;
- Table/Cards view switching;
- density, display preset, and saved-view controls;
- six summary cards;
- entry-level actions, enrollment-level actions, payment actions, email actions, and lifecycle-email actions.

Each mechanism is defensible in isolation. Together they make the secretary construct a mental model of the page before doing work. The result is a busy screen with many badges and controls but no clear answer to: **“What should I handle next?”**

The recommended direction is a **single entry work queue with one primary mode, one scope row, one filter disclosure, and a calmer table**. Move-ups, pulls, and waitlist should remain available, but as a clearly separated Exceptions destination rather than four equal tabs competing with the main queue.

This is a consolidation and projection change, not a data-model rewrite. Existing actions, hooks, dialogs, deep links, and query paths should survive behind a simpler surface.

## Pass 1: Mental Model Alignment

**What UI suggests:**

The page suggests that Entry Management is simultaneously a registration dashboard, a payment ledger, a show-day check-in console, a roster browser, an exception queue, and a saved-view workspace.

**What it actually does:**

It loads show-wide entry rows, filters them by status/payment/trial/class/search, and provides actions for entry decisions, check-in, armbands, payments, communications, and removal. Move-ups, pulls, and waitlist are separate management surfaces rendered inside the same page shell.

**Misalignment gaps:**

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| `Review` quick view | A focused list of entries needing a secretary decision | Sets `attention=pending`, table view, and review-mode row actions | High |
| `Day-of` quick view | A show-day operations view | Sets `attention=accepted`, table view, but still includes registration/payment concepts | High |
| `Payment due` preset | A payment work queue | Changes payment filter and other view state, while payment actions remain mixed into row menus | Medium |
| `Attention` filter | A short list of urgent categories | Includes ordinary lifecycle states (`Accepted`, `Waitlist`) alongside “Issues” and missing information | Medium |
| `Entries / Move-ups / Pulls / Waitlist` tabs | Four equivalent views of entries | Three tabs replace the entire content app with different operational concerns | High |
| `Roster` toggle | A different representation of the current entry set | Fetches a class-grouped roster with a second table and different columns/actions | High |
| Status/payment/email badges in one cell | A concise entry state | Several independent workflows compressed into one visual cluster | High |

**Jargon found:**

- “Attention” is internal workflow language; “Needs review” or “Needs action” is clearer.
- “Day-of” is understandable to staff but too broad as a primary mode; “Show day” is clearer and aligns with the Show Desk vocabulary.
- “Pulls” is domain-correct but should be paired with “Scratches / pulls” at least once for discoverability.
- “Roster” is useful, but it should describe a class roster destination/view, not silently compete with the main entry list.
- “Comp” and “uncomp” remain action jargon and should be expanded in visible labels.

## Pass 2: Information Architecture

**Current structure:**

1. Show Desk return link.
2. Page title plus Copy view link, Add entry, and Export CSV.
3. Action error alert.
4. Four page tabs.
5. Trial and class selects.
6. Filter breadcrumb and related context links.
7. Trial List/Roster switch and Score this class link.
8. Six statistics cards.
9. Quick-view preset controls.
10. Search, attention filter, payment filter, view toggle, and result count.
11. Table or cards, followed by bulk actions.

The primary work controls are below context, tabs, scope, breadcrumbs, and six cards. The order reflects implementation history more than secretary workflow.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Too many peer destinations | Page tabs | Exceptions look equal to the main entry queue even though they have different jobs and different data models | Make `Entries` the primary queue and group Move-ups, Pulls, and Waitlist under a clearly labeled `Exceptions` destination or drawer |
| Multiple control axes | Quick views + filters + view options | A secretary must know which control owns status, payment, mode, layout, and scope | Use one primary work-mode control; move secondary filters under `More filters` and keep display settings separate |
| Scope appears before purpose | Trial/Class filters above stats and queue | The secretary chooses a scope before seeing what needs attention in it | Put queue purpose first, then allow scope to narrow it; retain URL deep links |
| Summary competes with work | Six stat cards | Revenue and outstanding balance receive the same visual weight as pending decisions | Replace with a compact queue summary strip; move financial totals into a secondary summary or payment view |
| Duplicate representations | Table, cards, enrollment cards, roster table | The same people/entries can appear in several shapes with different actions and status treatments | Use one canonical entry list; make responsive layout a rendering detail, not a separate conceptual mode |
| Context links are additive | RelatedContextLinks plus TrialScopeBar | Navigation to related pages is mixed into the filter/work area | Keep deep links, but place them in a compact “Related” menu or scope header |

**Visibility problems:**

Hidden but should be visible:

- The current show/trial scope and the active queue purpose should be explicit together.
- The single most important next action for the current queue should be visible without opening a row menu.
- Active filters should be summarized in one place.

Prominent but should be secondary:

- Revenue and outstanding totals on the main work queue.
- Density/display preset/saved views.
- Email and lifecycle-email state in the primary status column.
- The Table/Cards conceptual toggle.

## Pass 3: Affordance Clarity

**Affordance audit:**

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Quick view buttons | Primary navigation | URL-writing compound presets | Partly |
| Attention filter | Status tab | A mixed status/issue filter | Partly |
| Payment badge on enrollment card | Read-only status | Dropdown trigger for payment mutations | No |
| Entry status badge in list card | Status label | Dropdown trigger for lifecycle changes | Partly |
| Row action menu | Overflow actions | Contains core status, payment, email, refund, armband, and destructive operations | No |
| Class badges | Class identity | Mostly static labels, but visually compete with state badges | Yes, but too loud |
| Email status icon/badge | Communication state | May open resend or lifecycle-email review actions | No |
| Roster/List buttons | Alternate display | Roster changes data source/shape and adds class grouping | Partly |
| `Score this class` | Related navigation | Deep link to a separate scoring surface | Yes |

**False affordances:**

- The page tabs imply interchangeable entry views even though the exception tabs are separate workflows.
- “All entries” looks like a filter but also changes work mode and table view.
- A compact status cluster looks like a summary, but several items are actionable.

**Hidden affordances:**

- The canonical place to change an entry’s status is not obvious because it varies between row menu and inline badge/dropdown.
- Payment actions are discoverable only after recognizing the payment badge as a button.
- The relationship between an enrollment-level payment action and an entry-level status action is not visible.

**Recommended fixes:**

- Make the primary status control a single labeled, clickable status treatment with a consistent menu pattern.
- Move secondary signals (email sent, notes, lifecycle email) into a quiet metadata line or a dedicated “Activity” affordance.
- Reserve badges for one primary status and exceptional states; use plain text for counts and descriptive metadata.
- Make row actions consistent: one obvious primary action when applicable, one overflow menu for the rest.

## Pass 4: Cognitive Load

**Decision points:**

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Opening the page | Which tab, which quick view, which trial/class, which filters, which display preset | Yes: land in one queue with a recommended work mode and optional scope |
| Reviewing an entry | Interpret status, payment, email, lifecycle email, classes, and notes before choosing an action | Yes: promote the next decision and collapse secondary signals |
| Managing payment | Identify enrollment vs entry ownership, then find a badge/menu | Yes: make payment a distinct action area or payment queue |
| Show-day preparation | Decide between Day-of, accepted attention, show-day display, roster, and class scope | Yes: use one Show day queue and a direct class roster deep link |
| Bulk actions | Select rows, understand which hidden filters apply, choose status/check-in action | Partly: show the active queue and selection scope beside the bulk bar |

**Missing defaults:**

- A clearly communicated default queue. The current default is technically `Review`/pending but is not framed as the recommended starting point.
- A default sort/grouping that matches secretary work (for example, urgency first, then handler/dog; or trial/class when scoped).
- A clear “next action” recommendation for each row.

**Unnecessary complexity:**

| Complexity | Who Needs It | Recommendation |
| --- | --- | --- |
| Saved views | Repeat/power users | Keep behind View options; do not let it shape the primary layout |
| Density and display preset | Users with specific screen/workflow preferences | Keep behind View options and remember preferences |
| Enrollment cards plus entry cards | Payment/enrollment workflows | Use a secondary enrollment detail drawer or dedicated payment queue; do not duplicate the default list |
| Lifecycle email state in every row | Secretaries actively sending decisions | Show only when relevant to the current queue; keep full history in the entry detail/action surface |
| Six top-level statistics | Oversight/reporting | Reduce to queue counts and move financial summary into a separate compact section |

**Cognitive load score:** **High.** The page asks the secretary to choose a representation before choosing a task, then presents multiple independent statuses in each row. It is capable but not calm.

## Pass 5: State Coverage

### Main Entry Queue

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty show | Yes | Good | Add-entry CTA exists; page still carries substantial controls around an empty result |
| Empty filtered result | Yes | Good | Clear filters exists; the reason for zero results should name the active queue/scope |
| Loading | Yes | Good | Table-shaped skeleton is appropriate |
| Success | Yes | Mixed | The successful state exposes too many simultaneous controls |
| Partial | Yes | Mixed | Payment, email, and missing-info states are represented, but not hierarchically |
| Error loading | Yes | Good | Retry path is explicit |
| Action error | Yes | Mixed | Global alert can compete with the row that needs recovery |
| Offline/sync pending | Indirect | Mixed | Underlying offline behavior exists, but entry actions do not make save/sync state locally obvious |

### Exception Queues

| State | Implemented? | Quality | Issue |
| --- | --- | --- | --- |
| Empty move-ups/pulls/waitlist | Yes | Unknown without visual walk | Each surface should have a task-specific explanation and next step |
| Loading | Yes/varies | Mixed | Separate sub-surfaces create inconsistent loading and empty language |
| Error | Yes/varies | Mixed | Error recovery is not unified across the four page tabs |
| Return to main queue | Yes via tabs | Weak | The current peer-tab model does not communicate that these are exceptions to the main workflow |

**Dead ends found:**

- Selecting a trial can expose a different Roster view whose actions and columns do not match the main list; returning to the entry queue requires understanding the List/Roster toggle.
- A payment or communication issue may be visible as a badge but require opening a row/enrollment menu to discover the clearing action.
- A secretary can reach a filtered empty state without a strong explanation of which queue, scope, and filters produced it.

**Missing error handling:**

- Action errors should be anchored to the affected row or enrollment when possible, not only shown at page top.
- Sync/offline feedback should distinguish “saved on this device” from “not saved.”

## Pass 6: Flow Integrity

### Primary flow: review new entries

1. Open Entry Management.
2. Identify the current show.
3. Choose or infer Review.
4. Interpret pending/missing information/payment/email signals.
5. Open each row’s action menu.
6. Accept, reject, request information, edit, or communicate.
7. Repeat until the pending queue is empty.

**Friction:** The page exposes all work modes and filters before the secretary can begin. The row’s primary decision is buried among several status signals and a broad action menu. Completion is not expressed as a calm “review queue clear” state.

### Secondary flow: prepare for show day

1. Switch to Day-of.
2. Choose accepted entries.
3. Choose Show-day display or density.
4. Choose a trial/class.
5. Decide whether to use List or Roster.
6. Find check-in/armband/class actions.

**Friction:** Show-day work is a distinct operational context but is assembled from several controls. The secretary must know which filters are implied by Day-of and which are independent.

### Secondary flow: resolve an exception

1. Open Move-ups, Pulls, or Waitlist.
2. Work in the replacement surface.
3. Return to Entries and re-establish scope/filter context.

**Friction:** Exception work is treated as a peer tab but changes the page’s content model. The return path is functional, not explanatory; the secretary must remember which queue they were in.

### Recovery and abandonment risks

- Accidental bulk actions are guarded, but selection context is visually easy to lose when filters or modes change.
- A secretary can mistake “Accepted” for “ready for show day” even when payment, missing information, or class-level issues remain.
- A row with many badges can hide the one issue that actually requires action.

## Recommended redesign direction

### 1. Make the page a single “Entry work” queue

The default should answer one question: **What entry work needs attention now?**

Suggested spine:

1. **Show context:** show name/date and a compact return link to Overview/Show Desk.
2. **Queue header:** `Entry work` plus one recommended mode: `Review entries`.
3. **Queue summary:** compact clickable counts such as `Needs review`, `Payment due`, `Missing information`, `Accepted`, and `All entries`.
4. **Scope row:** Trial and Class selectors, with the current scope summarized in one line.
5. **Search + More filters:** search always visible; payment/status and advanced filters behind one disclosure.
6. **Canonical table:** one calm row model with a primary status, concise class text, and a predictable action menu.
7. **Bulk action bar:** appears only after selection and states exactly what set is selected.

### 2. Separate exceptions without duplicating entry work

Keep Move-ups, Pulls/Scratches, and Waitlist as existing dedicated surfaces. They should be reachable through a clearly labeled `Exceptions` control or section, not presented as four equal peer tabs. Deep links and URL compatibility remain intact.

This preserves the repository’s consolidation principle: link to existing concerns rather than rebuilding them inside the entry table.

### 3. Use one primary status hierarchy

Each row should have:

- **Primary:** entry decision status (`Needs review`, `Accepted`, `Not accepted`, `Withdrawn`, `Missing info`).
- **Secondary:** payment state as quiet text or a compact financial marker.
- **Exceptional:** one attention marker only when it changes the next action (missing information, payment due, email failed, refund pending).
- **Metadata:** class count/names, handler, armband, confirmation number, notes in subdued text or detail view.

The table should not place entry status, payment badge, email icon, lifecycle-email badge, class badges, and notes badges in the same visual cluster.

### 4. Make the table the canonical representation

Keep responsive cards as a rendering adaptation if necessary, but remove the conceptual Table/Cards toggle from the primary workflow. On mobile, a row can expand into the same detail/action model. The EnrollmentCard can remain available for enrollment/payment detail without duplicating the default queue.

Suggested default columns:

| Column | Content |
| --- | --- |
| Select | Bulk selection |
| Dog / handler | Dog name, handler, entry number/armband in one identity block |
| Classes | Plain text class names or “N classes,” not a badge wall |
| Entry status | One clickable primary status |
| Payment | Quiet status + amount due when relevant |
| Next action | One prominent action when the row needs work |
| More | Secondary actions |

Show-day mode may reorder or add check-in, but should remain the same row model.

### 5. Turn “next action” into the organizing principle

Examples:

- `Review missing information`
- `Request payment`
- `Accept entry`
- `Assign armband`
- `Check in`
- `Open class roster`

Each action should deep-link or open the existing action surface. No duplicate edit/payment/communication implementation should be added to the page merely to save a click.

### 6. Use a focused Show Registration pane

On desktop, the canonical Show Registration queue/table occupies the left side and the selected Show Registration opens in a focused right pane. The queue carries only identity, combined review state, a quiet payment cue, and the next action. The focused pane owns the child Entries, Dogs, Classes, per-Entry Handlers, payment detail, communication history, and secondary actions.

On tablet and mobile, selecting a Show Registration opens the same focused detail full-width with a clear return to the preserved queue and scope. This follows the Show Desk cockpit pattern while keeping Entry Management's registration-level domain model.

### 7. Make search a primary high-volume navigation tool

The queue may contain hundreds of Entries, so a large, persistent search box must sit immediately above the Show Registration list. Search operates over the parent Show Registration and all child Entries, including:

- Exhibitor/submitter name and email;
- Dog name;
- per-Entry Handler name;
- Armband number;
- confirmation number;
- Entry number;
- Class name.

Matching a child Entry returns its parent Show Registration and identifies/highlights the matching Dog, Class, or Handler in the focused pane. Search runs against the already-loaded entry dataset so lookup remains immediate and useful offline. The UI shows a result count, provides a one-tap clear action, preserves the current queue/scope when cleared, and may offer a keyboard shortcut as an optional accelerator rather than the only affordance.

### 8. Use a compact floating selection toolbar

The current full-width fixed footer separates selection count from bulk actions across the viewport and can be missed. Replace it with a Linear-style floating selection toolbar centered above the bottom edge:

- bounded compact width rather than a full-width page footer;
- selected count, primary eligible action, `More actions`, and clear/close in one visual group;
- high-contrast surface, border, and shadow so selection mode is unmistakable;
- labels that state both levels when Show Registrations are selected, such as `3 registrations · 11 Entries`;
- eligibility and partial-failure messaging remains truthful and action-specific;
- bottom content receives enough padding that the toolbar never obscures rows;
- mobile uses an inset responsive toolbar or compact bottom sheet above safe-area/navigation controls.

This should become one shared bulk-selection presentation component. Each surface continues to own its action eligibility and mutation behavior; only the discoverability and layout pattern are shared.

## Proposed acceptance test

Use the same operator scenario that guided Show Desk:

> A secretary has 40 entries across two trials. Five need review, three need payment, one has missing information, two are waitlisted, and the secretary needs to prepare one trial for show day. Can they identify the next three actions, complete them, and return to the same scope without explaining the UI?

Success means:

- The default landing state is understandable in under five seconds.
- The secretary can reach any active queue in one click.
- A row exposes one obvious next action without opening a general-purpose menu.
- Secondary statuses do not visually compete with the primary decision.
- Trial/class scope remains visible and survives deep links.
- Existing Move-up, Pull, Waitlist, payment, edit, armband, check-in, and export capabilities remain reachable without duplicating their underlying surfaces.

## Open product decisions for the design session

1. **Decided:** The default queue is `Needs review`. `All entries` remains one click away.
2. **Decided:** Exceptions are one destination with Move-ups, Pulls/Scratches, and Waitlist sub-navigation. Urgent counts may deep-link from the main queue, but actions remain on their existing specialized surfaces.
3. **Decided:** `Payment due` is a main Entry Management work queue using the same canonical table. It emphasizes amount due and existing payment actions without creating a separate secretary payment page.
4. **Decided:** The canonical table has one row per `Show Registration`. The row identifies the Exhibitor/submitter, confirmation, combined review state, and payment. Child Entries retain their own Dog, Class, and Handler because one Show Registration may assign different Handlers to different Entries.
5. **Decided:** Desktop uses a two-pane cockpit: Show Registration queue/table on the left and the focused Show Registration on the right. Tablet/mobile opens the same detail full-width and returns to the preserved queue/scope.
6. **Decided for `Needs review`:** The row-level primary action is `Review registration`, which opens the focused pane. Per-Entry decisions remain visible there. `Accept remaining entries` may be offered inside the focused pane only when the remaining child Entries are eligible for the same decision; it is never the immediate table action.
7. **Decided for `Payment due`:** The row-level primary action is `Resolve payment`. The table shows a quiet amount-due cue; the focused pane owns payment history and existing request, cash/check recording, and permitted waiver actions.
8. **Decided for `Missing information`:** The row-level primary action is `Resolve missing information`. The focused pane shows the affected Entries and durably recorded secretary notes, then exposes existing edit, contact, and decision actions. It does not infer or display specific missing fields unless they are actually recorded.
9. **Decided:** Remove the `Day-of` quick view from Entry Management. Show Desk owns show-day class operations, check-in, scoring coordination, and class progress. Entry Management retains accepted-entry lookup and status editing, with deep links to the appropriate Show Desk/Class surface for operational work.
10. **Decided:** Remove the visible `Table / Cards` toggle. Entry Management has one responsive Show Registration queue: desktop uses the table/list plus focused pane; tablet/mobile uses responsive registration cards and full-width detail. Density and saved views remain secondary preferences under View Options.
11. **Decided:** Replace the six large statistics cards with one compact selector: `Needs review`, `Missing information`, `Payment due`, and `All registrations`, each with a count. `Accepted` remains a secondary filter within All Registrations. Revenue and outstanding totals move out of the primary entry-work hierarchy.
12. **Decided:** A large, persistent search box is primary queue navigation for hundreds of Entries. It searches the Show Registration and child Entry identities, including Exhibitor/email, Dog, per-Entry Handler, Armband, confirmation, Entry number, and Class, and highlights the matching child context.
13. **Decided:** Search queries all Show Registrations regardless of the active work queue. While text is present, the list becomes `Search results`; clearing search restores the secretary's previous work queue and trial/class scope.
14. **Decided:** Active search temporarily ignores Trial/Class scope and searches the entire Show. Results identify their Trial/Class context; clearing search restores the previous scope unchanged.
15. **Decided:** Desktop shows compact Trial and Class selectors directly below search. Tablet/mobile uses one `Scope` button. Active scope is displayed once; the separate filter breadcrumb is removed, and Trial/Class detail links move into a small related-actions menu.
16. **Decided for `Needs review`:** Oldest Show Registration first, using submission time. Sort controls remain available for Exhibitor, Dog, confirmation number, and submission time.
17. **Decided:** `Missing information` and `Payment due` use oldest-unresolved-first ordering. Exception workflows preserve their domain ordering, such as Wait List position or request time. The UI does not introduce a hidden urgency formula or prioritize payment by dollar amount.
18. **Decided:** Focused Show Registration selection is URL-backed. Attention links, search results, bookmarks, copied views, and browser Back/Forward can address an exact registration while preserving queue and scope. Missing/deleted targets fall back calmly to the queue.
19. **Decided:** A Show Registration row has at most one colored status treatment: its primary review state. Classes use plain text or a count; payment uses quiet amount/status text; email and notes appear only when exceptional as a small icon plus plain label. Child Entry statuses remain in the focused pane. Color communicates action or exception, not ordinary metadata.
20. **Decided:** Main-queue checkboxes select whole Show Registrations because the queue row represents a registration. The floating toolbar names both the selected registrations and affected child Entries, and previews ineligible or mixed Entry outcomes before applying an action. Entry-level selection remains inside the focused registration for class-specific work.
21. **Decided:** Replace the full-width fixed bulk footer with one shared compact Linear-style floating selection toolbar across Show Desk, Class Management, Results Control, and Entry Management. It keeps count, primary action, overflow actions, and clear together; surface-specific eligibility and mutations are reused rather than reimplemented.
22. **Decided:** The floating selection toolbar appears after the first checkbox selection. Row clicks continue to focus a registration; checkbox selection explicitly enters selection mode, so the first selection receives immediate feedback and actions.
23. **Decided:** Paginate the canonical queue at 50 Show Registrations per page with a visible result range and Previous/Next controls. Search, scope, filters, and sorting apply to the full matching set before pagination. The current page and selected registrations persist while focused details are opened.
24. **Decided:** `Add entry` is the only visible primary page-level action. Existing `Export CSV` and `Copy view link` actions move into a compact `More` menu so they remain available without competing with the secretary's daily work.

These are product decisions. Implementation should wait until they are resolved and the redesign is mocked against the two-trial scenario.
