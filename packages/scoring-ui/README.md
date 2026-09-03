# @myk9/scoring-ui

Internal live scoresheets, timing hooks, and entry-list interaction utilities for myK9Show and `/at-show`.

## Live scoresheets

The package provides live sheets for AKC Scent Work, Nationals, and Fast CAT; UKC Nosework, Rally, and Obedience; and ASCA Scent Detection. The registry dispatches with `getScoresheetComponent(sportType, 'live')`. See [the registry](src/utils/getScoresheetComponent.ts) and [public props](src/types/scoreData.ts).

Unused entry-mode sheets and registry slots were removed. Both mounted app scoring pages use live mode. The live registry tests still cover supported sports, registration replacement, unknown sports, and reset behavior.

## Shared hooks

`useStopwatch`, `useElementTimer`, and `useScoresheetScoring` support live scoring. Entry-list filtering, drag-and-drop, haptics, debounce, touch detection, and long-press helpers remain exported; see [the package barrel](src/index.ts).

`useElementTimer` is required by the live UKC Nosework sheet. The unmounted animation-settings, swipe-gesture, notification-permission, and dialog-state hook clusters were removed, not replaced with new UI.

## Verification

Run from this package directory:

```sh
pnpm build
pnpm typecheck
pnpm test --run
```
