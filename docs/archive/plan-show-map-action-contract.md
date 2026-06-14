# Show Map Action Contract Plan

## Problem

The secretary Show Map is starting to grow several "what should I do next?" surfaces: attention filtering, inline class buttons, future row actions, a Today priority queue, and a future Next Best Action card. If each surface derives recommendations independently, the secretary can see contradictory guidance during show-day pressure.

## Solution

Create one shared action contract under `apps/myk9show/src/features/show-map/`:

- Document the canonical per-row badge targets alongside the show-map types.
- Add a pure `getRankedActions(scope, state)` function that ranks root-, trial-, class-, and entry-level actions from the current `ShowMapTree`.
- Route the class primary button, row action menu recommendations, Today queue, Next Best Action card, and Attention filter lens through that same function.
- Treat the Attention lens as "nodes with human-attention actions in their subtree." This keeps submitted entries and check-in conflicts visible while generic pending statuses remain out of Attention unless a contract action explicitly marks them.
- Keep the v1 actions navigational and non-destructive. Destructive or input-heavy actions remain visible as disabled/placeholder menu items until their dialogs exist.

## Testing Phase

- Add focused unit tests for ranking order and contextual class primary action behavior.
- Add focused tests for Attention lens membership, including submitted entries and non-attention pending statuses.
- Add component tests proving the row button, recommendation menu, right-click trigger, disabled placeholders, and Attention lens consume the shared action output.
- Run the focused Show Map tests before considering the phase complete.
