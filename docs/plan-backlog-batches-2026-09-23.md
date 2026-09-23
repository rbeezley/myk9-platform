# Linear backlog in batches — 2026-09-23

> **Status:** Active

Supersedes the "one PR per issue" rule of [`plan-linear-backlog-burndown-2026-09.md`](plan-linear-backlog-burndown-2026-09.md). The 92 open MyK9-platform issues (excluding MYK9-703) are sorted; the 53 that are agent work are grouped by the files they touch into about 19 PRs. Each PR closes every issue it covers by listing it on its own line as `Fixes MYK9-<n>`. Review tier is per PR (`pnpm qa:review-tier --base origin/main`), so a batch is reviewed once, after it is complete. Merging does not deploy; production moves on a `Deploy myK9Show` run (MYK9-703).

## Ground rules

- One batch = one branch = one PR. Aim for 3–6 issues and a few hundred lines. If a batch grows past about 20 files, split it at a file boundary.
- Oct 10 test show issues go first. Money, RLS and migration batches stay small, because they carry the `independent` floor.
- Stop rule unchanged: a second finding on the same path across review rounds means restructure, not another patch.
- At most 3–4 implementer agents at once, each batch on its own file set.

## Not agent work (20)

| Kind                    | Issues                                                | Handling                                          |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Human tester / operator | 6, 30, 557, 13, 96, 183, 184, 185, 186, 187, 188, 190 | Richard's checklist; agents prepare evidence only |
| Wait for launch         | 11, 27, 31, 44                                        | Untouched until launch sequencing                 |
| Parked                  | 32, 72, 94, 227                                       | Untouched                                         |

## Review debt (one session, no PR): 544, 695, 696, 697, 699, 701

One Codex pass over the six deferred re-reviews, recorded on each issue.

## Already In Progress (finish, don't re-batch): 520, 601, 604, 615, 619, 626, 639, 664, 694, 702

## Batches

Order is top to bottom. **Oct** = carries the `Oct 10 test show` label or blocks it.

| #   | Batch                             | Issues                  | Likely tier | Notes                                                                          |
| --- | --------------------------------- | ----------------------- | ----------- | ------------------------------------------------------------------------------ |
| 1   | Staging data for Oct 10 (**Oct**) | 558, 610, 613           | adversarial | Seed + cleanup; shared-DB writes need Richard's go-ahead                       |
| 2   | Move-up and edit entry (**Oct**)  | 640, 652                | independent | After 639 merges; same entry-edit files                                        |
| 3   | Premium publish state (**Oct**)   | 648                     | adversarial | Pair with 694 if its PR is still open                                          |
| 4   | Show trials / entry window        | 649, 676, 679           | adversarial | All read `show.trials` / entry window through the show store                   |
| 5   | Cart integrity                    | 650, 651, 655, 656      | adversarial | `cartStore` and cart recovery                                                  |
| 6   | My Shows lifecycle                | 623, 624, 657, 658      | adversarial | One lifecycle predicate + vocabulary, chips, focus                             |
| 7   | Phone / zoom layout               | 622, 625, 643           | adversarial | Wizard header, /cart, wizard and Entry Management at 150%                      |
| 8   | Secretary copy and vocabulary     | 644, 661, 671           | adversarial | Copy only; 671's verb sweep sets the words the others use                      |
| 9   | Secretary workflow gaps           | 641, 672, 638           | adversarial | Composer show scope, palette aliases, walk findings (triage 638 first)         |
| 10  | Club access requests              | 681, 685                | adversarial | Builds on #2361; email may touch an edge function (deploy after merge)         |
| 11  | Show creation and support errors  | 684, 686                | adversarial | Two unrelated 500/validation bugs; split if the causes are in different layers |
| 12  | Club-admin and catalog RLS        | 660, 667, 668           | independent | One migration; 667 decided: site-wide catalog, site admin writes only          |
| 13  | Deleted items and restore         | 607, 608                | independent | Audit rows and `restore_dog` snapshot                                          |
| 14  | Show Closeout money card          | 677                     | independent | Money path; kept alone                                                         |
| 15  | Dead code                         | 609, 611, 614, 616, 673 | adversarial | Deletions; 616 needs a `DB_VERSION` bump                                       |
| 16  | Test infrastructure               | 605, 627, 628, 669, 675 | adversarial | Flaky tests, e2e runner args, ringside typecheck coverage                      |
| 17  | Agent tooling                     | 597, 598, 599           | independent | `.claude/skills/**` is a guardrail path                                        |
| 18  | E2E test-id audit                 | 617                     | adversarial | Large, mechanical; alone                                                       |
| 19  | Load harness                      | 109, 126, 463           | adversarial | Harness repair first, then one recorded rehearsal                              |

Deferred until its precondition holds: 654 (production must carry 20260918041700), 28 (post-launch), 662 (junior-handler fee feature; needs Richard's go-ahead).

## Testing

Each batch runs the `/commit` ladder for its tier, plus colocated tests for every file touched. A batch is complete when its PR merges and every listed issue's acceptance criteria are checked on the issue. Issues that need production evidence stay In Progress until a `Deploy myK9Show` run ships the merge.
