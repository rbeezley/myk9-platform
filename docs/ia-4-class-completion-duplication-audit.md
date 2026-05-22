# IA-4 Audit — Class Completion Duplication

**Date:** 2026-05-22
**Scope:** Verify whether the Show Map `Mark Class Complete` action duplicates a class-detail or secretary-class completion path.
**Result:** Duplication confirmed and remediated in PR #293.

## Pass 1: Mental Model Alignment

**What UI suggests:** Class lifecycle work during show day should happen from the secretary workbench Show Map. The class details page is framed as class management, run-order, and scoring navigation.

**What it actually does:** A secretary can mark a class complete from both Show Map and the public class details route.

| UI Element | User Expects | Actually Does | Severity |
| --- | --- | --- | --- |
| Show Map row action: `Mark Class Complete` | Canonical show-day lifecycle action | Uses Show Map guardrails and offline-first class mutation | Low |
| Class details header menu: `Mark Completed` | Secondary class maintenance action | Previously completed the class from a separate public/details route; now replaced by `Open in Workbench` | Medium |

## Pass 2: Information Architecture

**Current structure:**

- Show Map: row-level class lifecycle command in the secretary workbench.
- Class Details: class management page at `/shows/:showId/trials/:trialId/classes/:classId`, with a header dropdown that also includes lifecycle commands.
- Class Management: secretary setup/admin table with arbitrary status changes and bulk status changes.

**IA issues:**

| Issue | Location | Problem | Recommendation |
| --- | --- | --- | --- |
| Duplicate completion command | `ClassDetailsPage` header actions | `Mark Completed` duplicated Show Map's `Mark Class Complete` command | Remediated by removing the Class Details lifecycle command and routing secretaries to the workbench |
| Inconsistent mutation contract | `ClassDetailsPage` vs `showMapActionMutations.ts` | Class Details wrote only `{ status: 'Completed' }`; Show Map writes `classStatus`, `actual_end_time`, and `isCompleted` via the replication table | Remediated by removing the duplicate mutation path |
| Missing scoring guardrail | `ClassDetailsPage` header menu | Class Details allowed completion whenever `currentClass.status === 'In Progress'`; Show Map hides completion until scoring progress is resolved | Remediated by removing the duplicate command |

**Not considered a duplicate:** `ClassManagementPage` lets secretaries set any class status in a setup/admin table, including bulk changes. That is broad maintenance tooling, not the same show-day quick action.

## Pass 3: Affordance Clarity

| Element | Looks Like | Actually Is | Clear? |
| --- | --- | --- | --- |
| Show Map `Mark Class Complete` | Contextual row action | Moves an active, scored class into wrap-up | Yes |
| Class Details `Open in Workbench` | Header overflow action | Sends secretaries to the canonical show-day workbench | Yes |

**Hidden affordance resolved:** The class details overflow menu no longer hides a high-impact lifecycle mutation in a generic `More` menu on a route that is not the canonical show-day workbench.

## Pass 4: Cognitive Load

| Screen/Step | Decisions Required | Can Be Reduced? |
| --- | --- | --- |
| Secretary finishing a class | Use Show Map row action from the workbench | Done: Class Details now routes to the workbench instead of offering duplicate lifecycle commands |
| Secretary inspecting a class | Interpret whether `Mark Completed` is equivalent to Show Map `Mark Class Complete` | Done: the duplicate Class Details command is removed |

**Cognitive load score:** Medium. The duplicated command is not frequent for every user, but it appears exactly at a high-stakes lifecycle transition.

## Pass 5: State Coverage

| State | Show Map | Class Details |
| --- | --- | --- |
| Scheduled/upcoming class | Offers `Mark Class Started` | Routes secretaries to workbench |
| In-progress class with unscored entries | Hides `Mark Class Complete` | Routes secretaries to workbench |
| In-progress class with resolved scoring | Shows `Mark Class Complete` | Routes secretaries to workbench |
| Completed class | Hides lifecycle completion action | Hides completion action |

The unscored-entry state was the important gap: Show Map had a guardrail, Class Details did not. Removing the duplicate Class Details command preserves the Show Map guardrail as the only show-day completion path.

## Pass 6: Flow Integrity

The canonical flow should be:

1. Secretary works from `/secretary/shows/:showId?phase=today`.
2. Show Map identifies in-progress classes and scoring state.
3. The class row exposes `Mark Class Complete` only when completion is appropriate.
4. Completion writes the same lifecycle fields every time.

The previous Class Details path broke steps 2-4 by bypassing Show Map's progress check and mutation shape. PR #293 removes that path.

## Recommendation

Treat this as a confirmed IA-4 issue remediated by PR #293.

Implemented fix:

1. Remove `Mark In Progress` and `Mark Completed` from the Class Details header overflow on the public-route class details page for secretary/admin users.
2. Add a `Manage in Workbench` / `Open in Workbench` action from Class Details when `parentShow.id` is known.
3. Keep Class Management's bulk status tools as setup/admin tooling, but do not present them as the show-day lifecycle path.

## Evidence

- `showMapActions.ts` / `canMarkClassComplete` — Show Map completion requires an active class and resolved progress.
- `showMapActions.ts` / `mark-class-complete` action — Show Map adds `Mark Class Complete`.
- `showMapActionMutations.ts` / `markShowMapClassComplete` — Show Map completion writes `classStatus`, `actual_end_time`, and `isCompleted` through `replicatedClassesTable`.
- `ClassDetailsPage/index.tsx` / header actions — Class Details now exposes `Open in Workbench` instead of `Mark In Progress` / `Mark Completed`.
- `ClassManagementPage.tsx` / status change handlers — Class Management can set arbitrary statuses, but this is broad maintenance tooling rather than a Show Map row-action duplicate.
