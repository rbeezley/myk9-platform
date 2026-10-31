# In Review verification pass 2026-10-31 — evidence for 76 issues, run by Codex

> **Status:** Complete

## Execution record — 2026-10-31

This verification pass is complete with explicit dispositions; it does not claim that operator-held issues are finished. The original working instructions and snapshot below are retained for provenance. Current acceptance evidence and owner decisions live on the issues.

- **Count:** 77 In Review at 14:18:03 UTC; 25 after closing MYK9-1495. The initial cohort alone is 51 Done, four In Progress and 22 held. Six subsequent arrivals add two Done, one In Progress and three held. The resulting 83-issue ledger is **53 Done / five In Progress / 25 In Review**. The changing global board is not a closure counter.
- **This verifier closed 25:** 1557, 1543, 1537, 1526, 1513, 1504, 1564, 1560, 1562, 1554, 1476, 1498, 1533, 1567, 1534, 1536, 1540, 1516, 1544, 1523, 1524, 1501, 1553, 1514 and 1495. Each has recorded evidence and a Done readback.
- **External closures, 28:** 1477, plus the 14 and 13 closures applied by the two owner-decision passes. They are not attributed to this verifier. The external cancellation of 1522 was outside the starting cohort.
- **Returned to implementation:** 1503 (paper-entry axe failures), 1535 (40px health target), 1508 (32px close target versus 48px), 1517 (inactive/deleted principal still authorizes the roster), and 121 (settled phone title/status overlap). No source fix, implementation claim or new issue was created. The scoped security report is [recorded separately](../security-review-2026-10-31-myk9-1517.md).
- **Held In Review:** 1600, 1304, 1589, 126, 1542, 1393, 1305, 125, 1502, 1500, 958, 1233, 110, 1434, 1243, 27, 1078, 879, 1510, 203, 1377, 1380, 1392, 109 and 1467. Initial-cohort holds have the named labels or dependencies. New 1600 and 1589 were skipped for active claims; 1589 is the known unlabeled, actively owned exception, not a claim that the board has no unlabeled issues.
- **Production:** verified run 41213669785 at `1cc9a82cf`; dispatched and verified 41222627601 at `66cc910d3` and 41223991188 at `943c4347c41ef9c7b8c481c5b08bb977f212f3db`. Exact served-SHA, migration-guard and ancestry evidence is on the issues. No hosted migration/function deployment was performed by this pass.
- **Accepted substitutions:** owner approvals `4498ad11` and `c5969710` were applied by the other chat. In particular, all S1 live-data checks were superseded: no evening live sign-ins or Ask Queue questions were performed. The real waiting-worker update proof for 1549 was additionally observed locally.
- **Remaining clock/coordination work:** 1467 has two of three qualifying scheduled green runs; the next nominal slot is November 1 at 06:00 UTC, subject to scheduler delay. Never replace it with a manual dispatch. New 1589/1600 claims were posted at 16:41:00/17:20:50 UTC; fresh-read ownership before a later pass. The 1304/1305 full runner remains stopped pending repair or an explicit change of proof; no repeated hang or invented six-run pass.
- **Cleanup:** every owned browser, daemon/helper, Vite server and the exact disposable native stack was closed/destroyed. Ports 5781, 5782, 41790 and 41791 had no listeners. Regular user Chrome and unrelated worktrees/files were preserved. Evidence is retained before the final worktree removal.

