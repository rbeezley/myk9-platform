# Issue Tracker

Linear tracks this project's work. Workspace slug `myk9-platform`, issue prefix `MYK9`
(e.g. MYK9-21).

## Access

Via MCP: the official marketplace `linear` plugin (`/plugin install linear@claude-plugins-official`),
a remote HTTP server at `https://mcp.linear.app/mcp` plus an OAuth grant. Authorization is
per-environment — check `/mcp` in the current session rather than assuming a prior session's
grant carries over.

## Querying — archived issues are the closed backlog

The workspace moved to a **paid plan on 2026-09-01**, retiring the old free-tier ceiling of 250
non-archived issues. That removed the _pressure_ to archive aggressively — it did not remove the
archiving. Auto-archive is a team **setting** (Team settings → **Workflows & automations** →
"Auto-archive closed issues, cycles, and projects" — _not_ Issue statuses, which is only the status
list), and it keeps running at whatever window it was left on. **That window is 30 days as of
2026-09-01, and is deliberately being left there.** Until someone changes it, closed issues still
leave the active set after 30 days and every rule below still holds — a short window makes
`includeArchived: true` _more_ load-bearing, not less. The recurrence checks the scheduled walks
run (MYK9-245, MYK9-215, MYK9-208, MYK9-122, MYK9-196) all name issues closed well beyond 30 days,
so they are archived right now and a default query would read every one as never-seen.
Do not treat the upgrade as having fixed this. Archived issues still exist — searchable,
restorable, and `get_issue`-able by id — but they are **invisible to a default `list_issues` call**,
which sends `includeArchived: false`.

That default is right for "what is open" and **wrong for every reconciliation query**. Any search
whose purpose is _"has this already been filed / fixed / rejected?"_ must pass
`includeArchived: true`, or it reads an empty result as "never seen" and re-files work that is
already Done. Closed issues here demonstrably recur — the overnight audits reopened six previously
Done issues on 2026-08-20 — so a duplicate is not a harmless extra row; it re-runs the remediation.

| Query intent                                        | `includeArchived` |
| --------------------------------------------------- | ----------------- |
| What's open / what to work on next                  | `false` (default) |
| Dedupe a new finding against prior ones             | **`true`**        |
| Check whether a fix already shipped                 | **`true`**        |
| Reconcile an audit ledger across runs               | **`true`**        |
| Resolve a specific `MYK9-<n>` cited in code or docs | **`true`**        |

`get_issue` by id is unaffected — it resolves archived issues without a flag. Prefer it whenever
you already know the id (and remember the LESSONS rule: never close from a `list_issues` result,
because it truncates acceptance criteria).

Archiving is automatic and cannot be triggered per-issue; Team settings → Workflows & automations
sets the window. The _Auto-close stale issues_ automation on that same page is a different thing and
is currently on (6 months → Canceled): it closes **open** issues, so the deliberately parked Backlog
items here — Stripe live-mode cutover, 10DLC registration, DR posture — are on a path to Canceled
around 2027-01 unless their current status or project qualifies for an exemption. The team now
uses projects, including Post-launch (verified 2026-10-25). Check the current automation and each
issue's membership before assuming it is protected; Parked alone is not proof of an exemption.
Do not "free up room" by deleting issues — deletion is permanent
after 30 days and orphans the ~197 distinct `MYK9-<n>` ids cited across ~737 files in this repo.

## Conventions

- Branch names encode the issue id and their prefix declares the implementing harness: `claude/myk9-1397-cloud-setup`, `codex/myk9-6-offline-fixture`. Linear's suggested branch name starts `richardbeezley1/`; replace that with `claude/` or `codex/`, because the independent reviewer is chosen from the prefix ([`docs/operations/cloud-agent-workflow.md`](../operations/cloud-agent-workflow.md)).
- Open PRs as drafts while iterating; mark ready for review when they are.
- OpenSpec proposals cite the tracking issue, e.g. `Tracking: [MYK9-21](https://linear.app/myk9-platform/issue/MYK9-21/...)`.
- Priority is importance, not readiness — an Urgent issue can sit deliberately in Backlog
  pending a blocker (e.g. sandbox testing). Don't propose starting a "Backlog" issue as
  unblocked just because its prerequisites merged; ask before reordering.
