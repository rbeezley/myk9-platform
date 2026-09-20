## Context

See `proposal.md`. The card and header menu intentionally share `derivePremiumPublish`, but the current input collapses a paused offline query into loading. The header hook also starts the read before manager scope is known.

## Goals / Non-Goals

**Goals:** keep one derivation, expose visible state in both controls, and avoid reads for unauthorized viewers.

**Non-Goals:** publish offline, add a third control, or change premium generation/storage.

## Decisions

1. Extend the derived info-state union with `offline` and compute it from query fetch status/network state in `usePremiumPublishControl`; both card and menu consume the same disabled reason constant.
2. Render the disabled reason adjacent to the card action during loading/offline. The menu continues to use its existing secondary/disabled-reason presentation, with a render test proving the text is reachable without hover.
3. Add an `enabled`/authorization input to `usePublishInfo` or its controlling hook and pass true only after resolved show-management scope. Do not infer authorization from route location.
4. This is an online publishing flow. Offline state remains read-only and no replication behavior changes.

## Risks / Trade-offs

- [Browser online state is stale] → prefer the query's paused/fetch-status signal and treat navigator status only as supporting context.
- [Permission loading briefly looks like publish loading] → keep authorization-unresolved separate from a started publish-state read and avoid rendering manager actions to exhibitors.
- [Card/menu copy drifts again] → export one reason constant and assert both consumers.

## Validation Profile

- Risk: medium
- Validation: app
- Rationale: The change is confined to premium publish query/derivation consumers and does not alter publishing mutations.
