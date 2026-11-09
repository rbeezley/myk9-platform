# Workflow speed-up: fewer cycles, earlier finds, lighter instructions

> **Status:** Active

Tracking: MYK9-1787, MYK9-1788, MYK9-1789, MYK9-1790

## Goal

Ship the same product work with fewer PR, CI, review and deploy cycles, and catch
show-day bugs before merge instead of after. The pipeline itself is already fast; this plan
does not try to make a single PR faster.

## Baseline (2026-11-03 to 2026-11-09)

Measured from `gh pr list`, `gh run list`, `git log` and Linear. Phase 5 re-measures the
same numbers.

| Measure                              | Baseline                                 |
| ------------------------------------ | ---------------------------------------- |
| PRs merged                           | 150 (about 25 a day)                     |
| Open to merge                        | median 0.61 h, p90 2.0 h                 |
| Commit mix on `main`                 | 76 fix, 31 feat, 19 test, 16 docs, 10 ci |
| Fix to feature ratio                 | 2.5 to 1                                 |
| Tooling-only or `qa`-scoped commits  | about 15 to 20%                          |
| CI run, successful                   | median 13.6 min                          |
| CI runs cancelled by a newer push    | 9 of 33 sampled                          |
| Production deploys per day           | 4, 14, 9, 3 (Nov 6 to 9)                 |
| Source files touched 5 or more times | 8                                        |
| Always-loaded instructions           | about 70 KB (`CLAUDE.md` 50, memory 20)  |

Review gate, 80 most recent PRs:

| Final tier  | PRs | Mean rounds | Median open to merge |
| ----------- | --- | ----------- | -------------------- |
| Codex       | 42  | 1.69        | 0.71 h               |
| Adversarial | 34  | 1.24        | 0.44 h               |
| Owner       | 3   | 3.33        | 3.16 h               |

46 of 77 Codex rounds returned findings, so the cross-harness review stays as it is.

## Diagnosis

1. **Rework chains.** Ring time and scoresheet took four issues and four PRs (MYK9-1761,
   1762, 1778, 1779). The check-in desk took eight. The owner's phone testing on Nov 7 and 8
   produced about 25 ringside issues, all found after merge and deploy.
2. **Cycle count.** One issue, one PR, one deploy means the 13.6-minute CI run, the gate
   round and the deploy are paid about 25 times a day.
3. **Ceremony overlap.** `/simplify` and `/harden` run six agents before a review gate that
   then runs Codex over the same diff.
4. **Instruction weight.** Every session loads 58 lessons, most of which apply to one kind
   of work.

## Global constraints

- No change to which paths require the `independent` tier, to the head-SHA gate, or to
  standing approvals and the tripwire.
- No new product surface. Every phase is tooling, rules or documentation.
- Phases 2 to 4 edit the shared rulebook or skills, so each ships as a PR, never direct to
  `main`.
- Each phase is independently shippable and independently revertible.

## Phases

### Phase 1: phone-width walk before merge (MYK9-1787)

Ringside and check-in desk PRs run a scripted walk of the touched flow at 375 px against the
branch build before the gate is posted. A declared path list decides which PRs trigger it.
This is the largest lever on the fix ratio.

**Tests:** the walk fails against the commit before MYK9-1762 and passes against the fix.
The path list fails loud when a named path is gone.

### Phase 2: batch by surface, restructure early, deploy on a schedule (MYK9-1788)

- Two or more open issues on one surface go into one branch, one PR, one deploy.
- A second bug fix on the same file or flow within seven days stops patching and asks
  whether the design is wrong.
- Deploy myK9Show runs at set points in the day and on demand before owner testing.
- New issues get a priority at creation.

**Tests:** `pnpm qa:shared-rules:write` leaves no drift; `instructionFileBudget.test.ts`
passes; one dry run of `orchestrate` over the current backlog groups by surface.

### Phase 3: skip `/harden` under the Codex tier (MYK9-1789)

`ship-it` skips `/harden` when `pnpm qa:review-tier` reports an `independent` floor.
`docs/PLAYBOOK.md` § 2 is shortened to match what `ship-pr` does for small changes.

**Tests:** a fixture diff at each floor shows `/harden` skipped only at `independent`.
Revert if mean Codex rounds rise above 2.0 over the following two weeks.

### Phase 4: halve always-loaded instructions (MYK9-1790)

Classify each lesson as universal, domain-specific or already enforced. Domain lessons move
into the skill that does that work; enforced ones retire. Lower the budget ceiling to the
new size.

**Tests:** `lessonGuards.test.ts` and `instructionFileBudget.test.ts` pass at the lowered
ceiling; the PR lists every moved lesson against the skill that now carries it.

**Done 2026-11-09 (MYK9-1790).** `CLAUDE.md` 50,900 to about 24,200 bytes (52%), `AGENTS.md`
34,043 to about 20,400 (40%). LESSONS 52 bullets to 14: 23 moved to five skills, 15 retired on
existing guards. Full rule text moved to `docs/agents/rules-reference.md`. The mapping is in
`docs/lessons/README.md` § Budget.

### Phase 5: testing and re-measurement

Two weeks after Phases 1 and 2 land, re-run the baseline queries over a seven-day window and
record the numbers here.

| Measure                              | Target                |
| ------------------------------------ | --------------------- |
| Fix to feature ratio                 | under 1.5 to 1        |
| PRs merged per day                   | 10 to 15, same output |
| Production deploys per day           | 3 or fewer            |
| Source files touched 5 or more times | 3 or fewer            |
| Mean Codex rounds                    | no higher than 1.69   |
| `CLAUDE.md` size                     | 30 KB or less         |

A phase is complete only when its own tests pass. The plan is complete when Phase 5 is
recorded, whether or not every target is met; a missed target gets a one-line reason.

## Deferred

- **Deploy Staging skipped runs** (43 in 21 hours). The workflow is dormant until MYK9-44
  and the rulebook says not to touch it before then. Fold the fix into MYK9-44.
- **Linear surface labels.** Label definitions need owner confirmation. Issue titles already
  name the surface, which is enough for Phase 2 grouping.
- **Token cost per PR and pre-PR session time** were not measured. Phases 3 and 4 are argued
  from structure; Phase 5 does not claim a time saving for them.
