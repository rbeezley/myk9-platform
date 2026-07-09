## Context

S8.4 asks the secretary to submit results, distribute reports, and archive/close the show. Current code already provides the adjacent closeout workflow:

- `ShowWorkbenchShowDeskPage` composes the canonical Show Desk closeout section.
- `ShowDeskCloseoutSection` gates closeout content until at least one class is wrap-up-eligible.
- `ShowCloseoutSummary` summarizes reconciliation and incident closeout state.
- The closeout section links to Results & Check-In, Reports, and Submit Results.
- `ReplicatedShowsTable`, `ReplicatedTrialsTable`, and `ReplicatedClassesTable` already support offline-first updates to `completed` status values.

The missing piece is the actual final action. The UI can say "Ready to close," but there is no secretary action that writes final show/trial/class closeout state.

Role intent from `docs/INTENT.md`: after the show, the secretary should feel "That went smoothly." The action should be calm, visible only where closeout belongs, and plain about anything still needing attention.

## Goals / Non-Goals

**Goals:**

- Put **Close Out Show** in the existing Show Desk closeout section.
- Keep Reports, Submit Results, and Results & Check-In as the canonical prep surfaces.
- Use replicated show/trial/class mutation paths so the action works with the app's show-day offline-first model.
- Give a clear blocker/readiness summary before closeout.
- Add focused unit tests for helper logic and component behavior.
- Update S8.4 docs after implementation evidence is available.

**Non-Goals:**

- No new closeout page, wizard, or dashboard.
- No new registry form/report capability.
- No database migration unless implementation proves an existing status value is insufficient.
- No payout, treasurer, or Stripe settlement workflow.

## Decisions

1. **Use Show Desk closeout as the home.**
   - Rationale: Show Desk is the existing end-of-show workbench and already owns the closeout section.
   - Alternative considered: add a Show Management closeout page. Rejected because it adds surface area and duplicates the current closeout links.

2. **Create a small closeout action component and pure helper.**
   - Rationale: `ShowWorkbenchShowDeskPage` already gathers show, trial, class, entry, submission, and incident state. A pure helper can classify blockers and a component can render the action without growing the page too much.
   - Alternative considered: fold all logic into `ShowCloseoutSummary`. Rejected because the summary is already a reconciliation/incident card and should not own the cascade mutation.

3. **Cascade using replicated update APIs.**
   - Rationale: show-day persistent status writes must remain offline-first. Updating `ReplicatedShowsTable`, `ReplicatedTrialsTable`, and `ReplicatedClassesTable` queues sync mutations consistently with the rest of show-day work.
   - Alternative considered: one PostgREST RPC. Rejected for this slice because it would be online-only unless additional replication support were added.

4. **Treat closeout blockers as warnings by default, not a hard lock.**
   - Rationale: real dog show secretaries may need to close a show after resolving something on paper or outside myK9. The action should explain unresolved items and require confirmation rather than strand them.
   - Hard lock remains appropriate only when there is no show id or the mutation itself fails.

## Risks / Trade-offs

- **Partial cascade failure** -> Mitigate by using `Promise.allSettled`, reporting failures, and leaving the action uncompleted if any update fails.
- **Completed classes/trials are overwritten unnecessarily** -> Filter out already completed/cancelled rows so the action only updates open rows.
- **Offline closeout appears successful before server sync** -> Use wording that the show is marked closed in this app and will sync through the existing replication queue.
- **"Archive" semantics are broader than `completed`** -> Use `completed` for fall closeout because it is an existing DB status. Treat true archival/deletion/immutability as a future policy decision.
- **Show Store and trial store may have stale local rows** -> Use the same page-level data already feeding Show Desk; tests should cover the payload decisions and the UI state.