The [run record](https://linear.app/myk9-platform/issue/MYK9-1495#comment-46dc40f2-54c1-42c3-a366-de56440bf2e8), [decision sheet](https://linear.app/myk9-platform/issue/MYK9-1495#comment-050215c8-9938-444e-909c-07af2e119796) and [operator sheet](https://linear.app/myk9-platform/issue/MYK9-1495#comment-472dbb0c-bfb3-402f-a364-347cbff31348) are the durable disposition records. Quiet follow-up continues for later eligible work; it does not reopen completed checks or waive retained gates.

## Execution clarifications — 2026-10-31

- **[ADDED] Concurrent board work:** use the issues present at the start of each pass as its fixed cohort. Fresh-read before every mutation; skip a recent claim or a state change by another session after that snapshot. Record new arrivals and external transitions separately from this pass's closures. An issue's original pre-snapshot merge transition is not a reason to skip its verification.
- **[ADDED] Closeout scope:** Phase 6 reconciles the eligible cohort. Recently claimed arrivals are explicit coordination exceptions for a later pass; they do not authorize a label/status write or make the moving board a zero-count target.
- **[ADDED] Browser resource constraint:** use a separate official Chrome for Testing executable, one headless profile at a time where focus is not under test, under the foreground ownership wrapper. Close its complete process graph after every batch; do not automate or terminate the user's regular Chrome.
- **[EXPANDED] Evidence overrides the snapshot:** fresh issue criteria and recorded owner decisions govern. MYK9-1495's criterion-1 cause is documented in the 2026-10-29 research comment. MYK9-1516 already permits tests plus a local nationals walk; MYK9-1508's Stats/Settings decisions are recorded. Do not request those decisions again. MYK9-1521, 875 and 957 are Done; re-check their dependents rather than preserving stale holds.
- **[EXPANDED] Desk closure:** MYK9-1567 still needs S4 browser evidence, despite § 1.3 calling it test-only. Do not close it from tests alone. Preserve any browser check explicitly owed in the latest issue comments.
- **[EXPANDED] Hung-run recovery:** MYK9-1305 already records an Oct 30 current-main shuffled replication run stopped after 30 seconds. Do not repeat that same hung runner; record the repair/handoff decision and continue.
- **[ADDED] Continuation:** finish independent work while deployment or scheduled evidence is pending. A fresh run may revisit the remaining cohort without reopening completed work. Owner decisions/operator actions remain explicit holds; neither elapsed time nor the unattended instruction waives them.
- **[ADDED] Review result:** coverage 90/100 → 100/100 for the verification workflow after these clarifications. Acceptance scope, isolated data, failed-run recovery, coordination, deployment, evidence, rollback and closeout are addressed by the bar and Phases 0–6. This score describes plan coverage, not issue acceptance or the availability of owner-only evidence.

Owner request (2026-10-31): give Codex a plan it can work through to close every MyK9-platform issue that is **In Review**. Confirm the work the issue asked for was done; do not re-review the fix, do not nitpick it, do not file new issues from it. Bugs still matter: a criterion that fails on the stated path is a real gap and goes back to the implementer.

Source: the 76 issues In Review on 2026-10-31 (read in full that day: description, relations, latest comments, merge SHA, deploy ancestry). Production was Deploy myK9Show run 41176371837, commit `4fcf3b650`. Seven merges were not yet deployed (§ Phase 0).

Executor: Codex, on this Mac, in its own worktree for any file it writes (`AGENTS.md` § Worktrees). Codex is the owner's closure-evidence gate ([`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) § Lifecycle); Linear writes (comments, labels, status) are pre-authorized by the shared rules.

## The bar — read this before touching an issue

1. **The issue's written acceptance criteria are the whole test.** Verify each one as written. The code, the PR, the review rounds and the design are not under review again.
2. **Three outcomes per issue, nothing else.**
   - **Done**: every criterion evidenced, no open blocked-by relation, no open sub-issue, and a deploy run at or after the merge. Fresh `get_issue` read first (never close from a list result).
   - **In Progress**: a criterion fails on the stated path, or a criterion the issue asks for was never built. Post the one-line gap, set In Progress, leave the `verify:*` labels. That is the implementer's queue; this pass does not fix code. [EXPANDED] Post no claim comment: with none, the issue janitor returns a quiet In Progress issue to Todo, where the Ready-for-an-agent view and the orchestrate skill pick it up.
   - **Waiver recommended** (`needs:decision`): the criterion as written cannot be shown by an agent, or asks for more than the shipped behaviour needs, and the existing evidence makes the behaviour reasonably certain. Post one line: what is owed, what stands in for it, "recommend: accept". Then move on. The owner reads these in one sitting (§ Phase 6).
3. **No new issues from this pass.** Something seen on the way that is outside the criteria gets one line in the evidence comment ("seen, out of scope: …") and nothing else. The only exception is a P0/P1 that breaks a show-day path, which goes to Linear with `Bug` and a repro, once, and is named in the final report.
4. **One sign-in per role per session.** Every fixture sign-in to the live project costs a full replication sync (about 2,800 REST calls) and slows the site for anyone on it (`apps/myk9show/src/test/productionFixtureGuard.ts`). Browser work runs on the isolated native stack by default (§ Phase 2), and the one live-database session (S1) runs in a quiet window with three sign-ins total.
5. **Evidence is what you ran, not what you read.** A comment that says "tests cover it" without naming a file is not evidence until the file is named and the run is green here. A deploy is proven by ancestry (`git merge-base --is-ancestor <merge> <deployed>`) plus, for a browser criterion, the walk on a build that contains the merge.
6. **Labels move only with evidence.** Remove exactly the `verify:*` label the recorded result satisfies. Never add a `needs:*` label without the comment naming the question, its owner and the unblock condition. Blocked-by relations count as owed with no label.
7. **Stop rules.** A verification runner that hangs past 30 s is recorded (`needs:decision`, the repair question) and not re-run. A sign-in that fails is password drift first, not the diff ([`docs/operations/e2e-fixture-accounts.md`](../operations/e2e-fixture-accounts.md)). An In Review issue with no label, no blocker and no sub-issue is a defect: evidence it or label it on sight.
8. **[ADDED] Coordination.** Wave 4 of [`plan-backlog-batches-2026-10-30.md`](../plan-backlog-batches-2026-10-30.md) and the daily issue janitor are active on this board. Before touching an issue, read its latest comment: a claim comment under 6 hours old, or a state another session set since 2026-10-31, means skip it and list it in the report. Never revert a state another session set (Codex and orchestrate runs both move issues on purpose).
9. **[ADDED] Credentials.** Fixture passwords are the `E2E_*` values in `apps/myk9show/.env.local` of the main checkout; the database password is `SUPABASE_DB_PASSWORD` in `supabase/.env` there. Read them into the process environment, never into a log, a comment, a commit or a chat message. The Bash permission layer refuses a command that embeds one, by design.

### Evidence comment, one per issue

```
Verification 2026-11-<dd> (Codex, <session id or run name>)
Build: <commit>, deploy run <id> | Target: isolated stack <stack id> | live DB via dev server | production probe | psql rolled back
Role / device: <role> at <viewport>, <engine>
1. <criterion> — PASS | FAIL | NOT RUN: <one line of what was done and what was seen>
2. …
Labels: removed <verify:x>; kept <…> because <…>
Disposition: Done | In Progress (gap: …) | needs:decision (recommend: …)
```

Attach a screenshot only where the criterion is visual (layout, size, contrast). Redact nothing from fixture data; never paste a password or a key.

## Evidence classes

| Class | Means                                                                                                                | Where                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A     | The merged PR's tests cover the criterion. Name the files from `gh pr view <n> --json files`, run them green at HEAD | Worktree, `cd apps/myk9show && pnpm vitest run <files>`                |
| B     | A browser walk shows it                                                                                              | Isolated stack (default) or the one live-DB session S1                 |
| C     | A rolled-back psql transaction through the RPC, view or grant proves it                                              | Session pooler, `SET LOCAL ROLE authenticated`, claims set, `ROLLBACK` |
| D     | Production probe with no sign-in: anonymous route, or a string unique to the change found in the served chunk graph  | myk9show.com                                                           |
| E     | Count green scheduled runs                                                                                           | `gh run list --workflow <file> --event schedule`                       |
| F     | A person: load rehearsal, physical print, real user, money, recovery, owner operation                                | § Phase 6 operator sheet                                               |
| G     | Owner premise or waiver decision                                                                                     | § Phase 6 decision sheet                                               |

Rolled-back psql pattern (memory `reference_db_push_and_verify`): `source supabase/.env`, `PGPASSWORD="$SUPABASE_DB_PASSWORD" psql -h aws-1-us-east-2.pooler.supabase.com -p 5432 -U postgres.sojmvhhwsjxmfistvzbe -d postgres`, then `BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims TO '{"sub":"<uid>","role":"authenticated"}'; <call>; ROLLBACK;`. The MCP `execute_sql` connection cannot `SET ROLE`; it is read-only and fine for read-backs.

Production chunk probe (memory `feedback_deploy_traps`): fetch `https://myk9show.com/index.html`, follow every `/assets/scripts/*.js` reference recursively, skip any response whose content-type is not JavaScript, and grep for a string that exists only in the change (confirm it is absent from `origin/main~1` of the merge first).

---

## Order of work — start the clocks first, then the cheapest closures

The pass is about 13 agent-hours plus two calendar days of scheduled runs. Spend the hours so nothing waits on a clock that could already be running.

1. **First ten minutes, before any reading**: run the tripwire and dispatch Deploy myK9Show (0.3); dispatch the Playwright Regression run (0.3b); start the isolated stack and its seeding (0.4) and the built preview (0.5). Each of these is minutes of wall time that overlaps the desk pass. Record the three run or stack ids at the top of the log.
2. **Desk pass next** (Phase 1), in the background where the harness allows: the per-issue test batches are bounded, parallel work with explicit pass conditions, so split them across cheaper sub-tasks (issue-tracker § Model routing: Luna for test runs and run counts, Sol for the disposition call). Close the six test-only issues as soon as the deploy comment from 0.3 lands.
3. **Browser sessions in dependency order**: S2 first (it closes 1543, which unblocks 1501 in the same session, and 1537, which unblocks 1526), then S4 and S3 (no dependencies, short), then S5 (1539 unblocks 1489; S5 also finishes the offline halves of 1506, 1501, 1524 and 1549), and S1 last, in the evening quiet window. Sign in once per role per session and do every issue for that role before signing in as the next.
4. **Phase 3 and the sheets** fill the gaps while a session's fixture prep runs or a build finishes. Write a sheet row the moment an issue routes to F or G; posting is one step at the end.
5. **Today closes**: everything in classes A, B, C and D, plus the two sheets. **Revisit-only** (five minutes a day, no stack): 1477 and 1467 scheduled counts, the 1498 run result, then Phase 6 once the last count lands. Do not hold the stack or the worktree open for them; tear down (6.4) at the end of day one and run Phase 6 from the main checkout.
6. **Never idle on a clock**: if a run, a build or a seed is taking longer than expected, move to the next item on this list and come back.

## Phase 0 — Set up once (about 1 hour)

- [ ] **0.1 Read**: [`docs/agents/issue-tracker.md`](../agents/issue-tracker.md) (labels, dispositions, lifecycle), [`docs/agents/standing-approvals.md`](../agents/standing-approvals.md) (fresh, every time), the `deploy` skill's post-deploy pass, [`docs/operations/isolated-e2e-regression.md`](../operations/isolated-e2e-regression.md), [`docs/operations/e2e-fixture-accounts.md`](../operations/e2e-fixture-accounts.md).
- [ ] **0.2 Count**: `list_issues(team MyK9-platform, state In Review, limit 250)`; record the count and the ids. This is the "before" number for MYK9-1495 criterion 3. Anything In Review that is not in this plan's table was moved after 2026-10-31: read it and route it with the same classes. [EXPANDED] The reverse too: a table row whose issue is no longer In Review is skipped with one line in the report. Known addition already: MYK9-1540 (Nationals Leaderboard ringside route, #3457) merged on 2026-10-31 after the snapshot; verify it in S2 with the same classes, since its closing clears the blockers on 1508 and 1516. Codex reads Linear through its connector, so where the `list_issues` call above has no state filter, open the saved view [Verification needed](https://linear.app/myk9-platform/view/316a2fa9-78c5-4cb5-9ba5-71332adb4bf7) instead; it is all In Review issues, labeled or not. If a Linear write fails (comment, label or state), append the full comment text and the intended change to `.logs/linear-pending.md` and re-post at the end of the day; an issue is never Done until its evidence comment has landed.
- [ ] **0.3 Deploy what is merged**: seven issues' merges are on `main` but not in production (1564 #3463, 1506 #3453, 1560 #3466, 1567 #3460, 1562 #3458, 1504 #3456, 1554 #3468). Run `source supabase/.env && PGPASSWORD="$SUPABASE_DB_PASSWORD" pnpm qa:prelaunch-tripwire`; on exit 0, `gh workflow run deploy-myk9show.yml`, `gh run watch <id> --exit-status` in the background, then read the summary for the deployed commit and post the deploy comment on each of the seven issues (standing approvals, "Run Deploy myK9Show"). On exit 1 or 2: do not deploy; park the seven as `needs:operator` with the tripwire output, and verify them on the isolated stack at their merge commits anyway (the deploy comment comes later). [EXPANDED] If the run fails in "Deploy the prebuilt output" with `api-deployments-free-per-day`, that is the Vercel daily quota, not the code: note the time, re-run after the rolling 24-hour window, and carry on with the isolated-stack evidence meanwhile. The workflow deploys the newest `main` commit with green CI, which may be older than HEAD; read the `Deploying <sha>` line in the run log and use that SHA for every ancestry check, not HEAD.
- [ ] **0.3b Dispatch the regression run** (for MYK9-1498): `gh workflow run nightly-e2e.yml` (the **Playwright Regression** workflow). It runs on a disposable stack and touches no shared data, so it needs no approval and no waiting for Monday. Record the run id; Phase 4 reads the result.
- [ ] **0.4 Worktree and stack**: `git worktree add ../wt-verify-2026-10-31 -b codex/verify-in-review-2026-10-31`, `bash scripts/bootstrap-worktree.sh`, then start the isolated native stack per [`docs/operations/isolated-e2e-regression.md`](../operations/isolated-e2e-regression.md) (`SUPABASE_EXPERIMENTAL_STACK=1 supabase start --runtime native …`, seed the platform grants, test users, accounts and `seed-demo.sql` with the local keys in the process environment). Record the stack id. Start `pnpm run dev --port <p>` with the local `VITE_*` values and warm `/src/main.tsx`. [EXPANDED] If the stack will not start or seed, follow the reset in that document once; if it still fails, record the error in the report and run S2 to S5 the way S1 runs (dev server against the live project, quiet window, one sign-in per role, no writes beyond the ones S1 names). The evidence stays valid; only the Target line of each comment changes, and the S5 offline checks then need the built preview pointed at the live project with the same cap.
- [ ] **0.5 Built preview for offline work**: `cd apps/myk9show && pnpm build:fast && pnpm exec vite preview --port <q>` against the same local stack (service worker only exists in a build). Sessions S5 use this.
- [ ] **0.6 Browser session names**: every `playwright-cli` call carries `-s=verify-<session>` (S1 to S5); close each session before the next; `playwright-cli list` before and after. Never `close-all`.
- [ ] **0.7 Log files**: `.logs/verify-<issue>.log` in the worktree; `cmd > .logs/x.log 2>&1; echo "EXIT=$?"`.

## Phase 1 — Desk pass: tests, deploy ancestry, relations (about 3 hours, no browser)

For every issue in the table below, in id order:

- [ ] **1.1 Fresh read** (`get_issue` with relations, then `list_comments`). Confirm the merge SHA named in the table is on `origin/main` and is an ancestor of the current deployed commit (after 0.3). Fix any stale relation on sight (MYK9-121 still shows MYK9-1493 as blocking although it is Done).
- [ ] **1.2 Class A criteria**: name the test files from the PR, run them, paste file names and the pass line into the evidence comment. Where a comment claims tests but no file exists for a criterion, that criterion is unevidenced: it becomes In Progress if user-visible, otherwise a waiver line.
- [ ] **1.3 Close what A alone closes** (no browser criterion left, no blocker, deployed): 1560, 1562, 1554, 1557, 1564, 1567. Each needs its deploy comment from 0.3 first.
- [ ] **1.4 Record classes E and D** now, even if the count is not yet reached (the comment says "1 of 3 scheduled runs green, next due …"), so the owner sees the clock.
- [ ] **1.5 Write the two sheets** (§ Phase 6) as you go: one row per F or G issue with the one-line ask. They are posted at the end, not issue by issue.

## Phase 2 — Browser sessions on the isolated stack (about 6 hours)

Each session is one sign-in per role. Record the stack id, build commit and engine once at the top of each issue's comment. [ADDED] A fixture a walk needs that cannot be created on the isolated stack (a nationals show, a passcode session, a show-day support ticket) makes that criterion NOT RUN with the reason, and the issue gets a decision-sheet row recommending the substitute evidence. Never improvise the fixture on the live project. Viewports: 390×844 (phone), 768×1024 (tablet), 1440×900 (desktop) unless the issue names others.

### S1 — Live database via the dev server, quiet window (secretary, site admin, judge; 3 sign-ins)

Only these four need live data (a fixture the isolated seed lacks). Dev server: `pnpm dev:show` from the main checkout, which reads `apps/myk9show/.env` and points at the live project. Run it late evening US Central, finish within the hour. [EXPANDED] The only writes are the Ask Queue questions the demo exhibitor asks for 1559 and 1541; they leave thread rows for that fixture account and need no cleanup. The Change class dialog for 1265 is cancelled, not saved. Nothing else is submitted. The psql read-backs in Phase 3 are rolled back.

- [ ] **MYK9-1527** (secretary): `/shows/<seeded demo show>` classes list loads with ring phases; one class opens. Criterion "classes list loading for a signed-in role" PASS → remove nothing (no label), Done after the psql read-back already on the issue is cited.
- [ ] **MYK9-1549** (secretary): `/shows`, click **All upcoming** then **OCT**; count visible cards equals the count in the DOM (no `opacity-0` survivors). Account menu shows **Refresh app**. Criterion 4 (apply a waiting service worker) belongs to S5. Remove `verify:browser` after S5.
- [ ] **MYK9-1265** (secretary): Overview, focused class **Buried Novice A**, **Change class**: the dropdown lists eligible classes across trials with full ones disabled. Cancel the dialog. Criterion "root cause stated" was recorded as not reproducible → waiver line (G). Remove `verify:browser`; keep `needs:operator` until the owner accepts the waiver, since the issue asks for the owner's own-device check.
- [ ] **MYK9-1559 + MYK9-1541** (exhibitor, demo account): Ask Queue. One long question (spends one allowance); the view follows the streaming text and stays at the bottom on completion. Close the panel, reopen: the thread is there. Ask one short second question: it appends. **Clear history** empties it; **New question** starts fresh. Sign out, sign in as the same user: history kept. The other-user isolation and the 14-day/20-entry cap are class A (tests in #3446 and #3461). Done both.

### S2 — Ringside (judge, steward, secretary on the isolated stack)

Fixture prep (secretary, once): a combined A/B class pair; set section A to **Briefing** at 9:00 and section B to **Break until** 9:30; one UKC and one ASCA trial each with a class and one entry assigned to the judge fixture; a class with zero entries assigned to the judge.

- [ ] **MYK9-1506** (judge, then steward, then secretary; phone and tablet landscape; once offline): class list against the v3 screenshot on the issue: progress bar, upload indicator and offline badge on a queued-score class and neither when in sync, heart persists across reload, ⓘ opens the shared class details, ⋯ opens Class Options with role gating, four tabs with counts, Pending default, search, three sorts, Refresh shows a result, 48 px targets, axe clean. Criteria 1 to 9 and 11 are also class A; name the test files. Done when the three-role walk is recorded. Open follow-up MYK9-1569 is not a blocker.
- [ ] **MYK9-1537 + MYK9-1526** (judge): the A/B pair above. Card and entry-list header show the same phase and time for the divergent sections; the popover agrees. Both issues' last criterion is this walk. Remove `verify:browser` on both; Done both (1526 is blocked by 1537, so close 1537 first).
- [ ] **MYK9-1513** (judge and secretary, two browser contexts): judge sets **Briefing** with a time, then **Start Time**: the card shows Expected; the secretary's context shows it after sync. Judge sets **Offline Scoring**: badge and banner, visible to the secretary after sync. Remove `verify:browser`. `verify:database` comes off in Phase 3.
- [ ] **MYK9-1544** (judge with the zero-entry class, steward, and a passcode session): `/shows/<id>?tab=results` shows released classes only. Anonymous visitor on production (class D) gets the public landing. Criterion 4 is class A (`resolveShowAudience` tests). Done. Related MYK9-1562 is already handled in Phase 1.
- [ ] **MYK9-1503 + MYK9-1504** (judge, then secretary; phone viewport for the keypad): judge types `125`, `4`, `430` and `1:23.45` into the scoresheet manual time and **Set Max Time**; the live preview shows the interpreted time before save. Judge sets Briefing and Break-until times. Secretary edits a class start time (never saves as 1:00 AM), uses paper scoring and edits a results cell. Axe clean on each dialog. Class A for 1504 criteria 1 to 5, plus the grep the issue asks for: `rg -n "parseClockTime|parseDuration|new Date\(.*:" apps/myk9show/src packages --type ts -g '!*.test.*'` and post the inventory of fields on 1504 (the issue asked for it and it is missing). Done both when the walk and the inventory are posted.
- [ ] **MYK9-1543** (judge): on the ASCA trial created in the fixture prep, open a scoresheet, open the DQ guidance, read the text: ASCA wording, no AKC fallback. Do not save a score. Remove `verify:browser`; Done. Run this before 1501, which it blocks.
- [ ] **MYK9-1501** (judge; 375×667 first, then 390×844, 768×1024, phone landscape; after 1543 passes above): on the UKC and the ASCA sheets Save/Cancel stay pinned, a Qualified 0-fault sheet fits 375×667 without scrolling, faults are inline, the header and dog card are compact, the read-back shows per-area times and words not codes. Offline cold reload is S5. Remove `verify:browser` and `needs:environment` (the isolated fixture covers it). Blocked by 1543 until that closes.

### S3 — Home and My Shows (secretary, exhibitor on the isolated stack)

Fixture prep: move one trial's date to today so the secretary fixture (who also owns an entered dog in the seed) has an entry today.

- [ ] **MYK9-1524** (secretary, 1440 and 390): Home shows **Your entries today** with the same status text as My Shows, including the "check-in not offered" state; absent when no entry is today (move the date back and reload). Offline update is S5. Remove nothing (no label); Done after S5.
- [ ] **MYK9-1523** (exhibitor, two **headed** windows, `playwright-cli` headed so real focus and visibility events fire): My Shows open in window 1; check a dog in from window 2; refocus window 1: the row flips without a reload. Record which mechanism did it (the PR refreshes on focus, the issue text says "without a reload" and is satisfied). Remove `verify:browser`; Done. If the row does not change on refocus, In Progress with that line.

### S4 — Admin console (site admin on the isolated stack)

- [ ] **MYK9-1533**: `/admin/users?userId=<people.auth_user_id of the exhibitor fixture>` opens the Manage Roles dialog for that person; `?userId=ghost` shows "user not found" with no request. Done.
- [ ] **MYK9-1567**: `?userId=not-a-uuid` shows "user not found" without a query (network tab); go offline before the lookup resolves: the page shows the needs-a-connection state and a **Retry**; reconnect: it resolves. Criteria are also class A (#3460). Done.
- [ ] **MYK9-1534** (375 and 1440): computed `font-size` of the dashboard **Needs a look** titles and the Support **Show day** pill is at least 14 px. If no ticket in the seed carries show-day state, read the pill's class token in the component and state that the pill did not render. Done (no criteria beyond the fix direction).
- [ ] **MYK9-1535** (375 and 1440): bounding box of the larger clickable ancestor is at least 44 px for the user-name drill-down on `/admin/users`, status and investigation links on `/admin/support`, **Go to page** on `/admin/help`, **Open system health** and **Re-read database** on `/admin/dashboard` and the template actions on `/admin/templates`. Done.
- [ ] **MYK9-1536**: **Today at a glance**: Signups and Live shows navigate to a filtered list; the other two tiles are visibly static (no hover affordance, no link). Done.

### S5 — Offline and reconnect on the built preview (Chromium and WebKit)

Prime each role once online, then use the browser's offline toggle. Cold reload means closing the tab, reopening the URL offline.

- [ ] **MYK9-1539** (secretary, **WebKit** engine, the second-engine check the owner asked for): primed, offline, cold reload `/shows`: cached shows render. Sign out, reload offline: no prior account's shows. `/at-show` offline reload still works. Record engine, build, stack. Remove `verify:offline`; Done. This unblocks 1489.
- [ ] **MYK9-1489** (secretary): same primed state, offline cold reload `/shows` renders full width from the replica with no network read (network tab empty). Remove `verify:offline`; Done.
- [ ] **MYK9-1545** (judge): offline, Ringside menu → Settings shows device prefs; change theme, voice and haptics; cold reload offline: kept; reconnect: synced (read `user_preferences` for the fixture on the local stack). Online-only settings say they need a connection. Done. Open follow-ups 1563, 1564, 1568 are not blockers.
- [ ] **MYK9-1491** (secretary with and without entries, 1440 and 390): offline cold reload: **My Entries** stays in the rail for the secretary who has entries. The "visible right after checkout" line needs a Stripe test card → waiver line. The Home card criterion moved to 1524 → waiver line (descope). Remove `verify:offline` and `verify:browser`; `needs:decision` for the two lines.
- [ ] **MYK9-1509** (judge and steward): offline dog list with search and sort, favorites view, dog page with per-class check-in, result, time, faults, placement and the jump to the entry list. Exhibitor sees the role gate. Record it. Keep `needs:operator` (the owner's production cold-offline walk stays theirs) and put the issue on the decision sheet: recommend accepting the built-preview walk as the production substitute.
- [ ] **MYK9-1506, 1501, 1524, 1549** offline halves: tabs and sorts offline (1506), cold reload mid-sheet then reconnect and drain (1501), the Home card after an offline check-in (1524), **Refresh app** applies a waiting service worker (1549: bump the build, reload, use the menu entry). Close the four as their tables say.
- [ ] **MYK9-1520** (secretary, optional): confirm the 2026-10-30 observation still holds (generic "No internet connection" screen, never "No Entries Yet"). The disposition is G (below), so record and move on.

## Phase 3 — Database (about 1 hour)

- [ ] **MYK9-1513** `verify:database`: rolled-back production psql as the assigned judge fixture uid: `select ringside_update_class(<class>, '<phase json>')` with a valid phase and time → the row reads back with `ring_phase` set; then `ROLLBACK`. Negative controls (unassigned judge → 42501, bad phase → 22023) are already on the issue; cite them. Remove `verify:database`; Done once S2 is recorded.
- [ ] **MYK9-1527**: cite the 2026-10-31 read-backs (columns, grants, 532 = 532) in the evidence comment; no new query needed unless the deploy in 0.3 changed the schema.
- [ ] **MYK9-1460**: read `operator_alerts` for any "Waitlist expiration cron failed" row since 2026-10-28 (MCP `execute_sql`, read-only). None → one line on the issue; the disposition is G.
- [ ] **MYK9-110** item 6: `gh run list --workflow independent-database-exports.yml --event schedule --limit 60 --json createdAt,conclusion` and count the Friday–Sunday hourly runs that are green. Post the count; the rest of the issue is F.

## Phase 4 — Scheduled runs (desk, revisit daily until the count is reached)

- [ ] **MYK9-1477**: Nightly Health scheduled runs on `main` after `579feec` where the **Cross-browser route health** step is green. Need two consecutive (the 2026-10-31 12:27 UTC run is the second). When met: remove `verify:scheduled-runs`, Done, and close MYK9-1522 as won't-fix per [`plan-backlog-batches-2026-10-30.md`](../plan-backlog-batches-2026-10-30.md) § Review sweep.
- [ ] **MYK9-1467**: three consecutive green scheduled `nightly-health.yml` runs including #3377 (2026-10-30 run 41055486056 is the first). A red caused by the Node pin PR (#3430) resets the count and is named as such. Done at three.
- [ ] **MYK9-1498**: the `nightly-e2e.yml` **Playwright Regression** run dispatched in 0.3b (on `main` at or after `a54a7ee`). Read the job list for the four promoted spec names. Done on green; a red is In Progress with the failing spec named.

## Phase 5 — Owner sheets: post once, label each issue (about 1 hour)

Post the two sheets as one comment each on **MYK9-1495** (whose criterion 2 is this very pass) and link that comment from each issue it names. Add the label on each issue in the same step. The owner reads one page, not 40 pings.

### Decision sheet (`needs:decision`)

| Issue     | What is owed as written                                           | What stands in for it                                                                   | Recommend                                              |
| --------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| MYK9-1293 | One real Stripe Connect onboarding round trip landing on Payments | 10-27 production and 10-29 isolated walks; the same round trip is MYK9-1393's           | Accept; one owner Connect session closes 1393 and 1293 |
| MYK9-1508 | Menu reaches Nationals Leaderboard (needs MYK9-1540) and Stats    | Stats removed by design; Settings deferred to 1545; isolated three-role walk recorded   | Accept the menu without Nationals; or wait for 1540    |
| MYK9-1516 | Reachable from the ringside menu (blocked by MYK9-1540)           | Results-tab reachability and tests; owner already accepted tests plus a local walk      | Drop the ringside line or keep the blocker; your call  |
| MYK9-1500 | "Axe clean" on entry list and scoresheet                          | Heading-order and landmark failures are filed as MYK9-1555 and predate this change      | Narrow the criterion to the Up control                 |
| MYK9-1502 | Settings content and Select Areas (MYK9-1515), AA contrast (1556) | Both are open blockers; the shipped dialogs walked clean at three viewports             | Leave blocked, or split the two lines out              |
| MYK9-121  | All surfaces agree for pending entries                            | MYK9-1553 holds the next-action copy disagreement; every other state replayed 10-30     | Accept with 1553 open                                  |
| MYK9-1369 | sessions=50 timing, 55-writer check, WAL measurement              | Moved to MYK9-1496 on 10-29; shipped scope evidenced with production edge logs          | Accept the split; closes MYK9-1468 too                 |
| MYK9-1512 | Secretary walk of Show Stats                                      | Managers are routed to the management Results workspace; isolated visitor walk recorded | Accept the visitor walk                                |
| MYK9-1499 | #3337's required checks green                                     | Green except the Review gate, which cannot post on a draft held for MYK9-1542           | Done on #3430's own scope; 1542 keeps the hold         |
| MYK9-125  | Live-target concurrency run across five roles                     | Isolated 10-session run (5 allowed, 5 denied), live ACL read-back, rolled-back replay   | Accept the isolated run                                |
| MYK9-1520 | "Entries are not on this device" state offline                    | The generic "No internet connection, Retry" screen; never "No Entries Yet"              | Accept the literal criterion                           |
| MYK9-1476 | Revoke visible on the next sync                                   | Blocked by the MYK9-1521 cadence decision                                               | Decide 1521 first                                      |
| MYK9-1244 | Native print dialog cancel records printed state                  | Owner skipped this check on 10-21; headless six-case run and live two-sheet PDF         | Accept                                                 |
| MYK9-1265 | Root cause stated with a red-to-green test                        | Not reproducible from code; migration, SQL test and S1 walk                             | Accept                                                 |
| MYK9-1460 | No cron alert during the next load rehearsal                      | 0 functions read `pg_timezone_names`; no alert since 10-28; rehearsal is unscheduled    | Accept on traffic evidence                             |
| MYK9-1370 | Quiet-window rerun of two routes                                  | 212 of 222 measured; the 10 blocked by a Supabase outage                                | Accept the report as final                             |
| MYK9-1491 | Rail item visible right after checkout; Home card                 | Checkout needs a Stripe test card; Home card moved to MYK9-1524                         | Waive both lines                                       |
| MYK9-1306 | Snapshot built from the replica                                   | Deliberately not done (10-21 decision)                                                  | Record as by design                                    |
| MYK9-1509 | Production cold-offline walk                                      | S5 built-preview offline walk                                                           | Accept as the substitute                               |
| MYK9-1495 | Cause of the six unlabeled In Review issues                       | Read the older comments in Phase 1; if nothing, this is the open line                   | Accept this pass as criteria 2 and 3                   |

### Operator sheet (`needs:operator`, already on most of them)

| Issue                                                                     | The one action                                                                                              |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| MYK9-1393 (+ 1392, 1293)                                                  | One Stripe Connect onboarding replay on a live club: password prompt once, then Stripe opens                |
| MYK9-126, 109, 1301, 1302, 1304, 1305, 1306, 1307, 1360, 1363, 1368, 1380 | One approved G9 rehearsal window (`load-rehearsal.yml`, sessions=50) with the per-child measurements listed |
| MYK9-1377                                                                 | Closes with 1380                                                                                            |
| MYK9-203                                                                  | Push-subscribed staff and non-staff devices on a trial dated tomorrow                                       |
| MYK9-1510                                                                 | Hear the 30-second warning on a phone and a tablet with the saved voice and speed                           |
| MYK9-879 (+ blocker 875)                                                  | Card checkout in Stripe test mode: junior, adult, unknown amounts, then the secretary badge                 |
| MYK9-1078, MYK9-1233                                                      | Print on the real printer and stock; record scale, alignment, clipping                                      |
| MYK9-27                                                                   | Read the three guides; then `supabase functions deploy ask-myk9show` and `deploy-guides.yml`                |
| MYK9-1243                                                                 | Create the CI-only accounts and repoint the GitHub secrets                                                  |
| MYK9-1434                                                                 | Register the scheduled janitor session and review one dry run                                               |
| MYK9-110                                                                  | Fresh-project rebuild, Storage recovery, application failover, partial-recovery runbook                     |
| MYK9-958 (+ blocker 957)                                                  | Observe a real secretary before, during and after a show                                                    |

### Phase 5 closes

- [ ] Both sheets posted on MYK9-1495, every row's issue labeled and linked.
- [ ] MYK9-1305: try the six shuffled runs the issue names (`taskpolicy -b pnpm vitest run <replication suites> --sequence.shuffle`, one at a time); on a hang past 30 s record it and stop. The measurement stays with 126.
- [ ] MYK9-1380: check whether the web-push stall test from the 10-27 residual exists (`rg -n "timeout" supabase/functions/_shared --glob '*push*.test.ts'`); one line either way.

## Phase 6 — Closeout and the testing phase (about 1 hour)

This plan's own acceptance test is the state of the board.

- [ ] **6.1 After count**: `list_issues(state In Review)` again. Post before and after on MYK9-1495 with the deploy run id (criterion 3), and move 1495 per the decision sheet.
- [ ] **6.2 Every issue has a disposition**: run the 76 ids against the board; each is Done, In Progress with a gap line, or carries exactly the `needs:*` / `verify:*` labels its comment names. No In Review issue is unlabeled with no blocker. Paste the three lists (Done, In Progress, held) into the final report.
- [ ] **6.3 No new issues** were created by this pass except any P0/P1 named in the report.
- [ ] **6.4 Stack and sessions torn down**: `supabase stack destroy --stack-id <id> --yes`, `playwright-cli list` empty of `verify-*`, dev servers stopped, worktree removed last.
- [ ] **6.5 Plan status**: flip this file to `Complete`, `git mv` it to `docs/archive/`, drop the index row (docs-only direct to `main`). The decision and operator sheets live on in Linear. [EXPANDED] This is a docs-only commit from the primary checkout; the owner's acceptance of this plan is the commit request it needs. If the owner has not said to run the plan through to its archive, leave the flip and say so in the report.
- [ ] **6.6 Report** to the owner, under 300 words: counts, the Done list, the In Progress gaps (these are the only "bugs" this pass may produce), and a pointer to the two sheets.
- [ ] **6.7 [ADDED] Undo**: a Done set in error is reversed by moving the issue back to In Review with one line saying why, and restoring the label the evidence did not cover. State changes are the only writes this pass makes outside Linear comments, so this is the whole rollback story; the fresh-read rule exists to make it rare.

---

## Routing table — all 76 issues

Class = cheapest sufficient evidence. Session = where the browser work runs. "Closes" = what Done needs beyond the deploy comment. Blockers are open relations as of 2026-10-31.

| Issue | Pri | Merge on main                | Class | Session | Closes when                                                      | Note                                            |
| ----- | --- | ---------------------------- | ----- | ------- | ---------------------------------------------------------------- | ----------------------------------------------- |
| 1564  | —   | #3463 `1602be3` not deployed | A     | —       | Deploy + test files named and green                              | Reconnect sync without opening Account          |
| 1506  | H   | #3453 `47d9204` not deployed | A+B   | S2, S5  | Three-role walk vs v3 screenshot, phone + tablet, offline        | Parent 1505; 1569 is a follow-up, not a blocker |
| 1560  | L   | #3466 `cf920b7` not deployed | A     | —       | Tests for criteria 3 and 4 named                                 | 1577 (design race) is a separate issue          |
| 1567  | —   | #3460 `17248b6` not deployed | A+B   | S4      | Tests named; ghost id and offline-paused walk                    | 1576 follow-up open                             |
| 1562  | L   | #3458 `8985313` not deployed | A     | —       | Tests named                                                      | 1575 (offline admit) separate                   |
| 1504  | L   | #3456 `63856b6` not deployed | A+B   | S2      | Tests, parser grep, field inventory posted, walk                 | The inventory the issue asked for is missing    |
| 1554  | L   | #3468 `f6c2ad0` not deployed | A     | —       | East/west known-answer tests named                               | Follow-up is 1586 (not 1579)                    |
| 1393  | H   | #3323 (deployed 10-27)       | F     | —       | Owner Connect replay; plan-doc decision line checked             | Blocks 1392                                     |
| 1293  | M   | #3161, #3326 deployed        | G     | —       | Owner accepts the walks                                          | Same Stripe round trip as 1393                  |
| 1559  | L   | #3461 `4fcf3b6` deployed     | A+B   | S1      | Tests; long-answer scroll walk                                   | Spends one Ask Queue allowance                  |
| 1557  | L   | #3459 `ada1aa6` deployed     | A     | —       | Tests incl. the mixed dated/undated notice                       | If the mixed case has no test: waiver line      |
| 1477  | L   | #3391–#3409 deployed         | E     | —       | Two consecutive green scheduled route-health runs                | Then close 1522 won't-fix                       |
| 1527  | H   | #3438 `2dfa6d0` deployed     | C+B   | S1      | Classes list walk; cite read-backs                               | Owner dropped criteria 2 and 4                  |
| 1543  | H   | #3436 `80e4fbc` deployed     | B     | S2      | Judge DQ guidance on an isolated-stack ASCA trial                | Blocks 1501; 1574 follow-up open                |
| 1516  | L   | #3423 `e9878ad` deployed     | B+G   | S2      | Manager leaderboard walk on a nationals show; 1540 or waiver     | 1540 merged (#3457); re-check the blocker       |
| 1537  | L   | #3439 `9ee460f` deployed     | B     | S2      | Divergent A/B phase walk                                         | Blocks 1526                                     |
| 1545  | —   | #3450 `3c452f9` deployed     | B     | S5      | Judge offline theme walk with cold reload                        | No labels; 1563/1564/1568 separate              |
| 1533  | H   | #3447 `7129af1` deployed     | B     | S4      | Auth-id deep link opens Manage Roles; ghost → not found          | Parent 1532; prose criteria                     |
| 1544  | —   | #3448 `48407cf` deployed     | A+B+D | S2      | Three ringside audiences see Results; anon gets landing          | No labels                                       |
| 1541  | M   | #3446 `632cf06` deployed     | A+B   | S1      | Persistence tests; reopen/append/clear walk                      | No labels                                       |
| 1524  | M   | #3444 `54baab0` deployed     | B     | S3, S5  | Secretary Home card at 1440/390, absence case, offline           | Undated class deferred to 1557                  |
| 1534  | L   | #3447 deployed               | B     | S4      | Font-size ≥ 14 px at two sites                                   | Parent 1532                                     |
| 1535  | L   | #3447 deployed               | B     | S4      | 44 px on the listed controls at 375/1440                         | Parent 1532                                     |
| 1536  | L   | #3447 deployed               | B     | S4      | Two tiles link filtered, two visibly static                      | Parent 1532                                     |
| 1503  | M   | #3449 `16df106` deployed     | B     | S2      | Judge and secretary time-entry walk, axe                         | Grep for leftover duration parsers              |
| 1509  | M   | #3419, #3434 deployed        | B+F   | S5      | Built-preview offline walk; owner accepts or walks production    | Parent 1505; check-in-all dropped by owner      |
| 1508  | M   | #3427 `caa1a69` deployed     | G     | —       | Owner decision on Nationals/Stats scope                          | 1540 merged (#3457); re-check the blocker       |
| 1539  | M   | #3441 `6b27f92` deployed     | B     | S5      | WebKit offline cold reload of /shows                             | Blocks 1489                                     |
| 1549  | H   | #3441 deployed               | B     | S1, S5  | Month-filter cards visible; Refresh app applies a waiting SW     | Bundle string already found live                |
| 1502  | M   | #3420 `9231131` deployed     | G     | —       | Blockers 1515 and 1556                                           | Walked clean at three viewports                 |
| 1513  | H   | #3417 `90642fd` deployed     | C+B   | S2      | Positive rolled-back write; two-context visibility walk          | Parent 1505                                     |
| 1500  | M   | #3410 `1e863d8` deployed     | G     | —       | Owner narrows the axe criterion                                  | Blocked by 1555                                 |
| 1305  | H   | #3179 `2fbd98f` deployed     | F(+A) | —       | 126 rehearsal; six shuffled runs attempted                       | Known hang class                                |
| 1302  | H   | #3180 `b31c565` deployed     | F     | —       | 126 rehearsal                                                    |                                                 |
| 1301  | H   | #3175 `9ffd751` deployed     | F     | —       | 126 rehearsal                                                    |                                                 |
| 121   | M   | #1594 (pre-history)          | G     | —       | Owner accepts with 1553 open                                     | Fix stale 1493 relation                         |
| 1369  | H   | #3369, #3375 deployed        | G     | —       | Owner accepts the 1496 split                                     | Closes 1468 with it                             |
| 1512  | L   | #3412 `0c0ee97` deployed     | G     | —       | Owner accepts the visitor walk                                   | `needs:environment` stays until then            |
| 1499  | —   | #3430 `d6a7ad7` deployed     | G     | —       | Owner: Done on own scope                                         | Blocked by 1542                                 |
| 1307  | M   | #3174 `7c9c52d` deployed     | F     | —       | 126 rehearsal                                                    | Two measurements disagree; neither is a pass    |
| 1523  | M   | #3418 `2ed7ee8` deployed     | B     | S3      | Headed two-window refocus walk                                   | Refresh-on-focus mechanism                      |
| 125   | H   | #1548, #1602 (pre-history)   | G     | —       | Owner accepts the isolated run                                   | `verify:database` restored 10-30 pending this   |
| 1520  | H   | #3425 `42b488c` deployed     | G     | S5 opt  | Owner accepts the literal criterion                              | Built app only                                  |
| 1501  | M   | #3422 `fc55cb1` deployed     | B     | S2, S5  | Per-sport phone-fit walk after 1543; offline cold reload         | Blocked by 1543                                 |
| 1489  | M   | #3405, #3429 deployed        | B     | S5      | Offline cold reload of /shows after 1539                         | Blocked by 1539                                 |
| 1467  | H   | #3362, #3377 deployed        | E     | —       | Three consecutive green Nightly Health scheduled runs            | #3430 touches the workflow                      |
| 1491  | M   | #3408, #3428 deployed        | B+G   | S5      | Cold-offline rail walk; waive checkout and Home-card lines       |                                                 |
| 1526  | M   | #3421 `e0be5e3` deployed     | B     | S2      | Same walk as 1537                                                | Blocked by 1537                                 |
| 126   | U   | many, deployed               | F     | —       | One approved rehearsal                                           | Six children In Review                          |
| 109   | U   | #2153 deployed               | F     | —       | A rehearsal that passes the README targets                       | "Recorded but failing" does not close it        |
| 203   | M   | #1681–#1720, #2492           | F     | —       | Real push devices on a trial dated tomorrow                      | Indicator paths already walked                  |
| 1495  | —   | #3415 `4371934` deployed     | G     | —       | This pass is criteria 2 and 3; check criterion 1 in old comments | Sheets are posted here                          |
| 1510  | M   | #3406 `45c90a4` deployed     | F     | —       | Audible check on phone and tablet                                | Parent 1505                                     |
| 1476  | M   | #3386 `92aade1` deployed     | G     | —       | 1521 cadence decision                                            | Types regen deferred                            |
| 879   | H   | #2618 `7a15ed9` deployed     | F     | —       | Stripe test-mode checkout amounts                                | Blocked by 875                                  |
| 1078  | L   | #3380, #2967 deployed        | F     | —       | Physical print, rulebook re-check                                |                                                 |
| 1498  | H   | #3389 `a54a7ee` deployed     | E     | —       | First green Playwright Regression run with the four specs        | Dispatch it                                     |
| 1370  | H   | #3338–#3343 deployed         | G     | —       | Owner accepts the report as final (or reruns two routes)         | Harness signs fixtures into production          |
| 1392  | M   | umbrella                     | —     | —       | Closes with 1393                                                 | 1394, 1395 Done                                 |
| 1468  | H   | via #3369                    | G     | —       | Closes with 1369                                                 |                                                 |
| 1380  | L   | #3238, #3319 deployed        | F     | —       | Load run measurement                                             | Stall-test check in Phase 5                     |
| 1377  | L   | umbrella                     | —     | —       | Closes with 1380                                                 |                                                 |
| 1363  | M   | #3227 `7e31626` deployed     | F     | —       | sessions=50 subscription and statement counts                    | Measurement follow-up 1496                      |
| 1304  | H   | #3184 `3331ce0` deployed     | F     | —       | 126 rehearsal                                                    | Browser sweep 10-29 already recorded            |
| 27    | H   | #3355, #3358 deployed        | F     | —       | Owner guide review; ask-myk9show deploy; guides publish          |                                                 |
| 1460  | H   | #3346 `0b537a8` deployed     | C+G   | —       | No alert row; owner accepts traffic evidence                     |                                                 |
| 1243  | H   | #3099 `77a979f` (CI only)    | F     | —       | Dedicated CI accounts and secrets                                |                                                 |
| 1368  | M   | #3231, #3264 deployed        | F     | —       | sessions=50 requests per device                                  |                                                 |
| 1434  | M   | #3301 `917ac58` (scripts)    | F     | —       | Scheduled registration and a reviewed dry run                    |                                                 |
| 110   | U   | #2129–#2150 deployed         | F(+E) | —       | Recovery drill; weekend export-run count posted                  |                                                 |
| 1233  | H   | #3100–#3134 deployed         | F     | —       | Physical label-stock print                                       |                                                 |
| 1244  | H   | #3085, #3197 deployed        | G     | —       | Owner accepts (native dialog check was skipped)                  |                                                 |
| 1306  | M   | #3173 `de98e0b` deployed     | F+G   | —       | 126 rehearsal; criterion 3 recorded as by design                 |                                                 |
| 1360  | M   | #3228 `f7d5fa3` deployed     | F     | —       | 126 rehearsal                                                    |                                                 |
| 1265  | H   | #3141 `fb72cbe` deployed     | B+G   | S1      | Change-class dropdown walk; root-cause line waived               |                                                 |
| 958   | H   | none (observation task)      | F     | —       | Real secretary observation                                       | Blocked by 957; no comments on the issue        |

Expected end state if every agent-doable row passes and the owner accepts every recommendation: about 36 Done from this pass, about 20 closed by the decision sheet, about 20 waiting on the operator sheet (most of them one rehearsal window).

## Validation Profile

- Risk: low
- Validation: focused
- Rationale: the plan and its execution change only documentation and Linear state; no production source, migration or function is edited, and every database action is a rolled-back transaction or a read.
