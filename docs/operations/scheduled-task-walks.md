# Scheduled Task Walks — Secretary, Exhibitor, Role Intent, Show Day

> **Status:** Reference

The **walk** tasks, what each covers and how they are scheduled. **The prompts themselves live in
[`docs/qa/walks/`](../qa/walks/README.md)** (MYK9-733), one file per walk, and each installed task
reads its file from `origin/main` at run time. The fenced block under each walk below is not the
prompt: it is the short pointer that the installed `~/.claude/scheduled-tasks/<taskId>/SKILL.md`
holds, minus its YAML frontmatter, byte for byte. `pnpm qa:prompt-parity` checks that for these
walks and the three audit tasks in [`scheduled-audits-claude.md`](scheduled-audits-claude.md); it is
local-only, since the installed files never reach CI.

Before MYK9-733 the whole prompt sat in this file and was copied into the installed task by hand,
and the copy drifted both ways (see the walks README). Editing a walk now means editing its file in
`docs/qa/walks/` through a reviewed change; this file changes only when a walk is added, dropped or
rescheduled, or the pointer itself changes.

## Why these are a separate file

[`scheduled-audits-claude.md`](scheduled-audits-claude.md) holds the Claude tasks paired against the
Codex nightly set, and its taxonomy is relative to Codex: _complements_ run alongside a Codex task
to disagree with it, _substitutes_ replace one while it is dark. These three fit neither. Codex has
its own `weekly-secretary-ux-walk` and `weekly-exhibitor-ux-walk`, but these are not paired against
them for a second opinion; how the two sets relate is in § "Personas, and the Codex walks" below.

## The walks, and the line between them

| Task                  | Roles                         | Asks                                                    |
| --------------------- | ----------------------------- | ------------------------------------------------------- |
| `secretary-task-walk` | secretary                     | Does the job work end to end?                           |
| `exhibitor-task-walk` | exhibitor                     | Does the job work end to end?                           |
| `role-intent-walk`    | judge, club-admin, site-admin | Does it _feel_ the way INTENT.md says it should?        |
| `show-day-walk`       | secretary → judge → exhibitor | Does one entry read the same to every role on show day? |

`show-day-walk` (MYK9-732) is the only walk that crosses roles. The others each stop at their own
role's edge, and the show-day P1s sat exactly at those edges: a judge the secretary assigned read
`Judge TBD` to every exhibitor (MYK9-494), and Ringside read `0 / 0` while Show Desk had the entries
(MYK9-637). It follows one entry from the secretary's check-in through the judge's ringside scoring,
including one offline cycle checked against SQL, to what the exhibitor reads, on the show-day fixture
that `supabase/seed-demo.sql` section 19 keeps running for seven days after each reseed (MYK9-731).

The two task walks ask whether the role can actually do its job — a route that renders beautifully
and cannot complete the task is a P1. `role-intent-walk` asks the emotional-design question against
`docs/INTENT.md`.

**The split is by role, not purely by question,** and that is deliberate. Both task walks now carry
the INTENT lens themselves (the exhibitor's has always; the secretary's moved in on 2026-09-01), so
`role-intent-walk` covers only the three roles with no dedicated walk. Its predecessor,
`claude-role-ux-walk`, rotated through all five roles every five weeks — which meant exhibitor and
secretary got a redundant fifth-week revisit while judge, club-admin and site-admin waited five
weeks each for their only coverage. The rotation is now three, so those three roles are walked
three times as often.

**Steward is in none of them,** because there is no steward sign-in: `testUsers.ts` states steward
flows use the canonical secretary account, so a steward slot would silently re-walk as the secretary
and report it as steward coverage. Revisit if a distinct actor is ever seeded.

## Personas, and the Codex walks

Since 2026-09-14 both task walks run their job list **twice, as two personas with the same role and
permissions**: a beginner and an experienced user. (The exhibitor walk also varies the _account_
between personas, for account history; its prompt says why.) `docs/INTENT.md` § "What myK9 is NOT"
promises no jargon, no hidden features, no "power user" shortcuts that leave beginners behind, and
its secretary table's "Show day chaos" row promises "I can handle this", with scratches and move-ups
as calm one-tap operations. A single elderly-novice persona can only ever test the first promise.
Persona changes what the tester knows and wants, never what the account may do. The beginner pass
runs first in its own browser context so nothing the experienced pass learns can teach it, and one
persona's observation is never proof for the other.

Both Codex UX walks carry the same two personas; that is where the wording originated. What their
config files state, read on 2026-09-14 from `~/.codex/automations/<name>/automation.toml`
(`status` and `rrule` only; the permission language is in the `prompt` field, summarised below):

| Codex automation           | Status | Cadence                  |
| -------------------------- | ------ | ------------------------ |
| `weekly-secretary-ux-walk` | PAUSED | weekly, Tuesday          |
| `weekly-exhibitor-ux-walk` | ACTIVE | monthly, second Thursday |

