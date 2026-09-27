## Why

MYK9-810 (owner decision, 2026-09-26) says every list in myK9Show that searches, filters, or bulk-acts converges on one shared list toolkit (`apps/myk9show/src/components/list-toolkit/`), proven on `/admin/users` and, as of #2540 (MYK9-795), on Entry Management. MYK9-812 is the next batch: four show-day desk surfaces — the People roster, the Secretary Cockpit schedule, the Self check-in tool, and the Results Control page — each still runs its own hand-rolled search box, filter-pill row, or sticky bulk-action bar instead of the kit. These are the surfaces the trial secretary and gate staff touch live, on show day, so MYK9-810 rule 7 (offline and replication reads unchanged) and rule 8 (views and bulk actions agreed with the owner before building) both apply at full weight. MYK9-812 itself requires the views and bulk actions to be drafted and **approved by the owner before any surface is built**.

This proposal is that draft. It contains no application code — only the per-surface mapping from today's controls to kit components, what gets deleted, the offline/replication contract each surface must keep, and the open OWNER DECISION points the owner must resolve before the build phase (MYK9-812's four follow-on PRs) starts.

## What Changes

- Draft, for each of the four surfaces, a 1:1 mapping from its current pills/search/bulk bar onto `ListViewTabs`, `ListFilterBar`, `ListResultLine`, and `FloatingBulkBar` — reusing the kit exactly as built for Users and Entry Management, forking nothing.
- Name what each surface deletes once its kit view ships (bespoke `FILTERS` button rows, the bespoke `Input` + `Search` icon markup, the sticky `BulkOperationsBar`, the inline `CheckinBulkActions` bar).
- State the offline/replication contract each surface must keep unchanged, naming the exact replicated store or query each one reads today, so a reviewer can check the built PR against a fact instead of a feeling.
- Record every point the four surfaces leave ambiguous as an `OWNER DECISION` line, to be resolved (or explicitly deferred) before MYK9-812's build phase starts.
- Sequence the build after MYK9-842 (same-name-trial disambiguation, touching the People roster's trial-identity formatting and check-in eligibility) merges, per this issue's explicit note.
- **No application code changes in this proposal.** The four follow-on PRs (one per surface, per MYK9-810 rule 2 / tasks.md below) implement against this design once approved.

## Capabilities

### New Capabilities

_(none — this batch reuses the list toolkit's existing component set; no new capability is introduced)_

### Modified Capabilities

- `operational-views`: extends the curated, URL-addressable view-tab pattern (today scoped to Entry Management and Class Management) to the four show-day desk surfaces named above, each replacing a bespoke filter-pill row with `ListViewTabs` while keeping the same filter vocabulary and the "selection clears on view change" rule.
- `bulk-selection-actions`: extends the shared floating-toolbar and scoped-multi-selection pattern (today scoped to Entry Management, Class Management, admin Users, and dogs) to the Self check-in tool and the Results Control page, each replacing a bespoke sticky/inline bulk bar with `FloatingBulkBar` over the same existing mutations. The People roster is explicitly **not** widened to selection-based bulk check-in in this batch (see design.md non-goals) — its existing per-exhibitor "Check in all eligible" action is unchanged.
- `show-desk-people-roster`: restates the "operational lookup" requirement's search box and the three filter pills as the shared `ListFilterBar` and `ListViewTabs`, with identical scenarios (search matches name/dog/armband; `All exhibitors`/`Needs check-in`/`Online` narrow the same way); adds an explicit scenario that bulk multi-select is not introduced by this change.

## Impact

- **Code:** `apps/myk9show/src/features/show-desk-people-roster/ShowDeskPeopleRoster.tsx`; `apps/myk9show/src/features/show-map/cockpit/SecretaryCockpitSchedule.tsx` and `useSecretaryCockpitUrlState.ts` (+ `cockpitRoutes.ts` for the URL codec); `apps/myk9show/src/features/show-workbench/SelfCheckinTool.tsx`; `apps/myk9show/src/pages/secretary/ResultsControlPage/index.tsx`, `OverrideTree.tsx`, and `BulkOperationsBar.tsx`. No changes to `apps/myk9show/src/components/list-toolkit/` are anticipated — this batch is a consumer, not an extension, of the kit (flagged as an OWNER DECISION in design.md if a surface turns out to need a kit gap filled).
- **Dependencies:** sequenced to start after MYK9-842 merges (same branch touches the People roster's trial-identity/eligibility logic this batch also touches).
- **Data/offline:** no schema or replication changes. Every surface's read/write paths stay exactly as documented per-surface in design.md §4.
- **No spec changes to `secretary-class-operations-cockpit`** — its "stable schedule, no reordering" requirement is unaffected; filtering via `ListViewTabs` narrows visible rows the same way the existing pills do today.
