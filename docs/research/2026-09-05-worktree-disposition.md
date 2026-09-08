# Remaining worktree research

Research date: 2026-09-05 America/Chicago (2026-09-06 UTC).
Baseline: `main` and freshly fetched `origin/main` both at `3eb2c56e5f73dffac06ebfa8fc3ecfad5c7130f6`.
Scope: classify the seven existing linked worktrees; no implementation, deployment, deletion, or issue-state changes.

## Recommendation

Five worktrees are removal candidates because their edits are already committed on main or superseded by the shipped implementation. Preserve the landing prototype and the open in-flight checker PR. All seven currently contain tracked changes or untracked files; the earlier six-dirty count included the now-removed clean database worktree.

| Worktree                                                                                    | Local material                                                     | Finding                                                                                                                                                                                                                                                           | Disposition                                              |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `/private/tmp/myk9-exhibitor-audit-20260903`                                                | Audit Markdown and 34 evidence assets                              | All 35 untracked files are byte-identical to tracked main files, committed in `6c99ec946`. Branch has no commits ahead of main.                                                                                                                                   | Removal candidate; evidence is preserved on main.        |
| `/private/tmp/myk9-research-absent`                                                         | `docs/research/2026-09-03-absent-entry-accounting-mismatch.md`     | The 3,747-byte report is byte-identical to main, committed in `01fff877b`. Branch has no commits ahead of main.                                                                                                                                                   | Removal candidate; report is preserved on main.          |
| `/Users/richardbeezley/AI Projects/myk9-platform/.worktrees/codex-myk9-275`                 | Four modified component/test files and one untracked contrast test | All five working files are identical to main. Shipped through PR #1916. Linear later established that the remaining reported show-desk contrast failure was a measurement bug, fixed in #1921.                                                                    | Removal candidate; do not revive the superseded finding. |
| `/Users/richardbeezley/AI Projects/myk9-platform-myk9-276`                                  | Avatar component and two tests                                     | Both tests match main. The component is an incomplete earlier draft: it changes neutral initials to semantic foreground but retains five hardcoded colored text variants. Main uses semantic foreground for every variant.                                        | Removal candidate; main contains the more complete fix.  |
| `/Users/richardbeezley/AI Projects/myk9-platform/.worktrees/codex-myk9-279-route-reality-2` | Router, redirect tests, route sweep list, workflow source map      | Router and redirect tests match main. Local removal of the two legacy routes from the sweep and the task-surface documentation are already on main. Remaining whole-file differences are later main changes: removal of `/admin/sync` and newer source-map notes. | Removal candidate; no distinct local fix remains.        |
| `/private/tmp/myk9-landing-prototype`                                                       | Six untracked prototype/audit files                                | Unique concept work. Its README explicitly says the decision is pending user review and prohibits direct promotion of the throwaway implementation.                                                                                                               | Keep until reviewed or explicitly archived.              |
| `/Users/richardbeezley/AI Projects/myk9-platform/.claude/worktrees/inflight-check`          | Ten commits ahead of main; two additional modified files           | Open PR #2073 at `d0b29737f`. Uncommitted changes add repository-relative path handling, root-directory overlap detection, and tests.                                                                                                                             | Keep; active unfinished PR work.                         |

## Primary evidence

- [PR #1916: contrast and route fixes](https://github.com/rbeezley/myk9-platform/pull/1916), merged 2026-08-31 as `5b3c67eefd9773bb2e33370a1724c5dbc89e445b`.
- [PR #1921: probe compositing correction](https://github.com/rbeezley/myk9-platform/pull/1921) and [MYK9-275](https://linear.app/myk9-platform/issue/MYK9-275). The issue's final closure says the remaining badge finding was not an app defect.
- [MYK9-276](https://linear.app/myk9-platform/issue/MYK9-276) records the completed measurement rerun after #1916.
- [PR #1932: legacy task and waitlist redirects](https://github.com/rbeezley/myk9-platform/pull/1932), merged 2026-09-01 as `e690b4d894e75a6f8019cd2601a5ae480060bed6`; [MYK9-279](https://linear.app/myk9-platform/issue/MYK9-279) is Done. Its description retains historical reopen text, so closure was checked against the actual code and merged PR.
- [PR #2073: in-flight checker](https://github.com/rbeezley/myk9-platform/pull/2073) is OPEN. The checked-out commit matches its remote head. No merged PR was returned for that branch.
- Main evidence: [exhibitor audit](../ux-audits/exhibitor-elderly-novice-2026-09-03.md) and [absent-entry research](2026-09-03-absent-entry-accounting-mismatch.md).
- The exhibitor audit's eight linked issues are Done: MYK9-366, MYK9-367, MYK9-368, MYK9-369, MYK9-370, MYK9-165, MYK9-88, and MYK9-347. Its preserved bundle totals 2,466,241 bytes.
- Absent-entry research is historical: MYK9-356 is Done, with the fix in [#2016](https://github.com/rbeezley/myk9-platform/pull/2016) and completed parity proof in [#2066](https://github.com/rbeezley/myk9-platform/pull/2066).

## Material to preserve

Landing worktree files:

- `landing-page-ux-audit.md`
- `apps/myk9show/landing-prototype/README.md`
- `apps/myk9show/landing-prototype/index.html`
- `apps/myk9show/landing-prototype/main.ts`
- `apps/myk9show/landing-prototype/style.css`
- `apps/myk9show/landing-prototype/hero-ziva-tera.jpg`

These six files total 850,818 bytes. Also preserve ignored `apps/myk9show/landing-prototype/build/main.js` (9,830 bytes) if archiving the runnable preview.

In-flight checker uncommitted files:

- `scripts/qa/inflight.ts`
- `scripts/qa/inflight.test.ts`

## Verification and limits

- Inspected worktree status, branch history, diffs against each worktree's HEAD and current main, and matching files on main. Compared untracked audit artifacts by content rather than treating untracked status as proof of unique work.
- Queried GitHub for current open/merged PR state and Linear issues by known identifier, which also resolves archived issues.
- A process CWD scan found no processes under any of these seven worktree paths. This is a point-in-time observation, not proof that an owner will not resume work.
- The Codex task inventory showed no active task mapped to these worktrees; it does not inventory other agents' task state.
- No application tests were run: this was source/history research, with no executable changes. Identical files and recorded merge evidence establish duplication; this is not a new correctness review of the shipped code.
- Ignored dependency caches and local environment files are outside the source comparison. Before deletion, recheck status and process ownership, and preserve any intentionally retained local configuration or artifacts.
- No worktree was removed during this research. Removal should be scoped to the five candidates above; preserve the two unique-work worktrees.

## Authorized cleanup follow-up

The user subsequently authorized removal of safe candidates. All five statuses and branch histories were rechecked without new work, and the process CWD scan again found no users. Duplicate untracked artifacts were compared again with main.

Four worktrees had differing local `apps/myk9show/.env.local` files. Before removal, private copies were verified under `/private/tmp/myk9-cleanup-preserved-20260905/<worktree-name>/app.env.local`, alongside binary-capable tracked diffs (`worktree.patch`). The exhibitor worktree's ignored browser logs were also preserved. The backup directory is owner-only; it contains local configuration and must not be committed or published. Other checked environment files and launcher configurations matched the primary checkout.

Cleanup is scoped to the five removal candidates; the landing prototype and `inflight-check` remain preserved. These backups are temporary local files, not a durable archive.