- Issues encode dependency chains as Linear issue-links — a single "In Progress" issue with
  unstarted downstream links is usually correct sequencing, not neglect.

## Labels: outstanding evidence and intervention

Status records progress, priority records launch importance, and issue relations record
dependencies. Labels only say what is still owed. Read the full issue and its latest comments
before acting on any of them. **Labels never grant authorization** to merge, deploy, change
shared data or secrets, charge or refund; the existing approval and review gates still apply.

The `verify` and `needs` groups are multi-select. Apply the children, never the group.

| Evidence label              | Remove only after recording                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `verify:browser`            | The real-browser journey on the required build, roles, routes and viewports                  |
| `verify:offline`            | Network loss, cold reload, reconnect and convergence                                         |
| `verify:load`               | A representative concurrent-device rehearsal with the issue's capacity/latency verdict       |
| `verify:performance`        | Route baseline, device timing, transfer size or profiler comparison on the stated workload   |
| `verify:physical-print`     | Real printer and stock: scale, alignment, clipping, readability (a PDF is not enough)        |
| `verify:real-user`          | The target user's observed journey and the disposition of each trip point                    |
| `verify:independent-review` | The other harness's review of the required head, with its findings dispositioned             |
| `verify:checkout`           | End-to-end checkout amounts and denial controls in the authorized environment                |
| `verify:database`           | Applied-database/RPC/grant behavior on the named target, with positive and negative controls |
| `verify:recovery`           | Backup freshness, restore and failover scope, with measured RPO/RTO                          |
| `verify:spec`               | OpenSpec verification against the integrated tree, and its archive                           |
| `verify:scheduled-runs`     | The run IDs and dates of the consecutive green scheduled runs the issue requires             |

| Intervention label   | Add when                                                                   | Remove when                         |
| -------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| `needs:decision`     | An owner product, scope, risk or restructure decision blocks the next step | The owner records the decision      |
| `needs:operator`     | The next action needs an authorized person, hardware or a real user        | That action is done and recorded    |
| `needs:environment`  | A required tool, credential, fixture or reviewer is confirmed unavailable  | A run with that capability takes it |
| `needs:coordination` | Other active work owns the same paths                                      | Ownership or sequencing is agreed   |

- Every `needs:*` label comes with a comment naming the question or action, its owner, and the
  unblock condition. Every `verify:*` label keeps its criterion in the issue.
- Add and remove labels incrementally; keep unrelated labels. Re-add one when its evidence goes
  stale. **No labels is not proof of completion**: Done needs a fresh full read of every criterion.
- **Everything still owed is a label or a relation, never prose alone** (MYK9-1495). An open
  blocked-by relation or an open sub-issue counts as owed with no label. Anything else gets one:
  a wait for scheduled runs is `verify:scheduled-runs`, and an owner accepting a substitute check
  is `needs:decision`.
- **Removing the last owed label, or the last blocker closing, triggers a fresh read**: Done only if
  every criterion is evidenced and no blocked-by relation or sub-issue is still open, otherwise
  label what is still owed. An In Review issue with no
  `verify:*`/`needs:*` label, no open blocker and no open sub-issue is a defect: fix it on sight.
- **After each Deploy myK9Show run**, the `deploy` skill's post-deploy pass works the agent-doable
  labels on issues the deploy shipped.
