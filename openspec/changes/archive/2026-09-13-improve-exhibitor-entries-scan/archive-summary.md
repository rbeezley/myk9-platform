# Archive summary: improve-exhibitor-entries-scan

**Outcome:** superseded, archived 2026-09-13 without promoting its delta spec.

Superseded by `my-shows-dog-first-cards` (MYK9-482, https://github.com/rbeezley/myk9-platform/pull/2198, squash-merged to `main` as `5bd40c2c1` on 2026-09-13 with the Codex review gate clean and all 23 required checks green). That change deleted the per-order `MyEntryCard` this change had refined and replaced it with one group per show and dog-first cards.

The three tasks left open here (6.4 local visual inspection, 6.5 screenshot comparison, 7.3 merge and archive) were evidence and merge items for the old card, blocked at the time on an unauthenticated local browser. They were not completed for this change; the superseding change carried its own browser evidence walk (facts on MYK9-482) and review gate.

The `exhibitor-entry-scanability` delta spec was deliberately not promoted (`--skip-specs`): its requirements describe the superseded per-order card. The behaviour it aimed at is covered by the promoted `exhibitor-my-shows-legibility`, `exhibitor-money-on-exception` and `exhibitor-show-day-check-in` specs.
