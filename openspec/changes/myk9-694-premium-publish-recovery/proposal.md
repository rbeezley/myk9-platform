## Why

Tracking: MYK9-694. The canonical premium publish action can fail with a generic message, blocking show publication and hiding the actionable cause.

Original request: "Select the next 5 issues from the to-do status. Then orchestrate implementing them using Luna as the implementer as a subagent? Do as many in parallel as you can. work them all the way to an open or merged PR. you will need to use the fallback review of adversarial sub agents as we are out of claude tokens until 9/24."

## What Changes

- Trace the current generate → PDF upload → show metadata → experience snapshot flow and fix the proven root cause.
- Preserve the single canonical publish action and its per-show double-submit latch.
- Classify known missing configuration/required-data failures into plain, actionable recovery copy while keeping raw payloads out of the UI.
- Keep retries idempotent across the stable `<showId>.pdf` object and show-row updates, and cover partial-progress recovery.

This does not duplicate an existing surface. The existing premium card and Actions command already share one publish flow; the fix belongs in that flow rather than a new recovery page or dialog.

## Non-goals

- A second publishing workflow.
- Hiding server/storage defects behind client-only success.
- Changing premium visual design or adding premium fields unrelated to the demonstrated failure.

## Impact

- Existing premium/experience publish services and shared publish hook.
- Focused generation, upload, metadata, retry, success, and error tests.
