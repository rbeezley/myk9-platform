# Linear backlog in batches — 2026-09-24 (overnight)

> **Status:** Active

Supersedes what is left of [`plan-backlog-batches-2026-09-23.md`](archive/plan-backlog-batches-2026-09-23.md). Source: every MyK9-platform issue in **Todo** or **Backlog** on 2026-09-24. There are 38 agent-work issues, grouped by the files they touch into **12 PRs** plus one review sweep. Each PR closes its issues with one `Fixes MYK9-<n>` line per issue.

## Ground rules

- One batch = one branch = one PR. Oct 10 and money/RLS batches go first and stay small.
- Run 3–4 implementer agents at once, each on its own file set. Each agent opens its PR, runs `pnpm qa:codex-review`, and stops. The orchestrator posts the review gate, watches CI and merges.
- **Stop rule:** a second finding on the same path means restructure, not another patch. A batch that hits it is parked on its branch and written up in the morning report. The other batches keep going.
- **Deploys:** merging does not deploy. Migrations and edge functions are applied only as Richard authorizes for tonight (see Decisions). The frontend waits for tomorrow's Deploy myK9Show run, because the Vercel daily quota is exhausted.
- **Morning report:** `.logs/morning-report.md` in the orchestrator's worktree lists every PR, verdict, merge, deploy step and parked item.

## Not agent work (excluded)

| Kind            | Issues                                                     | Why                                               |
| --------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| Human tester    | 6, 13, 30, 96, 183, 184, 185, 186, 187, 188, 190, 557, 662 | Needs a person, device or account; Richard's list |
| Load test       | 109, 126, 463                                              | Skipped by Richard                                |
| Wait for launch | 11, 27, 31, 44                                             | Sequenced with launch                             |
| Parked          | 32, 72, 94, 227                                            | Parked                                            |
| Post-launch     | 28                                                         | Kill-switch removal is after launch by definition |
| Owned elsewhere | 730, 738                                                   | In Progress in another session; don't touch       |
| Parent only     | 638                                                        | Closes when 640, 641 and 643 close                |

## Wave 1 — Oct 10 and correctness (start now)

| #   | Batch                     | Issues        | Notes                                                                                                                                               |
| --- | ------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Entries and move-ups      | 640, 652, 677 | Move-up undo keeps check-in (Oct 10); Edit Entry guard on Pulled; Closeout counts early mail-ins correctly. Money-adjacent: `independent` floor.    |
| 2   | Registration capacity     | 705, 656      | Class/judge-day fullness counted under RLS; a recovered cart re-checked against closure and capacity. Likely one definer count RPC, so a migration. |
| 3   | Offline scoring duplicate | 740           | Offline judge score upload ran 3× after reconnect. Show-day critical, so it goes alone.                                                             |
| 4   | Waitlist                  | 717, 718      | Waitlist Report reads `waitlist_entries` (branch `claude/batch-11b-waitlist-report` exists; MYK9-721 has landed); Financial Report and tab counts.  |

## Wave 2 — secretary surfaces and data layer

| #   | Batch                 | Issues        | Notes                                                                                                                                             |
| --- | --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5   | Message composer      | 641, 722      | The composer inherits the opened show, with scoping per role (branch `claude/batch-9-secretary-gaps` exists).                                     |
| 6   | Show-scoped data      | 709, 714, 654 | No previous-data placeholder across shows; the browse timezone; retire the three schema-compat ladders (migration 20260918041700 confirmed live). |
| 7   | Phone and zoom layout | 643, 622, 625 | Wizard/Entry Management at 150% zoom, the registration wizard header on a phone, and `/cart` overflow at 390px.                                   |
| 8   | Show creation window  | 716           | Richard's decision needed (below). If he says "require before publish": the publish gate plus the wizard.                                         |

## Wave 3 — server-side, tooling, tests

| #   | Batch                        | Issues                  | Notes                                                                                                                                                                                               |
| --- | ---------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9   | Push and access server fixes | 737, 726, 727, 713      | The scoring push respects the results-release gate; the support-message embed; the `submit_role_request` lock; trial labels in confirmation emails. Edge functions and a migration: needs a deploy. |
| 10  | Tooling and CI               | 520, 599, 725, 729, 741 | Browser CI on Dependabot PRs; worktree liveness recipe; drift check for out-of-tree imports; published-show vocabulary guard.                                                                       |
| 11  | Walks and e2e                | 731, 732, 733, 734, 627 | Staging show-day data; a show-day walk; walk prompts in the repo; walk residue cleanup; wizardVisualQA flake. Touches shared staging data: seed change and reseed need Richard's OK.                |
| 12  | Access-request emails        | 681                     | A database job queue plus a sender, starting from `claude/myk9-681-access-emails`. New infrastructure: last, and the first to park if the night runs short.                                         |

## Review sweep (no code PR)

Deferred reviews: 695, 696, 699, 701, 544, 739. One Codex pass per merged area. P0/P1 findings become fix PRs in this plan; P2s are filed. Each issue closes with its verdict.

## Decisions for Richard (before starting)

1. **Merges overnight:** may the orchestrator merge PRs whose review is clean and whose required CI is green?
2. **Migrations and edge functions overnight:** apply and deploy them after merge (psql + repair, `functions deploy`), or hold them for the morning?
3. **MYK9-716:** allow a show with no entry window as a draft and require one before publishing (the recommendation), or require it at creation?
4. **Batch 11 reseed:** OK to reseed staging tonight if MYK9-731 changes the seed?

## Testing phase

Every batch runs the `/commit` ladder: typecheck, lint, format, the ratchet, affected suites shuffled (6× where it adds module state) and the full app suite. SQL arms are red-first on the throwaway Postgres. CI's SQL-test PASS lines are verified before a migration batch merges. After merge, live objects are verified the way the db-push skill describes. A batch isn't complete until its PR is green and merged, or parked with a written reason.
