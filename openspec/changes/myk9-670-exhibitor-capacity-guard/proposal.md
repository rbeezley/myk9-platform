## Why

Tracking: MYK9-670. An exhibitor-controlled URL flag currently disables the only client-side class-capacity check, creating an avoidable oversell path before server enforcement ships.

Original request: "Select the next 5 issues from the to-do status. Then orchestrate implementing them using Luna as the implementer as a subagent? Do as many in parallel as you can. work them all the way to an open or merged PR. you will need to use the fallback review of adversarial sub agents as we are out of claude tokens until 9/24."

## What Changes

- Derive organizer late-entry mode from both the URL signal and a non-exhibitor workflow role.
- Keep capacity checks enabled for exhibitors regardless of user-supplied late-entry query parameters.
- Preserve organizer late-entry behavior and add focused regression coverage.

This does not duplicate a surface. It tightens authorization-sensitive derivation inside the existing registration workflow.

## Non-goals

- Server-side capacity enforcement, tracked separately by the Stripe go-live plan.
- Changes to entry-close guards or other correctly role-paired late-entry uses.

## Impact

- Registration wizard state derivation and focused unit tests.
