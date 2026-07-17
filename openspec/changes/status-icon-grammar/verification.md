# Verification evidence

Verified 2026-07-16 on the seeded Heartland Scent Work Classic show.

## Automated checks

- `pnpm typecheck`: 26/26 tasks passed.
- `pnpm lint`: 14/14 tasks passed.
- Focused myK9Show tests: 12 files, 214 tests passed.
- Focused ringside tests: 3 files, 29 tests passed.
- Shared UI status grammar tests: 1 file, 3 tests passed.
- `pnpm openspec validate status-icon-grammar --strict`: passed.

Independent-review hardening was reverified after the initial sweep:

- Focused myK9Show status, schedule, My Entries, ClassCard, and analytics tests: 5 files, 55 tests passed.
- Shared UI package suite: 18 files, 294 tests passed.
- Scoring UI package suite: 26 files, 278 tests passed.
- `pnpm typecheck`: 26/26 tasks passed.
- `pnpm lint`: 14/14 tasks passed.
- `pnpm openspec validate status-icon-grammar --strict`: passed.

This review pass added cancelled-trial coverage, restored the accepted/payment-due indicator, routed the schedule timeline through the shared shape grammar, tied coverage to canonical entry/class statuses, and removed the shared component's runtime dependency on mocked icon exports.

The second independent-review pass also verified cancelled trials with zero classes, neutral-outline badge contrast, Entry Management's composed status line, and the secretary run-sheet check-in selector. The expanded app regression set passed 83 tests across 10 files; the shared UI suite passed 295 tests across 18 files. Typecheck (26/26), lint (14/14), and strict OpenSpec validation remained clean.

The broad myK9Show suite was also started. It exposed three contextual My Entries label regressions, which were fixed and covered by the focused 67-test card suite, then reached the repository's known 60-second hang threshold and was stopped. CI remains the broad-suite gate.

## Browser sweep

Playwright CLI was run at the 768×1024 tablet viewport in light and dark themes. Entry Management, Class Management, Class Details, and Show Desk all rendered the shared status shapes and semantic colors legibly without clipping the status content.

Evidence is captured in `.playwright-cli/myk9-52-*-tablet.png` and the corresponding `.playwright-cli/page-2026-07-17T02-*.yml` accessibility snapshots in the implementation worktree. The only browser console errors were the known Vite HMR websocket conflict from running this worktree on port 5174 while port 24678 was already occupied; no application runtime errors were observed.
