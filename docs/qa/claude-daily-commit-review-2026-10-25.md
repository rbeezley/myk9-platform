# Daily commit review — 2026-10-25

source: claude. **11 of 11 uncovered commits reviewed; the window is complete.** One new P3 and one
unchanged-but-worsening P2. No P0 or P1 was introduced or newly confirmed. `main` CI is **green at
the reviewed tip**, which clears the consequence yesterday's run reported.

Findings filed: [MYK9-1422](https://linear.app/myk9-platform/issue/MYK9-1422) (parent) with
[MYK9-1423](https://linear.app/myk9-platform/issue/MYK9-1423) (the P3), and
[MYK9-1402](https://linear.app/myk9-platform/issue/MYK9-1402) updated. Every Linear write succeeded.

The one substantive result of this run is a **local reproduction of MYK9-1402** — yesterday's report
recorded an unsuccessful attempt. It fails 5 of 9 shuffled single-file runs here, and the root cause
is a module-scope pointer the test file reassigns on every mock render. That moves the issue from
"CI flake, unreproduced" to "reproducible, with a named mechanism."

## Coverage

- **Committed cursor read:** `daily-commit-review` = `afc542b6ddbbbac88ae1ed69af15af3a519b6564`,
  window end 2026-10-25T00:13:46Z, run by `claude-daily-commit-review` on 2026-10-24. Its report,
  `docs/qa/claude-daily-commit-review-2026-10-24.md`, is present and tracked. Its stated interval
  `(378292962, afc542b6d]` was verified: `git rev-list --count 378292962..afc542b6d` returns exactly
  the 24 commits its inventory enumerates, and `a3a371c51..378292962` returns the 3 it honoured from
  Codex. Coverage accepted, not re-reviewed.
- **Codex ran this stream earlier today and its output is not in the repository.** A worktree at
  `/private/tmp/myk9-ncr-20261025` holds an untracked
  `docs/qa/codex-daily-commit-review-2026-10-25.md` and an uncommitted edit to
  `docs/qa/audit-boundary.md` stamping `c5ad65a106a50ecb348b49435197575c8822d531`. The report was
  read in full. Its claimed fresh interval is `(afc542b6d, c5ad65a10]`: `git rev-list --count`
  returns exactly the 2 commits it enumerates (`359306bfa`, `c5ad65a10`), and `git show --stat`
  confirms both are documentation-only. **That coverage is honoured here, not re-reviewed**, and the
  evidence gap is named rather than absorbed: the committed cursor still said `afc542b6d`, so a run
  reading only the repository would have re-reviewed those two commits. This is the same retention
  gap [MYK9-1343](https://linear.app/myk9-platform/issue/MYK9-1343) owns, recurring for a third day.
- **Window reviewed fresh: `(c5ad65a10, b7dc2d608]` — 11 commits, 111 changed paths,
  +4912/−265.** Baseline / verification SHA `b7dc2d608acc1883aeaa5d9df00be4b035d2ed48`
  (2026-10-25T20:59:39Z). Window end 2026-10-25T20:59:39Z.
- **No contiguous coverage gap.** `afc542b6d` → `c5ad65a10` (Codex, uncommitted) → `b7dc2d608`
  (this run) is unbroken. The historical missing interval remains MYK9-1343's; this run does not
  erase it.
- Reviewed in a dedicated worktree `/private/tmp/myk9-ncr-20261025-claude` on
  `audit/claude-commit-review-20261025` off a clean `origin/main`, bootstrapped with
  `scripts/bootstrap-worktree.sh` (exit 0). No application code was changed.

### Commits reviewed

| SHA         | Kind              | Subject                                                            |
| ----------- | ----------------- | ------------------------------------------------------------------ |
| `bd25b8859` | generated types   | regenerate types for deployed account RPCs (#3258)                 |
| `a18b3239f` | docs              | reject NCR-2026-10-24-03 from the 10-24 commit review (MYK9-1404)  |
| `85b83ef18` | app source + test | mail-in Add Dog starts on the show's registry (MYK9-832) (#3263)   |
| `6fe10d76b` | app source + test | typing a new trial time replaces the old one (MYK9-832) (#3266)    |
| `73b0588b7` | tooling + test    | portable cloud setup, preflight, PR handoffs (MYK9-1397) (#3261)   |
| `18b05e30c` | docs              | lessons: a script's set line is not the whole option set (#3265)   |
| `6f665c83a` | docs              | Stage 1 proof runbook and Codex environment flow (MYK9-1397)       |
| `38598b7af` | app source + test | show-day replica reads go through the indexes (MYK9-1368) (#3264)  |
| `7941e4bac` | app source + test | a past show links its released results (MYK9-1288) (#3267)         |
| `b7c22fa93` | docs              | record Claude Code cloud Stage 1 proof results (MYK9-1397) (#3270) |
| `b7dc2d608` | tooling + test    | watch-pr-checks reads checks through REST (MYK9-1414) (#3272)      |

## P2

### MYK9-1402 — unchanged, **worsening**: the premium error-toast test now reproduces locally

- **Status:** unchanged. Second consecutive run. First seen 2026-10-24; last seen 2026-10-25.
- **Severity:** P2 (canonical: important friction / incomplete verification). Source label: Medium.
- **Baseline SHA:** `b7dc2d608acc1883aeaa5d9df00be4b035d2ed48`.
- **Affected role / workflow:** none at runtime. Developer and release workflow: an intermittently
  red `main` blocks the **Deploy myK9Show** workflow, which only builds a `main` commit with a green
  CI run.
- **Confidence:** high (was medium).
- **Linear:** [MYK9-1402](https://linear.app/myk9-platform/issue/MYK9-1402). Not a duplicate; it
  already has its own issue, so the P2/P3 parent-issue grouping does not apply to it.

**What changed since yesterday.** Yesterday's report recorded CI run 40145876074 / job
121026975696 at `afc542b6d` failing
`apps/myk9show/src/features/premium/__tests__/GeneratePremiumPanel.errorHandling.test.tsx` with zero
calls instead of one, and an **unsuccessful local reproduction**. It reproduces here.

**Reproduction.** The file is unchanged in this window
(`git log afc542b6d..b7dc2d608 -- '**/GeneratePremiumPanel*'` is empty). Nine single-file shuffled
runs at `b7dc2d608`:

```
cd apps/myk9show && pnpm vitest run \
  src/features/premium/__tests__/GeneratePremiumPanel.errorHandling.test.tsx --sequence.shuffle
```

**4 passed, 5 failed.** A failing run (seed `1792988414712`):

```
FAIL  GeneratePremiumPanel — PDF error toast deduplication >
      fires twice for two distinct error messages (null → err1 → err2)
AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
```

That is the same assertion CI reported, and it fails in a **single-file** run, so this is not
cross-file leakage: it is order dependence inside the file, or a race with a previous test's timer.

**Expected vs actual.** Expected: after `errorController.step!(1)` walks the mocked
`PDFDownloadLink` from `null` to `err1`, the error toast fires once. Actual: on roughly half of
shuffled orders it never fires, because the `setIdx` the test calls does not belong to the mounted
tree it is observing.

**Likely root cause.** `errorController` at
`apps/myk9show/src/features/premium/__tests__/GeneratePremiumPanel.errorHandling.test.tsx:11-14` is
module-scope mutable state, and line 24 (`errorController.step = setIdx;`) reassigns the single
`step` pointer on **every** `PDFDownloadLink` render by **any** instance. The first two tests let
their harness tick on timers that are not cancelled on unmount — they even wait on them explicitly
(`await new Promise(r => setTimeout(r, 60))` at lines 172 and 184). When one of those late ticks
re-renders a previous test's (now unmounted) `PDFDownloadLink` after the third test has already
captured `step` as truthy at line 194, `step(1)` drives a dead tree, the setState is a no-op, and no
error ever reaches the toast. Shuffle decides whether the third test runs after a still-ticking
harness, which matches the ~56% rate. This is the `--sequence.shuffle` + module-scope-mutable-state
pairing CLAUDE.md's commit gate calls out.

**Recommended approach.** Stop sharing one `step` pointer: have `renderHarness()` return the setter
for the instance it mounted (or key `errorController.step` by an instance id and assert identity),
and make the harness's tick timer cancel on unmount so a finished test cannot re-render. Do not
widen the `waitFor` timeout — the call count is zero, not late.

**Acceptance criteria.** The file passes 20 consecutive `--sequence.shuffle` runs, and the fix is
shown non-vacuous by reverting the harness change and watching the third test go red.

**Proof required for closure.** The 20-run shuffled log plus the mutation (break-it-and-watch-it-go-
red) evidence, and a green full-app shuffled run. A single green CI run does not close it — this run
observed 4 passes among 5 failures.

## P3

### NCR-2026-10-25-01 — a finished show's public page invites late entries, now with the secretary's live mailbox behind it

- **Status:** new.
- **Severity:** P3 (canonical: polish / copy). Source label: Low.
- **First seen / last seen:** 2026-10-25. Consecutive-run count: 1.
- **Baseline SHA:** `b7dc2d608acc1883aeaa5d9df00be4b035d2ed48`.
- **Affected role / workflow:** public / anonymous visitor (and any signed-in visitor) on the public
  show page of a show that has already happened.
- **Confidence:** high — read from the rendered gating, not inferred.
- **Introduced by:** `7941e4bac` (#3267), as a side effect of correctly satisfying the
  "link the secretary's email" half of MYK9-1288. Related: MYK9-1288, walk finding 11 of
  `docs/qa/usability-walk-new-user-2026-10-20.md`.
- **Not a duplicate.** The 2026-10-20 walk asked for the secretary's email to be linked and for a
  results section on past shows; `7941e4bac` delivered both. Nobody has yet asked whether a show
  that is over should offer late-entry help at all. Searched `docs/qa/findings.md`, every
  `docs/qa/*commit-review*.md`, and the walk ledger.

**Problem statement.** `7941e4bac` adds `showHasHappened` to `LandingData`
(`apps/myk9show/src/features/_shared/landing/landingData.ts:111,360`) and uses it to make rosters
read as final. It is **not** applied to the closed-entries copy. That copy now renders the new
`LateEntryContact` component, whose text is "Entries are closed for this show. Contact
_&lt;Secretary Name&gt;_ for late-entry help." with the name wrapped in a live `mailto:` link
(`apps/myk9show/src/features/_shared/landing/LateEntryContact.tsx:13-32`).

The gate at every site is `entryClosed`, which is `entryCountdown.closed` — the entry close date has
passed (`apps/myk9show/src/features/headline/landing/HeadlineLandingPage.tsx:430`). Entries always
close before a show runs, so `entryClosed` is necessarily true for every past show, and
`showHasHappened` is never consulted. All twelve render sites are ungated:

```
features/gazette/landing/sections/FinalCtaSection.tsx:114
features/heritage/landing/sections/HeroBlock.tsx:230
features/heritage/landing/sections/FinalCtaBand.tsx:114
features/headline/landing/HeadlineLandingLowerSections.tsx:141,164
features/headline/landing/HeadlineLandingPage.tsx:175
features/magazine/landing/sections/FinalEditorialBand.tsx:132
features/fieldGuide/landing/sections/FinalCtaSection.tsx:121
features/poster/landing/sections/FinalCtaSection.tsx:163
features/banner/landing/sections/FlagMasthead.tsx:98
features/banner/landing/sections/FinalFlagBand.tsx:116
features/monogram/landing/sections/HeroBlock.tsx:285
```

`grep -rn "showHasHappened"` over non-test source returns only the five roster `pastShow={...}`
call sites and the two lines in `landingData.ts` — no late-entry site.

**Expected vs actual.** Expected: a show that has already run points a visitor at its results, which
the same commit now does. Actual: the same page also tells them entries are closed and offers a
one-click email to the secretary asking for a late entry into a finished show.

**User impact.** A secretary on a popular past show page receives mail asking to enter a show that
is over — exactly the operational load the solo-operator constraint says to protect against, and the
one thing the previous generic sentence ("Contact the trial secretary for late-entry help", no
address) did not enable. Severity stays P3 because it is copy on a public page with no data or money
consequence.

**Likely root cause.** `entryClosed` conflates two states the page now distinguishes elsewhere:
"entries have closed, the show is still ahead" and "the show is over". The commit introduced the
discriminator and applied it to one of the two consumers.

**Recommended approach.** Pass `showHasHappened` into `LateEntryContactContext` (or give
`LateEntryContact` the flag) and render a past-tense sentence when the show has run — no late-entry
offer and no mailto, for example naming the secretary as the contact for questions about the show,
or nothing at all where the Results block already answers the visitor's question. One change in the
shared component covers all twelve sites.

**Acceptance criteria.** On a show whose `endDate` is in the past, no landing style renders
"late-entry" copy or a `mailto:` for it; on a show whose entries are closed but whose `endDate` is
in the future, the current sentence and `mailto:` are unchanged.

**Proof required for closure.** A test in
`apps/myk9show/src/features/_shared/landing/__tests__/` rendering `LateEntryContact` (or a style's
section) under both a past and a future `endDate` and asserting the copy and the absence/presence of
the `mailto:` anchor, shown non-vacuous by mutation; plus the existing
`LateEntryContact.test.tsx`, `rosterPastShow.test.tsx` and the per-style `*EnterCtaGating.test.tsx`
files green.

## Reviewed and found sound

Recorded so a later run does not re-derive these.

- **`38598b7af` (show-day indexed reads).** The coverage question is whether an entry the old
  whole-table filter returned can now be missed. `resolveTrial` resolves an entry's trial from
  `entry.trialId ?? class.trialId`
  (`apps/myk9show/src/hooks/queries/showDayDataReplication.ts:95-105`), so a context whose trial
  date is today implies the entry is reachable through today's trial index or today's classes' class
  index — both of which `readTodaysOwnEntries` reads and merges. The throw-on-failed-read property
  survives: `getTrialsByDate` is built on `getAllOrThrow`
  (`apps/myk9show/src/services/replication/ReplicatedTrialsTable.ts:341-344`) and
  `getClassesByTrial` on `getByTrialOrThrow`. `fetchReplicatedRingProgress` loses the
  `classId !== null` guard, which an index read on a named class id cannot violate. The camelCase
  index key path (`data.classId` / `data.trialId`,
  `packages/replication/src/core/DatabaseManager.ts:123-126`) is load-bearing but **pre-existing** —
  MYK9-1366 already routes ringside scoresheet reads through it — and the server mapper always
  writes the camel field (`ReplicatedEntriesTable.mapper.ts:390,461`).
- **`85b83ef18` (registry defaults, judge numbers).** The rule is matched against real columns, not
  invented fixtures: `resolveConfiguredRegistryId` is an exact match against
  `listRegistries()`, `SHOW_ORGANIZATIONS` stores the bare id (`data/organizations.ts:17-20`), and
  the live database holds `shows.organization ∈ {AKC (15), UKC (11), ASCA (1)}` and
  `judge_qualifications.organization ∈ {AKC (3), UKC (1)}`, every row with a judge number. So the
  fix is live, not inert. `ResolvedJudge.judgeNumber` narrowing to the show registry's number is
  display-only — `resolveSelectedJudges` feeds `JudgesPicker` and nothing else
  (`grep -rn ResolvedJudge`), so no persisted value changes.
- **`7941e4bac` (results block).** `resultsReleasedAt` and `className` are added to **both**
  projections that feed it — the store path (`ShowDetailsPage.tsx:286,300`,
  `store/trial-store-helpers.ts:74`) and the public PostgREST path
  (`ShowDetailsPage.publicClasses.ts:64,79`) — so the last-hop-drop trap is covered.
  `buildShowResults` returns `null` on an empty class list, so a cold read reads as "unknown" rather
  than claiming results are withheld. The link target
  `/shows/:showId/trials/:trialId/classes/:classId/results` exists and is listed in
  `routes/anonymousAccessBoundary.ts:5`, so an anonymous visitor can follow it.
  `get_show_officials` is genuinely anon-safe: `anon=X/postgres` on the live function, and its body
  excludes soft-deleted and non-public-status shows for non-managers and nulls a steward's email
  (secretary and chairman addresses are "unchanged, deliberately public").
- **`b7dc2d608` (watch-pr-checks REST).** The fail-safe direction is correct. `set -uo pipefail` is
  on (`scripts/qa/watch-pr-checks.sh:74`), so a failing `gh api` propagates through the
  `| jq -sc .` pipeline, `fetch_rollup` returns 1, `HEAD` stays empty and the script takes the
  "could not read" branch instead of verdicting. Even if a payload were lost, an empty rollup
  verdicts as `waiting:` (self-test fixture 6, line 249), never `green`, so no false green is
  reachable. Reading the rollup by SHA and the head after it preserves the #2053 mid-push guarantee.
- **`73b0588b7` (cloud tooling).** The one guardrail path it touches,
  `apps/myk9show/src/utils/findArtifactSecrets.ts`, is **hardened**, not weakened: zip entry names
  are now scanned like their bytes, and every returned `location` is run through `scrubSecrets`, so
  no caller can print a secret that appears in a path.
- **`18b05e30c` (LESSONS).** Editing `CLAUDE.md`'s LESSONS directly without touching
  `docs/agents/shared-rules.md` or `AGENTS.md` is correct — LESSONS sits outside the shared-rules
  markers by design — and `pnpm qa:shared-rules` plus `instructionFileBudget.test.ts` passed in the
  commit's own green CI run.
- **`bd25b8859` (generated types).** Additive only: two RPC signatures
  (`get_account_today_entries_at`, `my_entry_payment_link_session_ids`), no removals or shape
  changes.

## Reconciliation

- **MYK9-1404 — rejected, already recorded.** `a18b3239f`, inside this window, amends yesterday's
  report to reject NCR-2026-10-24-03; Codex independently reached the same verdict today and
  prepended its own correction. Not counted as a new finding, and not re-litigated: the premise
  (a GitHub Actions `run:` step is `bash -e {0}`, so `set -uo pipefail` cannot clear inherited
  `errexit`) is now a LESSON in this same window (`18b05e30c`).
- **MYK9-1402's reported consequence has cleared, the defect has not.** Yesterday's report flagged a
  red `main` tip blocking **Deploy myK9Show**. `gh run list --branch main --workflow ci.yml` is
  `success` on all eleven window commits, including `b7dc2d608` (run 40233348041). The deploy path
  is unblocked; the flake is not fixed, and is recorded above as worsening.
- **MYK9-1403, MYK9-639, MYK9-834, MYK9-1378, MYK9-1379, MYK9-1380** — Codex's run today covers
  these against their canonical issues. None of their paths appear in this window's diff, so they
  are neither re-reviewed nor re-counted here.
- **MYK9-1343 recurs for a third day** (2026-10-23, 10-24, 10-25): a Codex commit-review report that
  exists only as an untracked file in a temporary worktree. Named in Coverage above; no duplicate
  filing.

## Counts

| Category                             | Count |
| ------------------------------------ | ----- |
| New                                  | 1     |
| Unchanged                            | 1     |
| Resolved (confirmed with proof)      | 0     |
| Duplicate                            | 0     |
| Rejected                             | 0     |
| Blocked                              | 0     |
| Fixes found in subsequent commits    | 0     |
| Existing QA / Linear references used | 7     |
| Linear issues created                | 2     |
| Linear issues updated                | 1     |

No P0 or P1 was introduced or newly confirmed, so no issue was filed under the P0/P1 direct-filing
rule. Every Linear write succeeded.

- **[MYK9-1422](https://linear.app/myk9-platform/issue/MYK9-1422)** —
  `Commit review 2026-10-25 — P2/P3 findings`, the parent.
- **[MYK9-1423](https://linear.app/myk9-platform/issue/MYK9-1423)** — NCR-2026-10-25-01, its sole
  child.
- **[MYK9-1402](https://linear.app/myk9-platform/issue/MYK9-1402)** — kept its own issue, being
  recurring and worsening. Its title asserted "`main` is red at `afc542b6d`" and "does not
  reproduce locally", both false at this baseline, so it was rewritten; priority was set to Medium
  to match canonical P2 (it read High, which the 2026-10-25 Codex reconciliation had reported as
  already normalized); and the reproduction, the narrowed root cause and the tightened 20-shuffled-
  run closure contract were added as a comment.

**Deviation from the task prompt, recorded deliberately.** The prompt asks for `p2`/`p3`,
`source:claude` and `audit:commit-review` labels. None exists in this workspace, and the
harness-provenance labels (`Claude`, `Codex`, `lane:mac`, `lane:pc`) were **retired on 2026-10-25 at
17:42 UTC** — hours before this run — with descriptions stating that provenance belongs in issue
evidence rather than in labels. Creating them would have reversed a deliberate cleanup, so severity
and source are recorded in the issue bodies instead, as MYK9-1402 already does, and only the
existing `Improvement` label was applied. The prompt's label list is stale and
`docs/operations/scheduled-audits-claude.md` should drop it.

## Checks run

All from the review worktree at `b7dc2d608`.

| Check                                                                  | Result                        |
| ---------------------------------------------------------------------- | ----------------------------- |
| `bash scripts/qa/watch-pr-checks.sh --self-test`                       | exit 0, 22 fixtures           |
| `pnpm vitest run` — 4 landing + 2 show-day replication files           | 6 files, 44 tests passed      |
| `pnpm vitest run` — 4 registry/wizard + TimeOfDayInput + landing frame | 6 files, 37 tests passed      |
| `pnpm qa:cloud:test` (shuffled, the new required CI step)              | 7 files, 130 tests passed     |
| `pnpm vitest run scripts/qa/watch-pr-checks.test.ts`                   | 26 tests passed               |
| `GeneratePremiumPanel.errorHandling.test.tsx` x9, `--sequence.shuffle` | **4 passed, 5 failed**        |
| `gh run list --branch main --workflow ci.yml`                          | success on all 11 window SHAs |
| Live DB: `shows.organization`, `judge_qualifications.organization`     | bare registry codes only      |
| Live DB: `get_show_officials` ACL and function body                    | `anon=X`, gating correct      |

`scripts/bootstrap-worktree.sh` exited 0 (the npm registry was reachable, unlike Codex's run), so
every suite above ran against freshly built package `dist`.

## Verification limits

A skipped check is a coverage gap, not a pass.

- **No full app suite, typecheck or lint run here.** Only the files this window touched were run.
  The tip's own CI run (40233348041) is green, which covers them at `b7dc2d608`.
- **No browser walk and no E2E.** NCR-2026-10-25-01 is read from the rendered gating and the
  component source, not from a live past-show page. The copy claim is strong (the gate is a boolean
  the component never receives); the visual placement in each of the twelve sites is not
  individually confirmed.
- **Behavioral SQL tests under `supabase/tests/` run only in CI**, so the `get_show_officials`
  reasoning above rests on the live function definition and ACL, read directly, not on a replayed
  test.
- **MYK9-1288 is complete — the scope gap this report first suspected does not exist.** Written
  before the issue was read, this section asked whether closing MYK9-1288 on `7941e4bac` left walk
  finding 11's other remediations unmet, having found no app-level scroll-to-top. `get_issue` then
  gave the five real acceptance criteria, and all five hold at this baseline: show pages open at the
  top (`components/shows/ShowDetails/ShowPublicLanding.frame.tsx:8-12` — the first search looked
  only in `App.tsx` and the layout and landing directories, and missed it), every template exposes a
  way back via `AllShowsBar` (`ShowPublicLanding.tsx:207`), the past-show results criterion is what
  `7941e4bac` delivered, `HeadlineLandingPage.tsx:229` makes the "The bench is set." headline
  conditional on `judges.length > 0`, and `ShowPublicLanding.tsx:85` sets the tab title through
  `useDocumentTitle`. **Nothing is filed against MYK9-1288 and its Done state is correct.** The
  lesson for the next run: a narrow `grep` over the directories where a behaviour _ought_ to live
  cannot establish that it is absent.
- **MYK9-1402's root cause is a located mechanism, not a proven one.** The pointer-reassignment
  path is read from the source and matches the failure signature and rate; it was not confirmed by
  instrumenting which instance `step` points at in a failing run.
