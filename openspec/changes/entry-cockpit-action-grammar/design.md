## Context

Live audit findings (2026-07-22) against the redesigned cockpit at `/shows/:showId/entry-management`. The queue/exception IA is sound; the gaps are action discoverability, vocabulary drift, missing guard rails, and an unfinished responsive pass. INTENT anchor: secretary = "That was easy"; max ~2 taps for common actions; outdoor-tablet legibility.

Key components (all under `apps/myk9show/src/components/entries/management/` unless noted):

- `EntryFocusedRegistration.tsx` — focused card: header badge, "Primary work" panel, hosts `EnrollmentCard`.
- `EnrollmentCard.tsx` + `entryActions.tsx` — "Actions ⋯" menu (Accept All / Reject All / Missing Info / Check In All).
- `EntryStatusPopover.tsx` — per-entry change-status menu (Accept entry / Pending / Missing Info / Pulled / Reject entry; Withdrawn / Remove Entry).
- `EntryRegistrationQueue.tsx` (+ row pieces, `entryManagementCockpitResponsive.ts`) — queue list, chips row, density.
- `apps/myk9show/src/components/shows/ShowDetails/{ShowDetailTabs,EntriesTab}.tsx` — manager-facing Entries tab duplicate.

Constraints: no new routes/pages; offline-first paths untouched; Base UI (shadcn) components; Prettier hook; files under 500 lines (extract siblings if a file would grow past it).

## Goals / Non-Goals

**Goals**

1. Accept/Reject reachable in ≤2 taps from the focused registration, visually tied to the "Primary work" recommendation.
2. One review-state vocabulary rendered identically in queue rows, focused badge, status menus, and bulk toolbar; current state marked in menus.
3. A confirmation guard before a Completed (scored) entry can be reverted to a pre-scoring status.
4. Queue chips and rows usable at 390 px width.
5. Show-details "Entries" tab (manager audience) becomes a lightweight summary + "Open Entry Management" link; the exhibitor-facing `MyEntriesTab` is untouched.

**Non-Goals**

- No changes to entry lifecycle states, payment semantics, emails, or server logic.
- No server-side enforcement of the revert guard (client confirm only; note as future hardening).
- No redesign of Exceptions sub-views (move-ups/pulls/waitlist) beyond vocabulary reuse.
- No changes to the public/anon Entries view.

## Decisions

### D1 — Primary actions live in the primary-work panel

The "Primary work" panel in `EntryFocusedRegistration` gains explicit buttons derived from `registration.recommendedAction`: for a needs-review registration, **Accept** (primary variant) and **Reject** (destructive-outline) act on the affected entry ids — the same handlers the "Actions ⋯" menuitems call today. The overflow menu keeps all four verbs for completeness (harmless duplication inside one component; the menu is the power-user path, the panel is the discoverable path). When nothing needs action (e.g. all entries Completed), the panel states that plainly ("No action needed — all entries processed") instead of "View registration … currently needs this action."

Alternative considered: a sticky action bar at the card footer — rejected; it detaches the action from the recommendation copy that explains it.

### D2 — Vocabulary is a single mapping module

Add a small pure module (e.g. `reviewStateLabels.ts` sibling to the cockpit components) exporting the canonical label/icon/tone for each review state (accepted, needs review, missing information, rejected, plus payment overlay labels used in rows). Every consumer (queue row, focused badge via `reviewLabel()`, `EntryStatusPopover` items, bulk menu labels) reads from it. Decision rule: **states are nouns/adjectives ("Accepted", "Pending", "Missing information"), menu commands are verbs ("Accept", "Reject", "Mark missing information")** — the menu shows commands, the badge/rows show states, and the mapping module owns both strings so they can't drift. "Reviewed" disappears in favor of "Accepted".

### D3 — Current-state marking and revert guard in `EntryStatusPopover`

The menu marks the entry's current status (check indicator + disabled row). If the entry's current status is Completed (or otherwise scored) and the chosen target precedes scoring (accepted/pending/missing info), an `AlertDialog` confirms: "This entry has a recorded result. Changing it to <state> removes it from results until re-scored." Uses the existing per-mount latch pattern for double-submit safety (see project lesson on AlertDialog guards). Scored detection uses the entry fields already available to the popover (`entry_status === 'completed'`/result presence) — no new data fetch.

### D4 — Narrow layout: wrap chips, stack rows

- Chips row: `flex-wrap` at the cockpit's compact breakpoint (chips wrap to a second line; the View/Density control moves to the row end, never overlapping). No horizontal scroll — wrap is simpler and always visible.
- Rows: at compact width, each registration row stacks (name + confirmation line, then entries line, then status/payment line, then action link) instead of the 4-column grid; one DOM copy repositioned via the existing responsive state (`entryManagementCockpitResponsive.ts`), not a second CSS-hidden copy (project rule: no responsive two-copy antipattern).

### D5 — Entries tab becomes summary + link

For managers, `ShowDetailTabs` renders a slim summary (total entries, needs-review count, payment-due count — data already available from the cockpit hooks' underlying query/props) with one primary "Open Entry Management" button and no duplicate table. The `EntriesTab` flat-table remains only for the anon/public audience path it already serves; if analysis during implementation shows managers were the only consumer, delete the manager branch outright (deletion preferred over dormancy).

## Risks / Trade-offs

- **Duplicate action paths (panel + menu)** — mitigated by both calling the same handlers; tests assert one shared implementation.
- **Vocabulary sweep misses a consumer** — mitigated by grepping all render sites for the current strings ("Reviewed", "Accept entry", "Needs review", etc.) and pinning the mapping module with source-text tests.
- **Revert guard annoys legitimate corrections** — confirm dialog only for scored entries; all other transitions stay one-click.
- **Row stacking changes visual density on tablets** — apply only at the compact breakpoint already computed; verify 768 px keeps the grid.
- **Entries-tab consolidation surprises anon visitors** — audience split is explicit in `ShowDetailTabs`; anon path untouched and covered by a test.

## Migration Plan

Pure front-end, single PR (or two: cockpit grammar vs. entries-tab consolidation) after the audit bug-fix PR merges. No data or route migrations. Rollback = revert.

## Open Questions

- Should Reject from the primary panel require a reason (matching `WithdrawalReasonDialog` patterns) or stay one-click with undo-via-status-pill? Default: one-click, matching today's menu behavior.
- Server-side guard for scored-entry status regressions — worth a follow-up issue after client guard ships?
