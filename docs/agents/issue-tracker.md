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

This contract applies to Claude Code and Codex. Labels help select the next action; read the
full issue, latest comments and linked plan before acting. Status records progress, priority
records launch importance, and issue relations record dependencies. Labels do not replace them.

The `verify` and `needs` groups are **multi-select**. Use the exact child names below (or their
team label IDs); never apply the group itself. Add every independently outstanding proof that
the issue explicitly requires. Add proof labels to implemented work awaiting acceptance evidence;
an explicit later evidence gate may also be tagged before implementation, without changing status.

| Evidence label              | Evidence needed before removing it                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:browser`            | Required real-browser journey, roles, routes, viewports and build                                                                       |
| `verify:offline`            | Required network loss, cold reload, reconnect and convergence journey                                                                   |
| `verify:load`               | Representative concurrent-device rehearsal and required capacity/latency/queue/persisted-score verdict                                  |
| `verify:performance`        | Route baseline, device timing, transfer size or profiler comparison on the stated workload                                              |
| `verify:physical-print`     | Required printer and paper/label stock, scale, alignment, clipping and readability results                                              |
| `verify:real-user`          | Target user's observed journey, notes and disposition of trip points                                                                    |
| `verify:independent-review` | Other-harness review on the required head/range, with findings dispositioned                                                            |
| `verify:checkout`           | Required end-to-end checkout amounts and denial controls in the authorized environment; stop before charging when the issue requires it |
| `verify:database`           | Applied-target database/RPC/grant/role or hosted-integration proof with required positive/negative controls                             |
| `verify:recovery`           | Required backup freshness, restore, Storage and application-failover scope, with cadence/RPO/RTO measurements                           |
| `verify:spec`               | Integrated OpenSpec implementation verification and required archive/closeout evidence                                                  |

| Intervention label   | Add when                                                                                                            | Remove when                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `needs:decision`     | An unresolved product, scope, risk-acceptance or restructure decision blocks the next step                          | The decision owner records the decision                        |
| `needs:operator`     | The remaining action requires an authorized person/operator, shared-system operation, hardware or real-user session | That action is completed and recorded                          |
| `needs:environment`  | This run lacks a required tool, credential, network, fixture or execution environment                               | The missing capability is restored or a capable run takes over |
| `needs:coordination` | Active work overlaps the intended paths or ownership                                                                | Ownership/sequencing is agreed or the overlap resolves         |

For each intervention, name the exact action/question, owner and unblock condition in the issue.
For each proof, keep the exact criterion and runnable next step in the issue or linked evidence.
Reuse existing accurate comments; do not post a duplicate comment just to apply a label.

Agent lifecycle:

1. Read current evidence before adding a label. An old cloud session lacking credentials does
   not establish a current environment blocker; an approved owner decision is no longer pending.
2. Use incremental `addLabels` / `removeLabels` updates, preserving unrelated labels.
3. Work that still needs implementation or defect fixes stays **In Progress** once started.
   Keep an unmerged implementation PR In Progress through its code-review gate. After merge,
   implemented work awaiting acceptance evidence belongs **In Review**. A hold does not itself
   make unfinished code review-ready. Apply the disposition table below for holds and rejected premises.
4. Record the tested commit/build, target, role/device/workload, commands, results and evidence
   link appropriate to the criterion. Link a shared rehearsal result from each issue it proves;
   do not start separate load runs for every tagged optimization.
5. Remove only the proof/intervention actually satisfied. Keep other pending labels. Re-add a
   label when evidence becomes invalid or a required recheck is introduced.
6. Before Done, fetch the full issue again, check every criterion and the merge/evidence gates,
   and reconcile its pending labels. **No labels is not proof of completion.** Physical stock,
   real users, hosted behavior and other-harness review need their respective evidence.
7. Labels grant no authorization to merge, deploy, change shared data/secrets, charge or refund.
   Existing approvals and review gates still apply. `verify:independent-review` identifies the
   review owed; it does not assign the implementation to a model or harness.

Retired labels: `Claude`, `Codex`, `lane:mac`, `lane:pc`, `Oct 10 test show`, `vacation-blocked`,
`needs-richard`, `Human Tester`, `Wait for Launch`, `auto:green` and `auto:yellow`. Do not apply
or recreate them. Historical closed issues may retain them. Replace a vague hold with its actual
`needs:*` blocker or `verify:*` evidence requirement, or remove it when already resolved.
Record implementation/review provenance in the issue's evidence and PR. Use
`verify:independent-review` for an outstanding other-harness review. Choose execution hosts by
the capabilities the next action requires; a device or harness name is neither proof nor permission.

Keep `Bug`, `Improvement`, `Feature` and `Test` as work types. `Test` includes test/harness repair
and coverage work; it does not mean acceptance verification passed. `Ops` identifies operational
or business work rather than an implementation task; add `needs:operator` for an outstanding
authorized-person action. `Parked` marks an explicit decision to defer work until a named trigger,
not merely an unstarted issue. Do not select it for launch implementation until the owner brings
it into scope. Record the trigger in the issue and remove the label when that decision changes.

## Lifecycle owner and GitHub automation

The root agent running a command or pipeline owns the linked Linear issue across delegated
phases. Read the full tracking issue and latest comments before work; OpenSpec task checkboxes
describe artifact progress and do not update Linear by themselves. The root must:

1. Complete premise, dependency, ownership and approval checks before implementation. Set the
   issue In Progress when implementation starts; proposal/exploration alone leaves its state.
2. Apply the disposition table on every pause and handoff, with the complete hold record.
3. Reconcile the full issue after merge and again after archive/spec closeout. Keep each pending
   proof until recorded; move Done only when every criterion and required merge/evidence gate passes.
4. Use the **Asynchronous merge protocol** below whenever merge is armed but not confirmed.

Team [Workflows & automations](https://linear.app/myk9-platform/settings/teams/MYK9/workflow)
was aligned with this lifecycle and read back on 2026-10-25 after owner approval:

| Event / setting            | Saved behavior |
| -------------------------- | -------------- |
| PR review request/activity | No action      |
| PR merge                   | In Review      |
| Auto-close parent issues   | Off            |
| Auto-close sub-issues      | Off            |

PR open still moves to In Progress. Draft/ready-for-merge events take no action. Thus a merge
queues acceptance review rather than asserting Done, including asynchronous merges. Parent and
sub-issue closure requires each issue's own evidence check. Treat automation as a convenience,
never proof: confirm the actual state and reconcile it even when integration delivery is delayed.

PR linking syntax follows [Linear's GitHub documentation](https://linear.app/docs/github#link-through-pull-requests):
use `Fixes MYK9-<n>` for the final implementation PR to invoke the saved merge destination,
In Review. Use `Part of MYK9-<n>` for an intermediate contribution; it links without applying
the merge destination. Neither form proves acceptance. Confirm the linked issue and actual state.

### Asynchronous merge protocol

This is the only stop/continue policy for pending merges; consumers reference it.

1. Before arming auto-merge, satisfy the independent review and merge-authorization gates.
   Record the pinned head, pending proof labels, owning executor/worktree/PR and merge-pending ledger.
2. A timeout alone does not release ownership or advance the queue. Keep the issue In Progress,
   preserve the worktree, and monitor the current PR until confirmed merged or a real blocker.
3. **Only if an owner-approved run boundary is reached** (a recorded stop time/cap, or an explicit
   handoff request), record a named post-merge executor and concrete resume action, then hand off.
   A generic timeout is not that boundary. A ship-through-completion request without such a
   boundary keeps the current root responsible; do not silently switch to another issue.
4. Once merged, fresh-read and reconcile the issue under the disposition table, including
   remaining implementation versus acceptance proof. In Review automation is not Done evidence.
   Do not archive or remove the worktree before confirmed merge and required closeout.

## Dispositions and holds — the single routing table

All agent workflows use this table; do not maintain separate label/state mappings in skills.
A pre-work hold leaves Backlog/Todo unchanged. A hold after implementation starts keeps the issue
In Progress, including an unmerged PR. After merge, missing acceptance evidence belongs In Review.
Apply every independent hold that remains; labels never grant the approval they describe.

| Situation                                                                                                             | Disposition / intervention                                                                                                                      | Resume or resolution                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reproduction completed but the defect is not reproduced, or the agent considers it by design                          | needs:decision; preserve the pre-work/started state; record tested build/scenario or exact design citation                                      | Owner resolves the disputed premise; do not autonomously cancel or move it to Backlog on this basis                                                                                                                        |
| New scope/product question reserved for the owner, convergence stop, or model escalation                              | needs:decision; state follows the pre-work/started rule above                                                                                   | Named decision owner records the exact approval or restructure choice                                                                                                                                                      |
| Work touches payments, refunds, fees or money guards without recorded owner approval for that scope                   | Pre-work stop with needs:decision, regardless of issue size; stop mid-work if discovered later                                                  | Owner explicitly approves the scope before implementation starts or resumes; never infer approval from a label                                                                                                             |
| Required CI remains red after the run's two fix attempts                                                              | needs:decision for an explicit repair/handoff plan; keep In Progress                                                                            | Owner/executor accepts the next repair approach; code fixes and passing checks remain owed                                                                                                                                 |
| Required tool, credentials, fixture, network or reviewer unavailable                                                  | needs:environment; state follows the pre-work/started rule                                                                                      | A capable executor establishes the missing capability is restored; do not infer a fix from elapsed time                                                                                                                    |
| A verification runner hangs over 30 seconds                                                                           | Stop the suite and report; needs:decision for a repair/handoff plan; started work stays In Progress                                             | Name the owner/capable executor and runnable next approach; do not retry the same hung suite in a loop                                                                                                                     |
| Criteria require an owner-only/person action (including real-user observation)                                        | Pre-work stop with needs:operator unless the owner already authorized the implementation/verification sequence; unmerged work stays In Progress | Record the action, responsible person and approved sequence                                                                                                                                                                |
| An orchestrate Linear run discovers a migration, before or during implementation                                      | needs:operator; carry the PR through its review gate, then stop before merge in this run                                                        | The owner continues the migration merge/deploy sequence in a separately authorized workflow; the run's generic push/PR/squash-merge authorization does not waive this stop. Never push a migration from an unmerged branch |
| qa:inflight exits 1, an In Progress issue names the paths, or a running session/PR/branch/worktree overlaps ownership | Pre-work stop with needs:coordination                                                                                                           | Agree ownership/sequencing; a held or idle branch may still contain unmerged work                                                                                                                                          |
| qa:inflight exits 2 (could not decide), or the required ownership checks cannot be completed                          | Pre-work stop with needs:environment; an unknown overlap check is not a pass                                                                    | Restore the check and establish ownership before implementation; do not bypass it                                                                                                                                          |
| Merged implementation awaiting browser, device, hosted or other acceptance proof                                      | In Review with the applicable verify:* labels and any independent needs:* hold                                                                  | Record each criterion's required proof; remove only satisfied labels and fresh-read before Done                                                                                                                            |

When merged work has every criterion supported by recorded evidence, fresh-read the full issue
before Done and remove satisfied pending labels. Keep its merge/build and acceptance links.
If reproduction could not run, use the capability row, not the completed-reproduction row.
An INTENT citation or an agent's reading of a prior decision is evidence for owner review, not
authority to cancel. Once the owner resolves the premise, apply only that recorded disposition
to the scope it covers. Non-reproduction is never proof of a fix. Done still requires the merge
and full acceptance gates.

Every hold comment records: **disposition (held), current executor (active or paused), owning
chat/worktree/branch/PR, exact question/action, responsible owner or capable next executor, and
the unblock condition**. Maintain this record on handoff. A paused executor does not release
another agent's ownership: preserve qa:inflight and the In Progress path checks, inspect the
recorded work, and agree takeover/sequencing before touching overlapping paths. On a later run,
review Blocked work for restored capabilities or resolved decisions and remove only stale holds;
do not wait for the issue to reappear in Ready for an agent by itself.

To resume the same issue, restore its recorded worktree/branch first (or agree a takeover), then
run qa:inflight there. The check excludes that current branch and its own PR; it does not exclude
another executor's work. The In Progress path check likewise distinguishes this resumed issue
from other issues. Reuse the held work and ledger rather than creating a competing branch.

## Saved queues and verification batches

Use the shared team views to select work instead of repeatedly scanning the full board:

| View                                                                                              | Selection and display                                                                                     |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [Ready for an agent](https://linear.app/myk9-platform/view/81143969-5d01-4991-8b68-d8d994c93426)  | Todo; not blocked by another issue; excludes any of Parked or the four needs:* labels; priority order     |
| [Verification needed](https://linear.app/myk9-platform/view/316a2fa9-78c5-4cb5-9ba5-71332adb4bf7) | All In Review, including issues without verify labels; grouped by verify and ordered by priority          |
| [Owner actions](https://linear.app/myk9-platform/view/595922bc-5449-47e9-9f00-908a6852691d)       | Open issues with either needs:decision or needs:operator; grouped by needs; deferred items remain visible |
| [Blocked work](https://linear.app/myk9-platform/view/72298184-9990-40b7-ab46-253f9147d580)        | Open issues with any of the four needs:* holds, at every priority; grouped by needs for recovery/handoff  |
| [Launch blockers](https://linear.app/myk9-platform/view/81b32ef5-7f1f-4bda-a89e-2533c4ca2df1)     | Open Urgent/High issues; excludes Parked and the Post-launch project; includes blocked/operator-held work |

Open means Backlog, Todo, In Progress or In Review. These views are candidate selectors, not
authorization or proof. The launch view ranks attention; the scorecard and full criteria decide
go/no-go. Hidden nested rows are displayed flat so a nonmatching parent is not mistaken for work
in the queue. Group counts can overlap when an issue owes several proofs.

Resolve a view with `list_custom_views` and query it using `list_issues(customView: <id or exact
name>)` when supported. For **Ready for an agent**, the exact connector fallback is:

1. Query team MyK9-platform, state Todo, excluding archived issues; read every page. Never
   broaden to Backlog when no candidate qualifies.
2. Exclude any issue carrying Parked, needs:decision, needs:operator, needs:environment or
   needs:coordination. Use client-side filtering when the connector has no exclusion arguments.
3. Read each remaining full issue and its blocked-by relations. Resolve each blocker and exclude
   unfinished prerequisites. A merged PR alone is insufficient; a Canceled/Duplicate blocker
   requires reading its recorded resolution/canonical issue. If a selection read fails or relation
   state is unknown, skip the candidate for this selection and record the read failure in the run
   summary; do not add a persistent hold to an unclaimed issue for a transient query failure.
   Re-read on the next selection. If the connector cannot establish any candidate's eligibility,
   stop selection and report the missing capability; unknown state never permits starting work.
4. Rank eligible candidates by priority, launch fit and closeness to done. Before claiming one,
   re-read its latest comments, reproduce the premise and check concurrent work/ownership.

Other view fallbacks query their table's statuses and apply its property predicates across all
pages. Never invent unsupported tool arguments. Even saved-view candidates need the full-issue,
dependency, premise and ownership checks above. An In Review item with unfinished code or a
restructure hold is not ready for an acceptance-only session.

At resume, check Verification needed as well as Ready and Blocked work. Its ungrouped/no-verify
rows include merged issues needing only final reconciliation: fresh-read their full criteria,
close Done when all evidence already exists, or record the actual outstanding proof/hold. The
view's membership requires In Review, not a verify label.

[Launch verification sessions](https://linear.app/myk9-platform/document/launch-verification-sessions-3ab8911b3c10)
holds the current session matrix; original issues retain their criteria and closure evidence.
At session start, refresh the view and group by compatible build, target, role/device/workload
and fixture ownership. Use separate secretary/admin and exhibitor contexts. Coordinate one G9
rehearsal through its existing parent issues, one route/device performance pass through its
baseline issue, and reuse a result only for criteria it actually exercises. Other-harness review
still needs a verdict on each required head/range; a shared session is not a blanket approval.

Before running, record the executor, prerequisites, exact scope, commit/build, target, fixture
setup/cleanup owner and any required approval. Keep shared-data/paid actions, physical stock,
real-user observation and recovery operations explicitly owned. Queue setup and grouping do not
authorize those actions. Afterward record pass/fail/not-run per criterion with sanitized artifacts,
link the shared result from each covered issue, remove only satisfied labels and fresh-read every
criterion before Done. Preserve unmet gates and hand off the next concrete action when blocked.

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
