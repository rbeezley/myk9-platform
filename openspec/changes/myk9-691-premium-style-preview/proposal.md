## Why

Tracking: MYK9-691. Organizers cannot confidently choose the premium presentation style from the existing Preview experience even though style editing already exists elsewhere.

Original request: "Select the next 5 issues from the to-do status. Then orchestrate implementing them using Luna as the implementer as a subagent? Do as many in parallel as you can. work them all the way to an open or merged PR. you will need to use the fallback review of adversarial sub agents as we are out of claude tokens until 9/24."

## What Changes

- Reuse the existing premium style catalog, entitlement rules, and show style mutation from Preview.
- Clearly indicate the current and pending style, update Preview before saving, and make Save/Cancel outcomes explicit.
- Preserve Monogram as the default and cover persistence and error behavior.

This must not introduce a duplicate style editor. The implementation should compose or deep-link the existing premium edit capability into Preview, sharing its options and mutation path rather than copying them.

## Non-goals

- New premium styles or entitlement products.
- A new standalone settings page.
- Changes to public landing rendering beyond consuming the saved canonical style.

## Impact

- Existing show Preview and premium edit components.
- Existing show style mutation and entitlement helpers.
- Focused UI and persistence tests.