- Work types: `Bug`, `Improvement`, `Feature`, `Test` (test or harness work; never "tests
  passed"), `Ops` (operational work: follow its runbook, not a code implementer). `Parked` is an
  explicit owner decision to defer until a named trigger; leave it out of launch work.
- Retired, do not apply or recreate: `Claude`, `Codex`, `lane:mac`, `lane:pc`, `Oct 10 test show`,
  `vacation-blocked`, `needs-richard`, `Human Tester`, `Wait for Launch`, `auto:green`,
  `auto:yellow`. Replace one on an open issue with the specific `needs:*` or `verify:*` label.

## Lifecycle owner and GitHub automation

The root agent running a command or pipeline owns the tracking issue through every delegated
phase. OpenSpec task checkboxes do not update Linear.

| Stage                            | Status                                               |
| -------------------------------- | ---------------------------------------------------- |
| Not started, or held before work | Unchanged (Backlog/Todo)                             |
| Implementation started           | In Progress, through the unmerged PR's review gate   |
| Merged, only acceptance owed     | In Review, with the `verify:*` labels still owed     |
| Merged, more implementation owed | In Progress (set it back if a linked merge moved it) |
| Every criterion evidenced        | Done, after a fresh `get_issue` read                 |

Team automations, owner-approved and read back on 2026-10-25: PR open → In Progress; PR
review activity → no action; **PR merge → In Review**; parent and sub-issue auto-close off. A
merge therefore never asserts Done, but a linked merge can also move an issue whose implementation is only
partly merged. **After every merge, the root fresh-reads the issue and sets the row above.**
Automation is a convenience, not proof.

Moving an issue to In Progress also posts the one-line claim comment defined in Gates step 1
of the shared rules (session, branch or `claude/myk9-<n>-` prefix, worktree or cloud session
URL). The issue janitor (MYK9-1434) reads those three fields from that line to tell a live
claim from a dead one.

The close-out rules above depend on the claiming session staying alive, and sessions end
without them. The issue janitor (`pnpm qa:issue-janitor`, run daily by a scheduled session,
[`scheduled-audits-claude.md`](../operations/scheduled-audits-claude.md) Task 4) is the
backstop: it applies the dispositions in this file to In Progress and In Review issues whose
claim has gone quiet, and adds none. It skips any issue with a `needs:*` label or a comment
under 6 hours old, and it never moves an issue to Done without a fresh full read.

Final implementation PRs use `Fixes MYK9-<n>`. Partial PRs use `Ignore MYK9-<n>` with a
tracking link; the root reconciles the issue explicitly after merge. Write documentary
follow-ups with `Ignore` too. [Linear documents](https://linear.app/docs/github#link-through-pull-requests)
that `Ignore` suppresses PR linking even when the branch contains the ID. Check the actual
relationships before merge or handoff, and keep unrelated IDs out of the squash message.

### Asynchronous merge protocol

Use ship-pr's Path B after watcher exit 3, with the required review and merge authorization
already satisfied. Record the head, issue, worktree, PR and owning executor before auto-merge.
Then:

- **Ship through completion was requested:** keep watching. Re-run the watcher, one bounded run
  at a time, until the PR merges or a check fails, then close out.
- **Owner-approved stop or handoff:** report merge-pending, keep the worktree and issue
  In Progress, and record a named post-merge executor and exact resume action. A watcher
  timeout alone does not release ownership. Do not advance the queue while still responsible.

Never archive an OpenSpec change or remove the worktree before the merge is confirmed.

## Dispositions and holds — the single routing table

Skills reference this table instead of keeping their own mappings. A hold leaves the status as
the lifecycle table says; the label records why work stopped. Inconclusive ownership/discovery
checks are run-level failures, distinct from a verification runner that actually hangs.

| Situation                                                                            | Label                | Notes                                                                                                      |
| ------------------------------------------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------- |
| The premise did not reproduce, or the agent reads it as by design                    | `needs:decision`     | Record the build and scenario, or the citation. Never cancel or move to Backlog on this basis              |
| An owner product/scope question, a convergence stop, or a model escalation           | `needs:decision`     | Post the question or restructure proposal                                                                  |
| It touches payments, refunds, fees or money guards with no recorded owner approval   | `needs:decision`     | Stop before work, whatever the size; stop mid-work if found later                                          |
| Required CI is still red after two fix attempts                                      | `needs:decision`     | Record what was tried and the proposed next approach                                                       |
| A required tool, credential, fixture or reviewer is confirmed unavailable            | `needs:environment`  | Name the missing capability                                                                                |
| The criteria need an owner-only action: shared-system operation, hardware, real user | `needs:operator`     | Skip the stop when the owner already authorized that sequence                                              |
| An orchestrate run finds a migration                                                 | `needs:operator`     | Carry the PR through its review gate, then do not merge in this run                                        |
| `qa:inflight` exits 1, an In Progress issue names the paths, or a session overlaps   | `needs:coordination` | A held or idle branch can still own unmerged work                                                          |
| A verification runner hangs past 30s                                                 | `needs:decision`     | Stop the suite; record the repair/handoff question and owner. Do not repeat the hung run                   |
| `qa:inflight` exits 2 or a Linear read fails                                         | none                 | Stop dispatch and report the failed check; establish ownership before resuming, without a speculative hold |
| Merged, acceptance evidence owed                                                     | `verify:*`           | In Review                                                                                                  |

The hold comment names the owning chat, worktree, branch and PR, the exact question or action,
its owner, and the unblock condition. To resume, restore the recorded worktree first, then run
`qa:inflight` there. At the start of a run, check **Blocked work** for holds whose condition has
cleared and remove only those labels.
Also inspect recorded In Progress and In Review PRs at resume, including unlabeled rows:
reconcile confirmed merges and outstanding criteria before selecting new work. A pause never
releases another executor's worktree or branch; agree takeover before overlapping edits.

## Saved queues and verification batches

| View                                                                                              | Contents                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Ready for an agent](https://linear.app/myk9-platform/view/81143969-5d01-4991-8b68-d8d994c93426)  | Todo, not blocked, no `Parked` or `needs:*` label; priority order |
| [Verification needed](https://linear.app/myk9-platform/view/316a2fa9-78c5-4cb5-9ba5-71332adb4bf7) | All In Review, including unlabeled rows; grouped by `verify:*`    |
| [Owner actions](https://linear.app/myk9-platform/view/595922bc-5449-47e9-9f00-908a6852691d)       | Open issues with `needs:decision` or `needs:operator`             |
| [Blocked work](https://linear.app/myk9-platform/view/72298184-9990-40b7-ab46-253f9147d580)        | Open issues with any `needs:*` label, every priority              |
| [Launch blockers](https://linear.app/myk9-platform/view/81b32ef5-7f1f-4bda-a89e-2533c4ca2df1)     | Open Urgent/High, excluding `Parked` and the Post-launch project  |

Views select candidates; they do not prove or authorize anything. Query one with
`list_issues(customView: <id or exact name>)`. **Connector fallback** for Ready for an agent:
list team MyK9-platform, state Todo, every page; drop `Parked` and `needs:*` client-side; rank
by priority, launch fit and closeness to done; then read full issues with relations, in that
order, until you have enough eligible candidates. Resolve every blocker: a merged PR alone
does not satisfy an open prerequisite, including one In Review. Read a Canceled/Duplicate
blocker's resolution and canonical issue. Unknown relation state excludes the candidate.
Never broaden to Backlog. Before claiming a candidate, re-read its latest comments, reproduce
the premise and run the ownership checks.

[Launch verification sessions](https://linear.app/myk9-platform/document/launch-verification-sessions-3ab8911b3c10)
groups the Verification needed issues into shared sessions by build, target, role and device.
Before a session, record its executor, build, target and who owns fixture setup and cleanup.
Afterwards record pass, fail or not-run per criterion, link the result from each issue it
covers, and remove only the labels it satisfied. A shared session is not a blanket review
verdict: each independent review still covers its own head.

## Model routing for issue work

When the user requests subagents, choose models by the uncertainty and risk of each task:

- Use GPT-6 Sol for orchestration: interpreting acceptance criteria, assigning work, resolving
  ambiguity, integrating changes, and deciding whether the issue is complete.
- Use GPT-6 Luna for bounded work with explicit inputs and pass conditions: locating code,
  summarizing patterns, gathering test evidence, and making small, well-specified edits.
- Use GPT-6 Sol for implementation that crosses architectural boundaries, changes offline data
  or permissions, or requires design judgment. Escalate a Luna task to Sol if its scope becomes
  ambiguous or targeted checks do not pass.
- Use GPT-6 Sol for the final adversarial PR review. Luna can provide an additional focused
  review lens, but neither model replaces an other-harness review when the review tier requires
  `independent` scrutiny.

This is a routing default, not a reason to create subagents. Do not add model assignments to
every Linear issue. Record a short issue-specific routing note only when unusual complexity,
risk, or independent parallel work changes this default. Choose again as the issue evolves.

## Division of labor with OpenSpec

Linear holds _state_ (status, priority, sequencing). `openspec/changes/<id>/` holds _content_
and is cited in the issue body as "Source of truth" with spec + task-section pointers. They
are not duplicating — an OpenSpec change _is_ the plan; don't also author a `docs/plan-*.md`
for the same work.

## PRs as a request surface

Off. External PRs are not currently pulled into the triage queue from this tracker.
