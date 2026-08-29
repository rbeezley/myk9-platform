# Plan — F29b: give the stranded operational actions a home

> **Status:** Active

Scopes **F29b** from [`audits/2026-08-28-secretary-task-walk.md`](audits/2026-08-28-secretary-task-walk.md).
Two secretary capabilities exist in code, are covered by tests, and cannot be reached
by any user. This is a scoping document — no code has been written.

## What is actually unreachable

The audit first said "the Show Map action layer", then "run order", then (after the
2026-08-29 verification walk re-opened F29a) "the whole row-action layer". Tracing
each action to a real surface gives a tighter answer than any of those.

| Action                                 | Reachable?                | Where                                                                                    |
| -------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------- |
| Mark checked in                        | **Yes**                   | `SecretaryRunSheet` — per-row "Check-in status for {dog}" select                         |
| Edit score                             | **Yes**                   | Run sheet score button → paper scoring                                                   |
| Pull / scratch                         | **Yes**                   | Entry Management → Exceptions → Pulls / scratches                                        |
| Message handler                        | **Yes**, badly signposted | Header Messages panel (that signposting is F22/F23)                                      |
| Move-up **requested by an exhibitor**  | **Yes**                   | Entry Management → Exceptions → Move-ups (`MoveUpRequestsTab` approves/denies/waitlists) |
| **Move-up initiated by the secretary** | **NO**                    | —                                                                                        |
| **Run order (reorder / auto-sort)**    | **NO**                    | —                                                                                        |

So F29b is **two capabilities**, not a whole layer. The correction matters: four of the
six actions have homes, and a fix that re-homes all six would duplicate existing
surfaces — the thing this phase of the project is trying to stop.

### The dead ends, concretely

**Run order** is a three-hop dead end:

1. `SecretaryRunSheet` renders entries in run order and links out for reorder — to
   `/shows/:showId/show-desk`.
2. Show Desk's focused-class panel offers **"Run order and class setup"**, which
   points at `getCockpitClassManagementHref` → **Manage Classes**.
3. Manage Classes has no run-order control.

**Secretary-initiated move-up** is dead code on a live page. `ShowDeskPanel` imports
`ShowMapMoveUpDialog`, computes `buildMoveUpTargets`, and wires `confirmMoveUp` — but
the dialog only opens from `runCommand`, `runCommand` resolves a commandId the cockpit
emitted, and the cockpit only ever emits _recommended_ actions
(`getRecommendedActionsForNode(node, …, 1)`). No entry action sets `recommended`, so
the dialog can never open.

## Root cause: two sound decisions that collided

Neither of these was a mistake on its own.

- **B7** (`archive/plan-show-map-workbench-collapse.md` §Phase B7) deliberately moved
  run-order editing _out_ of Class Details and into Show Map, and its step 7 says so
  explicitly: "if Class Details has its own run-order UI today, remove it … Don't ship
  two homes for the same action." The run sheet's own comments still record the move.
- **#291** ("feat(show-map): make public map read-only") deliberately made the Show Map
  on the public show page view-only, a property the collapse plan lists among its
  architectural commitments.

The collision is that **`ShowMapTab`'s only surviving mount is that public page.** B7
put the capability into "Show Map" when Show Map was the workbench's operational
surface; the workbench collapse then left `ShowMapTab` mounted only on the browsing
page, where #291's read-only rule correctly applies. The capability fell into the gap
between the two, and no test failed because both components still work in isolation.

The collapse plan's own division of labour is what makes the fix direction obvious:

| Action class                                                              | Lives in                    |
| ------------------------------------------------------------------------- | --------------------------- |
| Operational / lifecycle (scratch, move-up, check-in, score, message)      | **the operational surface** |
| Configuration / edit (judge assignment, run order metadata, entity edits) | Detail pages                |

It also states: "The single operational surface is now `ShowWorkbenchPage`" — which the
collapse replaced with **Show Desk**.

## Options

**A — Put them back on `SecretaryRunSheet` (class detail).**
Cheapest: the run sheet already lists entries in run order with per-row controls, and
already had the drag handle before B7 removed it.
_Against:_ directly reverses B7 step 7 and the surface-boundary commitment. Reversing a
documented decision is exactly what the F29 revert this session was about.

**B — Complete Show Desk (recommended).**
Give the focused-class panel entry rows carrying Move up, and a run-order control on
the class row. Show Desk is the surviving operational surface, so this _completes_ the
collapse rather than reversing B7.
_Against:_ the cockpit's vocabulary today is class-level links, not entry rows — this is
a real build, not a wiring change.

**C — Build it on Manage Classes**, where the "Run order and class setup" link already
lands. Defensible for run order (the boundary table files "run order metadata" under
detail pages) but wrong for move-up, which is operational.

**D — Mark the entry actions `recommended: true`.**
Rejected. `getRecommendedActionsForNode` caps at 1 per node, and `recommended` also
drives attention counts and other recommended surfaces — this would change ranking
semantics app-wide to fix a rendering gap.

## Recommendation

**Option B, split in two.**

**Phase 1 — Move-up.** Add entry rows to the Show Desk focused-class panel, each
offering the actions `getDirectActionsForNode` already returns for a `dog-entry` node,
filtered to those with no other home (initially: Move up). The mutation path is already
built and tested — `ShowMapMoveUpDialog`, `buildMoveUpTargets`, `confirmMoveUp` — so
this is a rendering change, not new domain logic.

**Phase 2 — Run order.** Bring `ShowMapRunOrderMenu` + `reorderMode` onto the same
panel, and repoint the run sheet's "reorder lives on Show Desk" link and Show Desk's
own "Run order and class setup" link at it. Only after Phase 1 proves the panel's
entry-row shape.

Deliberately **not** in scope: re-homing check-in, edit-score, scratch or message —
they have working homes, and moving them would duplicate surfaces.

## Testing

A phase is not complete until these pass.

- **Reachability, not just rendering.** The regression that created F29b was a component
  that worked while nothing mounted it. Each phase needs a test asserting a _user path_:
  from `/shows/:showId/show-desk`, reach the control without navigating by URL.
- **Unit:** the focused-class panel renders an entry row per entry and emits the
  expected commandId; `runCommand` resolves it to the action.
- **Mutation check:** removing the new control must fail the new tests.
- **E2E:** extend the secretary walk — open Show Desk, focus a class, move an entry up,
  assert the source class loses one entry and the target gains one.
- **Browser verification on staging**, because both prior F29 verdicts were wrong in a
  way only a browser exposed: a claim that an action is reachable must be demonstrated
  by reaching it, not by finding it in the action catalog.

## Open question for the PO

Phase 2 needs one decision: should run-order editing live on **Show Desk** (operational,
consistent with B7's intent) or on **Manage Classes** (where the existing deep link
already points, and where the boundary table files "run order metadata")? Phase 1 does
not depend on the answer.
