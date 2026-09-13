# Archive summary: my-shows-dog-first-cards

**Outcome:** implemented and merged; archived 2026-09-13 with specs promoted.

- Linear: MYK9-482 (Done).
- PR: https://github.com/rbeezley/myk9-platform/pull/2198, squash-merged to `main` as `5bd40c2c1` on 2026-09-13.
- Review gate: Codex, 7 rounds over `a752cda22..2d7e24504`; rounds 1–6 each surfaced one real edge case (dog-level status narrowing, per-dog refunds, receipts for unpaid orders, due-dog names from `dueEntryIds`, unresolved-showId grouping, accessible names, distinct shows sharing name and date, no View show link before the show id resolves), every one fixed and pinned by a test; round 7 recorded `Review gate: codex reviewed a752cda22..2d7e24504 — no findings` on the merged head.
- CI: all 23 required checks green on `2d7e24504`, including both E2E lanes.
- Local: typecheck, lint, `format:check:changed`, `qa:code-quality-ratchet` EXIT=0; whole app suite shuffled six times green; browser evidence walk facts posted on MYK9-482.
- Specs: `exhibitor-my-shows-legibility` updated (two requirements added, three removed as the per-order card they described no longer exists); `exhibitor-money-on-exception` and `exhibitor-show-day-check-in` created.
- Superseded: `improve-exhibitor-entries-scan`, archived the same day without spec promotion.
- Open follow-ups (not part of this change): product call on the "View run order" and post-deadline "Message the show team" affordances dropped from the card; extraction of the 1,304-line `MyEntriesPage.test.tsx`.
