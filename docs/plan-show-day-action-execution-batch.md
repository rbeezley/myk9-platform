# Show-Day Action Execution Batch

Date: 2026-05-16

## Goal

Turn the ranked Show Map actions into executable show-day workflows without letting each row action invent its own behavior. The first PR should create the shared action-execution contract only; the follow-up action PRs can then run in parallel.

## Shared Contract PR

Branch: `codex-show-day-action-execution-contract`

Owned files:

- `apps/myk9show/src/features/show-map/showMapActions.ts`
- `apps/myk9show/src/features/show-map/showMapActionExecution.ts`
- `apps/myk9show/src/features/show-map/ShowMapRowActionsMenu.tsx`
- `apps/myk9show/src/features/show-map/__tests__/showMapActionExecution.test.ts`
- Existing Show Map tests as needed

Deliverables:

- Define execution kinds for every `ShowMapActionId`:
  - `navigate` for existing links
  - `dialog` for actions that need user input
  - `mutation` for one-tap actions
  - `disabled` for planned-but-not-enabled actions
- Add a typed registry mapping each action id to its execution behavior, disabled reason, success copy, and mutation/dialog key where applicable.
- Route `ShowMapRowActionsMenu` through the registry so disabled states and click behavior come from one place.
- Keep existing navigation behavior unchanged for score/open/print/review actions.
- Keep planned actions visibly disabled until their implementation PR lands.

Testing:

- Unit-test every `ShowMapActionId` has execution metadata.
- Assert navigation actions still invoke `onNavigate`.
- Assert disabled actions render disabled with a clear reason.
- Run focused Show Map tests, myK9Show typecheck, and myK9Show lint.

## Parallel Follow-Up PRs

These PRs may start after the shared contract merges.

1. Mark checked-in action
   - Status: implemented on `codex-show-day-mark-checked-in`.
   - Owns check-in action mutation wiring and row-action success/error handling.
   - Should not edit menu rendering except to flip registry behavior from `disabled` to `mutation`.

2. Move-up dialog + undo last move-up
   - Owns move-up dialog adapter, undo operation, and related tests.
   - May reuse existing `MoveUpDialog`; should keep state local to an action executor/provider.

3. Scratch / no-show + refund boundary
   - Owns scratch dialog adapter, no-show wording, and explicit manual-refund boundary.
   - If Stripe refunds are not ready, ship the manual-refund affordance rather than implying automatic refunding.

4. Message handler + canned replies
   - Owns message-handler dialog/sheet and canned reply template data.
   - Should not change scratch or move-up execution.

5. Schedule-slip communication
   - Owns schedule-slip action surface, exhibitor broadcast draft, and PA-script generator.
   - May add new action ids later through the same registry.

## Parallel Safety Rules

- No follow-up PR should change `ShowMapRowActionsMenu` unless the shared contract is insufficient.
- Each action PR owns one execution adapter and its tests.
- Shared action ids must be added in `showMapActions.ts`; execution behavior must be added in `showMapActionExecution.ts`.
- Destructive or irreversible actions must require an explicit dialog/sheet before mutation.
- Offline-critical updates should use the existing replication/mutation pattern for the affected table whenever available.