The secretary prompt asks for club, show, people, dog and entry writes and the exhibitor prompt
for dog and entry writes, but both run under `role-journey-ux-audit`
(`.codex/skills/role-journey-ux-audit/SKILL.md`), which requires explicit approval for every write
to hosted Supabase, and an unattended run has none. What a given run actually wrote is in that
run's `memory.md`: the secretary ledger records "No hosted CRUD"; the exhibitor ledger records an
incidental hosted cart write on `exhibitor@` and says "do not claim zero shared writes". Neither
has a `ZZ` naming or teardown contract. So the Claude walks are the only scheduled secretary walk
that fires today, the only exhibitor walk that fires weekly, and the only ones that create and tear
down fixtures. Nothing is "owned" by one side: both sets ask the same persona questions
independently. Each Claude prompt tells its run to read the Codex `status` and `rrule` at run time
rather than trust this table, which goes stale the day Codex is unpaused (MYK9-408).

Linear convergence is only guaranteed at P0/P1, where both sides file one issue per defect and
dedupe with `includeArchived: true`. At P2/P3 the schemes differ: this file groups them under a
per-run parent, Codex files each as its own canonical issue. Both fenced prompts therefore carry
the rule that a P2/P3 with an existing Codex canonical issue is commented there, not added as a
sub-issue. The persona-by-viewport matrix on each finding is what lets a reconciler tell "both
walks, both personas" from "one walk, one persona". These simulated passes inform real-user
validation (MYK9-13); they do not replace it.

## What is in these prompts that is not obvious

Most of the bulk is not instructions, it is **hard-won measurement mechanics** — the parts that took
a bad audit to learn. Preserve them on any edit:

- Reports render in an **iframe**, and any report with a `buildPdf` puts a PDF blob in the frame
  `src`. Headless Chromium has no PDF viewer, so a full sheet reads as a 39-byte empty shell. The
  Blob must be measured by wrapping `URL.createObjectURL`; `fetch` and XHR both report zero for a
  perfectly good document. Twelve UKC/ASCA forms are download-only and correctly render no preview.
- An **empty result is not evidence of emptiness.** Disabled, paused-offline, and placeholder
  queries all render `isLoading: false` with no data, and the UI states that as fact.
- A **fresh browser context** is the only cold-replica test — re-navigating leaves the replication
  store warm from the second load on.
- **Anchor every destructive click to the row that owns it**, and never assume a confirm dialog
  exists. A page-wide `.last()` fallback destroyed the canonical CI secretary's own appointment on
  2026-08-31 (MYK9-284).
- The **judge account is judge-ONLY and that is load-bearing** (MYK9-141), as is the club-admin
  account being club-scoped with no site_admin (MYK9-137). Substituting the site admin for either
  satisfies the gate without ever testing the scoping.

## Findings contract

