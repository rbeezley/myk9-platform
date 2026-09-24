# Archive summary: myk9-689-current-entry-judge-time

**Outcome:** implemented and merged in two PRs; archived 2026-09-23 with specs promoted.

- Linear: MYK9-689 (gating and wording), MYK9-706 (formula follow-up).
- PR 1: https://github.com/rbeezley/myk9-platform/pull/2376, squash-merged to `main` as `b9c7a1c02` at 2026-09-21 12:59 UTC. It gated the estimate on current, nonzero entry counts and relabelled it "based on current entries", but kept `classes x judgingTimeEstimate`, so the number never moved with the counts.
- PR 2: https://github.com/rbeezley/myk9-platform/pull/2395, squash-merged to `main` as `579252447` at 2026-09-24 00:38 UTC. The owner confirmed that `judgingTimeEstimate` is minutes per dog run, so the estimate became expected entries x minutes per run, in one shared helper. The same PR removed the estimates from the Add Classes panel and the show wizard (their classes cannot have entries), deleted the unused `AddClassesToTrialDialog`, and updated this change's spec before archive.
- Review gate (#2395): `Review gate: codex reviewed 8a3aba52c..177efad7d — no findings`.
- CI (#2395): all required checks green on `177efad7d`. A cancelled non-required "Evaluate review evidence" run was superseded by the comment-triggered run, which succeeded.
- Local (#2395): typecheck, lint, format check, `qa:code-quality-ratchet` and `openspec validate` EXIT=0. The whole app suite ran shuffled and green (22019 tests). The new tests failed on the old code, and a formula that ignores the count turns 3 of them red.
- Specs: `trial-time-estimation` created.
