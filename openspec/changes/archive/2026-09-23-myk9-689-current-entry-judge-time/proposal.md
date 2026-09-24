## Why

Tracking: MYK9-689. Showing judge-time estimates before current entry counts exist gives organizers false confidence during trial setup.

Original request: "Select the next 5 issues from the to-do status. Then orchestrate implementing them using Luna as the implementer as a subagent? Do as many in parallel as you can. work them all the way to an open or merged PR. you will need to use the fallback review of adversarial sub agents as we are out of claude tokens until 9/24."

## What Changes

- Gate the existing estimate on current, loaded entry counts and at least one entry.
- Recalculate through the established reactive data path as entry counts change.
- Label the result as based on current entries.
- Follow-up: the calculation multiplies the template's minutes per run by the selected classes' expected entries. The first pass kept `classes x minutes`, which ignored the counts it was gated on; the owner confirmed `judgingTimeEstimate` is minutes per run (the AKC template's value is 3).
- Add focused zero, unavailable, loading, and populated-count tests.

This does not duplicate an existing surface. It corrects when the current class-selection estimate is shown; a link would not prevent misleading data.

## Non-goals

- Per-class setup time (would need a new template field).
- Adding a separate scheduling or analytics screen.
- Introducing a direct online-only read into an offline-capable workflow.

## Impact

- Existing trial class-selection estimate and its data hook.
- Focused component/hook tests.