All four follow the shared Linear contract in
[`scheduled-audits-claude.md`](scheduled-audits-claude.md) § "Findings go to Linear" — file P0/P1
directly with no approval step, group P2/P3 under one parent per run, keep coverage gaps and probe
bugs out of Linear, dedupe with `includeArchived: true`, and commit the report to `main` as the
permitted repo write (with the walk's own Part 2 corrections, see the walks README). It is restated
inside each prompt so they stay self-contained; change it everywhere or nowhere. The two task walks carry one addition the
shared contract does not: a P2/P3 already filed as a Codex canonical issue is commented there rather
than added as a sub-issue, because only those two roles have a Codex counterpart.

## Schedule

| Task                  | Cadence           | Time (local) | Enabled                                                              |
| --------------------- | ----------------- | ------------ | -------------------------------------------------------------------- |
| `secretary-task-walk` | Weekly, Wednesday | 3:05 AM      | yes                                                                  |
| `role-intent-walk`    | Weekly, Friday    | 3:00 AM      | **no** — needs one supervised run to grant browser-control approvals |
| `exhibitor-task-walk` | Weekly, Sunday    | 3:05 AM      | yes                                                                  |
| `show-day-walk`       | Weekly, Monday    | 3:05 AM      | **not installed yet** — create the task, then one supervised run     |

Spread across four mornings on purpose: two walks against shared staging at the same hour collide.
Claude Code scheduled tasks run **locally, and only while the desktop app is open** — if the app is
closed when one comes due it fires on next launch rather than skipping, so treat the times as an
ordering preference, not a guarantee. `show-day-walk` must also stay off the exhibitor walk's day:
the exhibitor walk self-checks-in the show-day fixture's entry for that day, and a same-day show-day
walk would read that change in its class.

All four depend on a reseed at least weekly: the show-day fixture holds a trial dated today for
seven days after a reseed, and after that the exhibitor walk's tasks 5 and 7 and the whole
show-day walk report themselves blocked on a stale fixture.

`role-intent-walk` also needs `E2E_CLUB_ADMIN_PASSWORD` in `apps/myk9show/.env.local` for its
club-admin week; without it that week is a coverage gap, and the prompt forbids substituting the
site admin.

## Maintenance

- Edit a walk in its file under [`docs/qa/walks/`](../qa/walks/README.md), through review. The
  installed task reads that file from `origin/main`, so a merged change reaches the next run with no
  copy step. The walks README says how a run's own "Prompt corrections" come back into the file.
- These walks accumulate a "known mechanics" part from each run. That growth is the point: it is
  what stops the next run re-deriving a false failure. Do not trim it for length.
- The "open issues to re-verify" list is load-bearing and goes stale fast. When an issue there is
  fixed and confirmed, move it to the do-not-re-file note rather than deleting it.
- If a walk's findings become dominated by harness bugs rather than product defects, the prompt has
  drifted from the app. Re-walk it by hand before trusting the next report.
- **Switching an installed task to its pointer (MYK9-733, one time).** Until each installed
  `SKILL.md` holds the pointer block under its heading below, `pnpm qa:prompt-parity` reports it
  `DRIFT` and the task still runs the old, hand-edited prompt. Copy each pointer block (not its
  fence) below the task's YAML frontmatter, rerun `pnpm qa:prompt-parity`, and run one walk from the
  pointer. `show-day-walk` has no installed task yet: create it in the scheduler with the cadence
  above, then install its pointer the same way.
- `claude-role-ux-walk` was retired on 2026-09-01 and replaced by `role-intent-walk`. Its
  deregistered `SKILL.md` may still be on disk at `~/.claude/scheduled-tasks/claude-role-ux-walk/`;
  it does not run. Delete it when convenient.

---

## `secretary-task-walk`

Weekly, Wednesday. Setup, entries, permissions, reports, money.

```
Working directory: /Users/richardbeezley/AI Projects/myk9-platform

This task's prompt lives in the repo, so every change to it is reviewed (MYK9-733). This file is only a pointer to it.

1. Run `git fetch origin main`.
2. Read the prompt as it is on `origin/main`, never from a working tree, which may be on a stale branch: `git show origin/main:docs/qa/walks/secretary-task-walk.md`. Put the output of `git rev-parse origin/main` at the top of your report as the prompt's version.
3. Follow that file as your complete instructions. This pointer adds nothing to it and overrides nothing in it.
4. If either command fails, or the file is missing or empty, stop and write a short report saying so. Never walk from memory or from an older copy of the prompt.
```

---

## `exhibitor-task-walk`

Weekly, Sunday. Dogs, discovery, entry, money, status, show day, results.

```
Working directory: /Users/richardbeezley/AI Projects/myk9-platform

This task's prompt lives in the repo, so every change to it is reviewed (MYK9-733). This file is only a pointer to it.

1. Run `git fetch origin main`.
2. Read the prompt as it is on `origin/main`, never from a working tree, which may be on a stale branch: `git show origin/main:docs/qa/walks/exhibitor-task-walk.md`. Put the output of `git rev-parse origin/main` at the top of your report as the prompt's version.
3. Follow that file as your complete instructions. This pointer adds nothing to it and overrides nothing in it.
4. If either command fails, or the file is missing or empty, stop and write a short report saying so. Never walk from memory or from an older copy of the prompt.
```

---

## `role-intent-walk`

Weekly, Friday. Rotates judge / club-admin / site-admin by ISO week mod 3.

```
Working directory: /Users/richardbeezley/AI Projects/myk9-platform

This task's prompt lives in the repo, so every change to it is reviewed (MYK9-733). This file is only a pointer to it.

1. Run `git fetch origin main`.
2. Read the prompt as it is on `origin/main`, never from a working tree, which may be on a stale branch: `git show origin/main:docs/qa/walks/role-intent-walk.md`. Put the output of `git rev-parse origin/main` at the top of your report as the prompt's version.
3. Follow that file as your complete instructions. This pointer adds nothing to it and overrides nothing in it.
4. If either command fails, or the file is missing or empty, stop and write a short report saying so. Never walk from memory or from an older copy of the prompt.
```

---

---

## `show-day-walk`

Weekly, Monday (new, MYK9-732; install it before its first run). One entry through secretary check-in, judge scoring at ringside with an offline cycle, and the exhibitor's read, on the show-day fixture.

```
Working directory: /Users/richardbeezley/AI Projects/myk9-platform

This task's prompt lives in the repo, so every change to it is reviewed (MYK9-733). This file is only a pointer to it.

1. Run `git fetch origin main`.
2. Read the prompt as it is on `origin/main`, never from a working tree, which may be on a stale branch: `git show origin/main:docs/qa/walks/show-day-walk.md`. Put the output of `git rev-parse origin/main` at the top of your report as the prompt's version.
3. Follow that file as your complete instructions. This pointer adds nothing to it and overrides nothing in it.
4. If either command fails, or the file is missing or empty, stop and write a short report saying so. Never walk from memory or from an older copy of the prompt.
```
