# Show Map Action Contract Plan

## Problem

The secretary Show Map is starting to grow several "what should I do next?" surfaces: attention filtering, inline class buttons, future row actions, a Today priority queue, and a future Next Best Action card. If each surface derives recommendations independently, the secretary can see contradictory guidance during show-day pressure.

## Solution

Create one shared action contract under `apps/myk9show/src/features/show-map/`:

- Document the canonical per-row badge targets alongside the show-map types.
- Add a pure `getRankedActions(scope, state)` function that ranks root-, trial-, class-, and entry-level actions from the current `ShowMapTree`.
- Route the class primary button, row action menu recommendations, Today queue, Next Best Action card, and Attention filter lens through that same function.
- Keep the v1 actions navigational and non-destructive. Destructive or input-heavy actions remain visible as disabled/placeholder menu items until their dialogs exist.

## Testing Phase

- Add focused unit tests for ranking order and contextual class primary action behavior.
- Add component tests proving the row button and recommendation menu consume the shared action output.
- Run the focused Show Map tests before considering the phase complete.
