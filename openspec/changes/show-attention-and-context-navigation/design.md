## Context

The foundation this change consumes is concrete and already merged: `features/entry-operations/attentionClassification.ts` (`classifyEntryAttention`, `getOperationalEntryState`, `matchesOperationalAttentionFilter`) and `entryAttentionRoutes.ts` (`getEntryManagementHref` and class-scoped href builders), established by PR #1341 and specified in the `class-entry-operational-visibility` change (the "MYK9-18 foundation" referenced by MYK9-50). Count parity between surfaces is already locked by `attentionCountAgreement.test.ts`; this change extends that test pattern rather than inventing a new one.

myK9Show already has pieces of actionable attention and context navigation:

- The Class & Entry Operational Clarity work defines canonical attention reasons, deep-link routing, and class readiness.
- Entry Management owns broad entry clearing actions and has URL-backed trial/class/attention/payment scope.
- Class Details owns the class overview and run sheet.
- Show Workbench owns show-level orientation and operational readiness.
- Existing detail surfaces already know many relationships through their loaded rows and route parameters.

The risk is not a lack of links; it is adding competing calculations or a new queue that makes the secretary reconcile multiple “truths.” This change is a thin routing/presentation layer over existing classifiers and owner surfaces.

## Goals / Non-Goals

**Goals:**

- Show a concise, factual attention summary where a secretary already orients to a show.
- Make each attention item actionable in one interaction by landing on the surface that clears it.
- Provide compact related-context navigation without requiring a user to restart at the show page.
- Preserve show scope, role authorization, offline/cached readiness, and partial-data honesty.

**Non-Goals:**

- No new attention taxonomy, manual health score, generic task queue, or activity graph.
- No replacement of Entry Management, Class Details, Show Desk, scoring, dog profiles, or people pages.
- No direct PostgREST read added to a core offline-required path merely to populate a link.

## Decisions

### 1. Consume canonical attention contracts

The summary delegates to the existing entry/class attention classifiers and readiness helpers. It does not count raw statuses independently. If a classifier or destination is not yet actionable, the signal is omitted or narrowed rather than rendered as a vague warning.

The Workbench summary is an index of existing work, not a new clearing surface. Each item contains a reason, count, and destination label; the destination owns the corrective action.

Alternative considered: create a new “Triage” page containing all exceptions. Rejected because it duplicates Entry Management, Class Details, Show Desk, and existing readiness routing.

### 2. Use route helpers for exact destinations

Create or reuse typed route builders for attention destinations. A route carries show ID and, when relevant, trial, class, attention, payment, mode, roster, or view parameters. Callers do not hand-build query strings.

The acceptance contract is count-to-destination agreement: a summary count must equal the visible items at its destination for the same fixed dataset and scope.

### 3. Keep related navigation compact and hierarchical

Related links appear as breadcrumbs or a small “Related” line in an existing detail header/section. They use known relationships and route to the canonical owner surface:

- Show to trial/class;
- Trial to show/classes/entries;
- Class to trial/show/entries;
- Entry to class/show/dog/person;
- Dog or person to relevant show/entry context when already loaded.

The UI does not attempt to render a graph or fetch every related record. A link is shown only when its target ID and authorized route are known.

Alternative considered: add a universal related-record graph. Rejected as visually heavy, difficult on tablet, and unnecessary for the common secretary path.

### 4. Preserve offline and partial states

Attention counts use replicated or already-loaded class/entry data. If the source is loading, the summary uses a compact loading state; if it fails, it does not claim zero. Related links render from known local relationships and disappear or show a quiet unavailable state when the target is not loaded.

### 5. Keep role and show scope at the route boundary

Staff-only attention signals are not rendered for exhibitors or anonymous visitors. Every target route retains the existing authorization boundary. Related links never expose another show’s entries, people, or dogs merely because a shared person/dog ID is known.

## Risks / Trade-offs

- **[Risk] Summary count differs from destination count.** → Reuse the same predicates and add fixed-dataset count-to-filter tests.
- **[Risk] A readiness chip lands on an explanatory page with no clearing action.** → Do not render it as actionable until the destination contains the clearing affordance.
- **[Risk] A related link crosses show scope.** → Require show context and authorized route input; add cross-show fixtures.
- **[Risk] Workbench becomes a second management list.** → Keep it to reason/count/destination summaries and remove row-level editing from the summary.
- **[Risk] Offline data looks complete when it is partial.** → Preserve existing replication first-sync/loading/error states and avoid confident zeros.
- **[Trade-off] Some relationships will not show when their target is not loaded.** → Prefer an honest absent link over a blocking fetch or a misleading global search.

## Migration Plan

1. Inventory existing readiness/attention consumers and route helpers; identify duplicates and preserve the canonical ones.
2. Add a shared attention summary model that consumes existing classifiers and destination builders.
3. Add the summary to the existing Workbench/readiness surface with staff gating and partial states.
4. Add related-context links to the highest-value existing detail headers, beginning with Class Details and Entry Management.
5. Add count-to-destination, authorization, cross-show, offline/cached, and browser-walk evidence.

Rollback removes the summary and related links while leaving canonical owner pages, classifiers, and routes intact. No database migration is required.

## Open Questions

- Which existing Workbench block is the least duplicative host for the first attention summary?
- Which two related links are most useful on Entry Management without adding header clutter?
- Should the first release include person/dog links from entries only when the target is already in the loaded projection?
