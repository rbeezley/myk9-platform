# Daily commit review — 2026-10-28

source: claude. One new P3 finding, filed as
[MYK9-1461](https://linear.app/myk9-platform/issue/MYK9-1461). No P0 or P1.
Fresh review complete through `e1b2ddecd6c57d480ab228f9a78130e57ac8b615`.

## Coverage

Window: exclusive `0d9e4bb1629b7c4234716200c1e6485202e9ebfe` through inclusive
`e1b2ddecd6c57d480ab228f9a78130e57ac8b615` — 28 commits,
2026-10-27T12:16:08Z to 2026-10-28T04:10:03Z. Baseline SHA
`e1b2ddecd6c57d480ab228f9a78130e57ac8b615`.

**Prior coverage verified, not assumed.** The `daily-commit-review` row named
`0d9e4bb16`, run by `codex-daily-commit-review` on 2026-10-27. That stamp has a
matching committed report: `docs/qa/codex-daily-commit-review-2026-10-27.md`
(committed in `96e1618eb`), whose stated window is exclusive `4d5a839e6` through
inclusive `0d9e4bb16` and whose table enumerates three commits.
`git rev-list --count 4d5a839e6..0d9e4bb16` returns exactly 3. This window starts
at that commit, so **there is no coverage gap**.

Note on that report's own header: it says the retention/overlap gate (`pnpm
qa:inflight`) exited 2, so it described itself as retained locally rather than
published. It was in fact committed to `main` together with the cursor stamp, as
the 2026-10-26 retention note said it would be from 2026-10-27. The row and the
report agree, so coverage is established either way.

Work was done in a dedicated detached worktree at `/private/tmp/myk9-ncr-20261028`
off `origin/main`, bootstrapped with `scripts/bootstrap-worktree.sh` (exit 0).

## Commits reviewed

| Commit      | Subject                                                        | Depth                                                                                |
| ----------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `96e1618eb` | docs(qa): Codex daily commit review 2026-10-27 and cursor      | Read as the coverage proof above                                                     |
| `c7babc600` | fix(at-show): local admission drops soft-deleted trial/class   | Full — helper, hook, replica sources, RPC parity                                     |
| `3f1827dcf` | fix(admin): person hard delete via admin-delete-user           | Full — **source of the P3 finding**                                                  |
| `b0fcc4008` | test(step-up): keep refused-response clones alive              | Full — global `Response.prototype.clone` patch in `setup.ts`                         |
| `af9e6520b` | docs(rules): de-duplicate shared rules and LESSONS             | Documentation                                                                        |
| `b9a9a1bea` | fix(headline): say why entry is unavailable once               | Diff read                                                                            |
| `631743ee1` | feat(clubs): Members and Payments are tabs on the club page    | Full on routes, role constant, `ClubAdminRedirect`; skim on the extracted components |
| `7d0e8a0b6` | ci(qa): fail when a `scripts/**/*.test.ts` is run by no CI job | Diff read                                                                            |
| `b888afdbd` | docs(cloud): restate the gh 2.48.0 floor                       | Diff read                                                                            |
| `cdd265040` | feat(rbac): warm-paint from a <=24h saved copy                 | Full — warm token, permissions cache, lifecycle, failure reducer, account boundary   |
| `98774bf04` | feat(nav): exhibitors get My Dogs as its own rail item         | Full on `browseTabs.ts` / sidebar config                                             |
| `03f105e75` | docs(workflow): fix Path B and partial-merge wording           | Documentation                                                                        |
| `9356f6d0e` | chore(openspec): archive myk9-812                              | Documentation / spec move                                                            |
| `14e595aa0` | fix(admin): clubs awaiting authorization from a server query   | Full — `getClubsAwaitingAuthorization`, hook key, section                            |
| `8f27e1dc5` | ci(smoke): PR Smoke and A11y smoke on a disposable local stack | Full on the gating script and stale-job-name search                                  |
| `24622d279` | docs(qa): page-performance baseline (provisional)              | Documentation                                                                        |
| `7942e1737` | perf(replication): batch class-enrichment RPCs per sync        | Full — migration grants, batching cap, both resolvers, `judgeNamesByClass`           |
| `3bcc7c77f` | test(perf): fix stale baseline routes and exit status          | Diff read                                                                            |
| `c74f4338f` | fix(replication): compare class release timestamps as instants | Full — `INSTANT_FIELDS_BY_TABLE`, negative controls                                  |
| `452156a16` | docs(qa): full-matrix perf baseline replaces the provisional   | Documentation                                                                        |
| `4c9039403` | fix(db): bound club-awaiting-authorization notices per creator | Full — migration, trigger ordering, `created_by` semantics, client fold              |
| `283798c37` | test(offline): gate the reconnect test on the status line      | Diff read                                                                            |
| `f22a77a9e` | test(e2e): refuse fixture sign-in to production without opt-in | Full — guard logic, every config call site, fixture-password detection               |
| `67337b6a2` | fix(replication): failed hide-count lookup keeps saved counts  | Full — `hideCountsOwed`, `classEnrichmentCache`, the single throw site               |
| `3f204bfad` | Production fixture guard: read `.env.development`              | Full                                                                                 |
| `9cf8b1bce` | fix(ui): narrower Dogs and People list column                  | Full — `nameListSize.ts`, both pages                                                 |
| `b903e8374` | fix(ui): the bulk bar wraps at 375px                           | Full — `FloatingBulkBar` spacer and ResizeObserver                                   |
| `e1b2ddecd` | feat(exhibitor): My Shows is one column                        | Full — `myShowSections`, `useShowAnchor`, past-section auto-open                     |

## Findings

### P0 / Critical

None.

### P1 / High

None.

### P2 / Medium

None.

### P3 / Low

**NCR-2026-10-28-01 — A cancelled step-up on the Data Lifecycle person delete
reads as a transient failure.** Filed as
[MYK9-1461](https://linear.app/myk9-platform/issue/MYK9-1461).

- status: new · first seen 2026-10-28 · last seen 2026-10-28 · consecutive runs 1
- severity: P3 canonical (polish/copy); source label UX-copy
- baseline `e1b2ddecd6c57d480ab228f9a78130e57ac8b615`
- role/workflow: site admin → Admin → Data Lifecycle → People → Permanently delete
- introduced by `3f1827dcf` (#3324, MYK9-1443)

`supabase/functions/_shared/http/handler.ts:109` serialises
`throw new HttpError(403, STEP_UP_REQUIRED_CODE)` as `{ error: 'step_up_required' }`
with no `code` key. `apps/myk9show/src/services/database/users/reads.ts:348`
attaches an edge code only when the body carries `code`, so
`permanentDeleteRefusal.ts:27` returns `null` and
`DeletedEntitiesTab.tsx:145` falls back to
`Couldn't permanently delete person. Please try again.` — a transient-failure
message for a deliberate refusal, which is exactly what the MYK9-527/750 comment
one line above forbids.

Reproduced with a throwaway vitest probe in the review worktree that fed
`permanentDeleteUser` the real 403 body:
`CODE= undefined MSG= "Edge Function returned a non-2xx status code" REFUSAL= null`.

Secondary, same finding:
`__tests__/personHardDeleteStepUp.test.ts:40` builds the refusal as
`{ error: 'Recent password confirmation required', code: 'step_up_required' }`
and asserts on `code`. `handler.ts` never emits that shape, so the test
certifies behaviour that does not exist
(`docs/lessons/README.md#source-text-tests`).

Impact is low and admin-only: the step-up prompt itself works, because
`createStepUpFetch` matches on `error === 'step_up_required'` and replays with
the new token, so a confirmed password completes the delete. Only the
cancelled/failed path is mislabelled, and a retry re-opens the prompt. Full
record, root cause, recommended approach, acceptance criteria and required
closure proof are in MYK9-1461.

## Counts

| Category                                         | Count         |
| ------------------------------------------------ | ------------- |
| New                                              | 1             |
| Unchanged (carried from a prior run)             | 0             |
| Resolved                                         | 0             |
| Duplicate                                        | 0             |
| Rejected                                         | 0             |
| Blocked                                          | 0             |
| Fixes found in subsequent commits in this window | 0             |
| Existing QA / Linear references reused           | 0             |
| Linear issues filed                              | 1 (MYK9-1461) |

## Candidates examined and not filed

- **Warm RBAC paint (`cdd265040`).** The 24h warm token is bound to the exact
  `cachedAt` of the copy it vouches for, cleared on every sign-out path and on
  the account boundary, and never paints a copy with no active roles. A failed
  copy write clears the token. RLS still enforces every read and write, and the
  owner approved the 24h maximum on 2026-10-23. No finding.
- **Batched enrichment RPCs (`7942e1737`).** `get_shows_judges` and
  `get_shows_class_hide_counts` are `SECURITY INVOKER` wrappers that call the
  existing `SECURITY DEFINER` per-show functions once per show, so no predicate
  is restated or widened. `REVOKE ALL ... FROM PUBLIC` precedes the grants, the
  list is capped at 200 server-side, and the client's
  `CLASS_ENRICHMENT_SHOW_BATCH` is exactly 200. No finding.
- **Club notice fold (`4c9039403`).** `clubs.created_by` is the **auth uid**
  (`20261001174300`, `DEFAULT auth.uid()`, forced by
  `guard_club_created_by_write`), so the `?creator=<auth uid>` deep link and the
  `created_by` server filter agree — this is not the
  `people.id` ≠ `auth.uid()` trap. The `CREATE OR REPLACE` was taken from
  `20261022013700`, confirmed by `grep -l` to be the only other definition. The
  "already authorized" read cannot be gamed: `guard_club_authorization_write`
  is `BEFORE INSERT` and silently nulls `authorized_at`, and the notice trigger
  is `AFTER INSERT`. No finding.
- **Bulk-bar `ResizeObserver` (`b903e8374`).** A spacer→scrollbar→wrap
  oscillation is theoretically reachable at a content height sitting exactly on
  the scrollbar threshold. Not reproducible without a browser harness and not
  demonstrated; not filed rather than filed speculatively.
- **Global `Response.prototype.clone` patch (`b0fcc4008`).** Suite-wide, never
  restored, retains clones for the length of each test. It could in principle
  mask a genuine Node-only "body already read" bug, but production runs in a
  browser where clone-and-drop is safe, and the release happens in the global
  `afterEach`. Accepted as documented.
- **`CI` smoke restructure (`8f27e1dc5`).** Searched for stale `Smoke build`
  references: only the gating script's own comment, historical run fixtures, and
  a test that asserts the job is gone. No repo-side required-checks list to go
  stale, and every later PR in this window merged. No finding.

## Checks run

All in `/private/tmp/myk9-ncr-20261028`, vitest shuffled with seed `20261028`
unless noted.

| Check                                                                                                                                                                                                                     | Result                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `bash scripts/bootstrap-worktree.sh`                                                                                                                                                                                      | exit 0                                |
| RBAC warm token, permissions cache, AuthContext warm cache, sign-out purge, person hard-delete step-up, at-show local admission (2 files), class enrichment cache                                                         | 8 files / 106 tests, exit 0           |
| `ReplicatedClassesTable.hideCountRetry.test.ts`                                                                                                                                                                           | 1 file / 20 tests, exit 0             |
| My Shows sections + page, list toolkit, Dogs/People splits, browse tabs (2), clubs-awaiting-authorization (3), account notifications, production fixture guard, isolated smoke target, club admin tabs, ClubAdminRedirect | 15 files / 220 tests, exit 0          |
| `@myk9/replication` `detectDirtyRowConflict.test.ts`                                                                                                                                                                      | 1 file / 26 tests, exit 0             |
| Per-show enrichment fetches, class judge resolution, resolve hide counts                                                                                                                                                  | 3 files / 21 tests, exit 0            |
| `ReplicatedClassesTable.enrichCache.test.ts`                                                                                                                                                                              | 1 file / 4 tests, exit 0              |
| Throwaway probe: real 403 `{ error: 'step_up_required' }` through `permanentDeleteUser`                                                                                                                                   | reproduced the P3; removed            |
| **Total focused proof**                                                                                                                                                                                                   | **29 files / 397 tests, all passing** |

Each named file's presence was verified on disk before the run and the file
count in each result was compared against the paths passed, after two paths
initially named a directory that does not exist
(`services/replication/__tests__/ReplicatedClassesTable.*`) and silently
contributed no file (`docs/lessons/README.md#confirm-the-named-test-ran`).

## Verification limits

- **No full suite, broad typecheck, lint or ratchet.** Focused runs only; a
  regression outside the files named above would not have been caught here.
- **No browser walk and no live SQL.** The three migration-touching commits
  (`7942e1737`, `4c9039403`) were reviewed as text against the migration history
  and the applied-grant conventions, not executed. The behavioural SQL tests
  registered by `4c9039403`
  (`20261027235700_..._rate_limit_test.sql`, 277 lines) run **only in CI** — no
  container runtime on this Mac — so registering them is not the same as having
  run them.
- **The throwaway probe file could not be deleted.** `rm` and `git clean` are
  both denied in this harness, so
  `apps/myk9show/src/services/database/__ncrprobe.test.ts` remains untracked in
  the disposable worktree `/private/tmp/myk9-ncr-20261028`. It is outside the
  primary checkout and never staged; the worktree needs
  `git worktree remove --force` to clean up.
- **No e2e, load, payment, deployment or fixture operation** was run.
- Severity is canonical per
  `docs/goals/fall-2026-launch-readiness-scorecard.md`; the source label is kept
  separately in the finding record.
