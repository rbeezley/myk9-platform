# IA-4 Audit — Class Completion Duplication

**Date:** 2026-05-22
**Scope:** Verify whether the Show Map `Mark Class Complete` action duplicates a class-detail or secretary-class completion path.
**Result:** Duplication confirmed. Remediation recommended.

## Pass 1: Mental Model Alignment

**What UI suggests:** Class lifecycle work during show day should happen from the secretary workbench Show Map. The class details page is framed as class management, run-order, and scoring navigation.

**What it actually does:** A secretary can mark a class complete from both Show Map and the public class details route.

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Show Map row action: `Mark Class Complete` | Canonical show-day lifecycle action | Uses Show Map guardrails and offline-first class mutation | Low |
| Class details header menu: `Mark Completed` | Secondary class maintenance action | Completes the class from a separate public/details route | Medium |

## Pass 2: Information Architecture

**Current structure:**

- Show Map: row-level class lifecycle command in the secretary workbench.
- Class Details: class management page at `/shows/:showId/trials/:trialId/classes/:classId`, with a header dropdown that also includes lifecycle commands.
- Class Management: secretary setup/admin table with arbitrary status changes and bulk status changes.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Duplicate completion command | `apps/myk9show/src/pages/ClassDetailsPage/index.tsx:200` and `:274` | `Mark Completed` duplicates Show Map's `Mark Class Complete` command | Remove or demote the Class Details completion command; route show-day lifecycle work through Show Map |
| Inconsistent mutation contract | `ClassDetailsPage` vs `showMapActionMutations.ts` | Class Details writes only `{ status: 'Completed' }`; Show Map writes `classStatus`, `actual_end_time`, and `isCompleted` via the replication table | Reuse the Show Map lifecycle mutation helper if this command remains |
| Missing scoring guardrail | `ClassDetailsPage` header menu | Class Details allows completion whenever `currentClass.status === 'In Progress'`; Show Map hides completion until scoring progress is resolved | Apply the same progress guard or remove the command |

**Not considered a duplicate:** `ClassManagementPage` lets secretaries set any class status in a setup/admin table, including bulk changes. That is broad maintenance tooling, not the same show-day quick action.

## Pass 3: Affordance Clarity

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Show Map `Mark Class Complete` | Contextual row action | Moves an active, scored class into wrap-up | Yes |
| Class Details `Mark Completed` | Header overflow action | Also completes the class, without the same framing | Partly |

**Hidden affordance:** The class details overflow menu hides a high-impact lifecycle mutation in a generic `More` menu on a route that is not the canonical show-day workbench.

## Pass 4: Cognitive Load

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Secretary finishing a class | Decide between Show Map row action and Class Details header menu | Yes: keep one canonical show-day action |
| Secretary inspecting a class | Interpret whether `Mark Completed` is equivalent to Show Map `Mark Class Complete` | Yes: remove the duplicate or rename/demote it |

**Cognitive load score:** Medium. The duplicated command is not frequent for every user, but it appears exactly at a high-stakes lifecycle transition.

## Pass 5: State Coverage

| State | Show Map | Class Details |
| --- | --- | --- |
| Scheduled/upcoming class | Offers `Mark Class Started` | Offers `Mark In Progress` |
| In-progress class with unscored entries | Hides `Mark Class Complete` | Shows `Mark Completed` |
| In-progress class with resolved scoring | Shows `Mark Class Complete` | Shows `Mark Completed` |
| Completed class | Hides lifecycle completion action | Hides completion action |

The unscored-entry state is the important gap: Show Map has a guardrail, Class Details does not.

## Pass 6: Flow Integrity

The canonical flow should be:

1. Secretary works from `/secretary/shows/:showId?phase=today`.
2. Show Map identifies in-progress classes and scoring state.
3. The class row exposes `Mark Class Complete` only when completion is appropriate.
4. Completion writes the same lifecycle fields every time.

The current Class Details path breaks steps 2-4 by bypassing Show Map's progress check and mutation shape.

## Recommendation

Treat this as a confirmed IA-4 follow-up.

Preferred fix:

1. Remove `Mark In Progress` and `Mark Completed` from the Class Details header overflow on the public-route class details page for secretary/admin users.
2. Add a `Manage in Workbench` / `Open in Workbench` action from Class Details when `parentShow.id` is known.
3. Keep Class Management's bulk status tools as setup/admin tooling, but do not present them as the show-day lifecycle path.

Acceptable fallback: if product keeps these commands, route them through the same lifecycle helpers used by Show Map, apply the same scoring-progress guard, and add tests proving unscored classes cannot be completed from Class Details.

## Evidence

- `apps/myk9show/src/features/show-map/showMapActions.ts:96` — Show Map completion requires an active class and resolved progress.
- `apps/myk9show/src/features/show-map/showMapActions.ts:345` — Show Map adds `Mark Class Complete`.
- `apps/myk9show/src/features/show-map/showMapActionMutations.ts:61` — Show Map completion writes `classStatus`, `actual_end_time`, and `isCompleted` through `replicatedClassesTable`.
- `apps/myk9show/src/pages/ClassDetailsPage/index.tsx:200` — Class Details `handleCloseClass` writes only `{ status: 'Completed' }`.
- `apps/myk9show/src/pages/ClassDetailsPage/index.tsx:274` — Class Details exposes `Mark Completed` for any in-progress class.
- `apps/myk9show/src/pages/secretary/ClassManagementPage.tsx:115` and `:418` — Class Management can set arbitrary statuses, but this is broad maintenance tooling rather than a Show Map row-action duplicate.
