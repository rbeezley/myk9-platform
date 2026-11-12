## Context

Both hosts call the shared ring-move hook during data loading. The hook saves the prior status and uses the replication queue for the move and any restore.

## Goals / Non-Goals

- Keep navigation free of entry writes and preserve the judge's existing one-tap timer.
- Preserve offline writes, Resume timestamps, guarded rollback, and score completion.
- Avoid a new start affordance or a change to the stored status model.

## Decisions

The shared hook remembers the loaded entry without writing. The existing Start controls in timed live sheets call the hook explicitly. The replicated write reads the current entry, preserving any Pull, saved score, registration hold, or active ring stamp that arrived while the sheet was open. Repeated starts on the same sheet retain the first move and timestamp. Existing manual In ring controls cover untimed runs, and submission retains its direct transition to Completed.

## Risks / Trade-offs

The phone regression must distinguish opening from starting and assert the first status after returning without starting the timer with a warm list cache. Retain the existing tests for abandoning a started run and preserving a saved score.
