## Why

Tracking: MYK9-693. Existing-show trial creation currently calls every trial the first trial, which undermines secretary confidence during setup.

Original request: "Select the next 5 issues from the to-do status. Then orchestrate implementing them using Luna as the implementer as a subagent? Do as many in parallel as you can. work them all the way to an open or merged PR. you will need to use the fallback review of adversarial sub agents as we are out of claude tokens until 9/24."

## What Changes

- Add the existing trial-creation action to the show Actions menu for authorized organizers.
- Derive first/another/next-trial wording from current trials, scoped to the selected show day.
- Keep labels live so adding or removing trials before opening the wizard cannot leave stale numbering.
- Add focused tests for zero, one, and multiple trials across same and different days.

This does not duplicate a page or workflow. It reuses the existing trial wizard and show action system; a link alone cannot correct misleading state-dependent wording inside that workflow.

## Non-goals

- A second trial-creation dialog or page.
- Changes to trial persistence, numbering rules, or show-day operations.

## Impact

- Existing show Actions menu and trial configuration wizard.
- Existing UI tests for show actions and trial setup.
