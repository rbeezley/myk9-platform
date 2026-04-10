# Potential Bugs Found During Test Cleanup

Discovered during the fix-or-delete pass on 441 skipped myK9Show tests (2026-02-18).

## Status: All Resolved (2026-02-18)

| #   | Bug                                                  | Resolution                                  |
| --- | ---------------------------------------------------- | ------------------------------------------- |
| 1   | `isEntryInTrial()` — trial limits never enforced     | Fixed: now checks `trial.classes` array     |
| 2   | `checkClassCapacity()` — ambiguous waitlist response | Fixed: added `isWaitlisted` to result       |
| 3   | `AddDogDialog` — labels missing `htmlFor`            | Fixed: added `htmlFor`/`id` to all controls |
| 4   | `useTransitionPrefetch` — untestable logging         | Closed: `logger.debug()` is correct pattern |
