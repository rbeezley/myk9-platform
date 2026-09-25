# `show-day-walk` — Show-day walk

> Scheduled-task prompt, read by the task at run time from `origin/main` (MYK9-733). The installed `~/.claude/scheduled-tasks/show-day-walk/SKILL.md` is only a pointer to this file; edit here, through review. How the two relate, and how a run's corrections come back into this file: [README](README.md).

# Part 1 — The job, the boundary and the output (stable)

Run ONE entry through the show-day chain across three roles, in a real browser, and write an audit report (MYK9-732). **Secretary** checks the entry in, **judge** scores it at ringside with one offline cycle, **exhibitor** reads it. Every fact one role sets must read the same to the next role. The per-role walks (`secretary-task-walk`, `exhibitor-task-walk`, `role-intent-walk`) never cross those hand-offs, and the hand-offs are where the recent P1s were: the secretary assigned a judge and every exhibitor row said `Judge TBD` (MYK9-494); Ringside read `0 / 0` while Show Desk had the entries (MYK9-637); a move-up silently dropped check-in (MYK9-639).

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Preconditions — check before walking

- **SQL access.** Every assertion below is checked against the database through the Supabase MCP server. Run `select 1` first. If the server is missing or needs authentication, say so at the top of the report and stop: this walk's whole claim is "the database holds exactly what each role saw", and without SQL it cannot make it.
- **Record two SHAs:** the `origin/main` commit the worktree is cut from, and the prior show-day walk's baseline SHA (the newest `docs/audits/*-show-day-walk-*.md`). List, in the report, the commits since then touching `/at-show`, ringside scoring, check-in, the replication packages or entries' result columns (`git log --oneline <prior>..<current> -- apps/myk9show/src packages supabase/migrations`), and walk those first.
- **Surface.** Say whether you walked the deployed staging bundle (and the commit it was built from, named by the latest Deploy myK9Show run summary) or a local dev server on `origin/main`. Both share the staging database.
- **A show must be running today.** The walk runs on the show-day fixture `Heartland Scent Work Week` (`dededede-0000-0000-0000-000000000014`, seeded by `supabase/seed-demo.sql` section 19, MYK9-731). Find today's class:

  ```sql
  select t.id as trial_id, t.date, c.id as class_id, c.name, c.start_time, c.status,
         (select count(*) from entries e where e.class_id = c.id) as entries
  from trials t
  join classes c on c.trial_id = t.id and c.deleted_at is null
  where t.show_id = 'dededede-0000-0000-0000-000000000014'
    and t.date = (now() at time zone t.timezone)::date;
  ```

  One row is the fixture working. Zero rows means nobody has reseeded for seven days and the window has lapsed. Then stop, write a short report saying the walk is **blocked: show-day fixture stale**, name the fixture's last trial date, and do not walk anything else. Never create or re-date a show to work around it.

- **Pick the walk's dog.** The walk enters `exhibitor@`'s seeded dog **Ranger** (`dededede-0000-0000-0000-000000000042`) in today's class. Assert first that Ranger has no entry in that class (`select count(*) from entries where dog_id = '…042' and class_id = '<today's class>'` is 0). If one exists, an earlier run left residue: report it, do not reuse or delete it, and stop.

## Isolation

Work in your OWN git worktree cut from `origin/main`, with a unique vite port. Do not run in the primary checkout. Own one Playwright session per role context and close each before finishing (CLAUDE.md § Browser automation session ownership).

## Credentials — read this before signing in

Three accounts, each in its own browser context, never sharing storage:

| Role      | Account               | Env vars                                                   |
| --------- | --------------------- | ---------------------------------------------------------- |
| secretary | `secretary@myk9t.com` | `E2E_SECRETARY_EMAIL` / `E2E_SECRETARY_PASSWORD`           |
| judge     | `judge@myk9t.com`     | `E2E_JUDGE_EMAIL` / `E2E_JUDGE_PASSWORD`                   |
| exhibitor | `exhibitor@myk9t.com` | `E2E_DEMO_EXHIBITOR_EMAIL` / `E2E_DEMO_EXHIBITOR_PASSWORD` |

The exhibitor's variables do NOT follow the `E2E_<ROLE>_*` pattern; guessing `E2E_EXHIBITOR_*` gives an empty password. The judge account is judge-ONLY (MYK9-141): if it renders as `Secretary +2`, that is a finding. Never substitute the site admin for any role; it satisfies every gate through the wrong branch. Passwords live in `apps/myk9show/.env.local`. Never print, log or write a credential into a report or screenshot. `Invalid login credentials` is auth drift, not an app bug: report it and stop.

## Safe mutation boundary

This runs against SHARED STAGING. The walk makes exactly these writes, and no others:

1. **One mail-in entry**, by the secretary, for Ranger in today's class, with no payment taken (a waived or unpaid mail-in). Record its id the moment it exists: `WALK ENTRY <entry id>` in the report file.
2. **Checking that entry in**, by the secretary.
3. **Scoring that entry**, by the judge: one online score, then one offline edit.
4. **Teardown** of that entry (below).

It never touches the seeded Willow or Cooper entries, never completes or releases the class (that would place the seeded entries too), never sends a message or announcement, never takes a payment, and never writes SQL: every write goes through the UI, and the MCP connection is for reading.

- **Anchor every destructive click to the row that owns it** — the row holding Ranger's armband and name, never `.last()` or an index into a list whose length you did not assert. Scope every confirm click to `[role="dialog"]`, assert the dialog appeared before looking inside it, and assert the count you expect afterwards (LESSONS `confirm-click-destructive`).
- **Teardown runs on ANY exit**, including a run that stops half way. Remove the walk's entry through the secretary's own controls: delete it if the UI offers delete for an unpaid mail-in entry, otherwise pull it. If the UI refuses both for a scored entry, that refusal is a finding to judge on its merits, and the entry is declared residue with its id. It sits on a seeded dog, so the next reseed's dog delete removes it, and with no payment on it the reseed's money guard lets it go. Assert afterwards, in SQL, that no other entry in today's class changed (`check_in_status`, `is_scored`, `run_order` of Willow and Cooper equal their values at the start).

## What to walk

Record the SQL row for the walk's entry after every step: `check_in_status, is_scored, result_status, search_time_seconds, total_faults, run_order, armband, version, updated_at`.

1. **Secretary: add and check in.** From the secretary's show page for `Heartland Scent Work Week`, add a day-of mail-in entry for Ranger in today's class. A secretary takes day-of entries on a real show day, so if the UI refuses because entries are closed, that is a finding (see MYK9-642 for the day-of entry flag), and the walk stops there with the refusal recorded. Then check the entry in from the check-in surface (Known mechanics has the route). Assert in SQL: exactly one new entry, handler `exhibitor@`, `check_in_status = 'checked-in'`, an armband and a run order.
2. **Judge: score online.** Sign in as the judge, open today's class from the judge dashboard into `/at-show`, and score Ranger: qualified, a search time you choose, zero faults. Assert in SQL that the row holds exactly those values once.
3. **Judge: one offline cycle.** With the scoring screen still open, go offline (`context.setOffline(true)`). Edit Ranger's score (a different search time) and save. The UI must say the change is saved locally or pending, never that it failed or that it reached the server. Assert in SQL that the row still holds the ONLINE value, which proves the edit did not bypass the queue. Reconnect (`setOffline(false)`) and wait for the pending-sync indicator to clear. Assert in SQL: the row holds the OFFLINE value, `version` rose by exactly one per accepted write, there is still exactly one Ranger entry in the class, and no other entry changed. Record every scoring request the browser made during the cycle with its HTTP status: more than one conflict response, or any request still retrying after the indicator cleared, is the OCC conflict storm (MYK9-740, memory "Ringside OCC Conflict Storm") and a P1.
4. **Exhibitor: read the same entry.** Sign in as `exhibitor@` in a fresh context (cold replica) and find Ranger's entry on every surface that states a fact about it: My Entries, the dog's own page, the show's schedule or trial timeline, and the show-day view.
5. **Teardown**, per the boundary above.

## The cross-role fact table

This table is the walk's main output. One row per fact, one column per source, every cell filled or marked "not shown":

| Fact | SQL | Secretary saw | Judge saw | Exhibitor saw (each surface) | Agree? |
| ---- | --- | ------------- | --------- | ---------------------------- | ------ |

Facts, at minimum: judge name, class start time, check-in state, armband, running-order position, result (qualified or not), search time, faults. A fact stated one way by one role and another way by another is a finding, and the report says which one is right and how you know. "Not shown" to a role that needs the fact is also a finding (the exhibitor needs all of them; the judge needs armband, order and check-in).

## Judgment rules

- Read `docs/INTENT.md` first. The judge's target feeling is calm under pressure ("the tool disappears"), the exhibitor's is "I trust this with my day", and the secretary's show-day row is "I can handle this". A screen that is technically correct but leaves the judge unsure whether a score saved, offline or online, IS a finding.
- An empty result is not evidence of emptiness: a disabled, paused-offline or placeholder query renders as "nothing". Cross-check every "no entries" or "no result" against SQL before believing it.
- The project is pre-launch and consolidating. A duplicated surface is itself a finding; prefer "link the two" over "add a page".
- Code that looks wrong but carries an `// INTENT:` comment is deliberate.

## Output

- Write to `docs/audits/YYYY-MM-DD-show-day-walk-claude.md`. Number findings in an S-series, continuing from the prior show-day walk's highest (S1 on the first run).
- Top of the report: the run token (`<YYYY-MM-DD HHMM>`), the two SHAs, the surface, today's class id, `WALK ENTRY <id>`, and the teardown outcome.
- The cross-role fact table, then the SQL row after each step, then the offline cycle's request log (method, endpoint, status, time).
- **Canary candidates section.** For every new P0/P1 and every cross-role fact that held, one line: the exact user-visible assertion that would catch its recurrence against staging. These feed the staging canary suite (MYK9-730). Assertions only, no code.
- **Prompt corrections section.** List every statement in this walk's file, `docs/qa/walks/show-day-walk.md`, that the run found stale, with the evidence. A correction that falls below the file's `# Part 2 — Known mechanics` line you apply yourself, in the same commit as the report (see Hard constraint). A correction to anything ABOVE that line is listed here only, and a human makes it through a reviewed PR. Never weaken a safety rule from Part 2: if a mechanic conflicts with the boundary, the boundary wins and the conflict goes in this section.
- Use the `quality-finding-lifecycle` skill for finding identity, evidence, P0–P3 severity, dedup and recurrence. Mark each finding new / unchanged / regressed / resolved against prior runs.
- **File findings to Linear directly — there is no approval step.** Every confirmed P0/P1 gets its own issue (team **MyK9-platform**), labelled `Claude` plus `Bug` (or `Improvement`), with severity in Linear's **priority field**: P0/P1 → Urgent, P2 → High, P3 → Low. The labels `p0`/`p1`/`source:claude`/`walk:*` do NOT exist in this workspace; do not create them. Put `walk:show-day <YYYY-MM-DD> S<n>` as the description's first line. Group P2/P3 as sub-issues of ONE parent titled `Show-day walk <YYYY-MM-DD> — P2/P3 findings`.
- **Dedupe before filing, always with `includeArchived: true`.** Match on role, route, object and symptom, never on title. If an issue exists, comment on it instead.
- **Do NOT file coverage gaps, harness bugs, or corrections to your own measurement as issues.** They belong in the report body.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say it is unfiled.
- **Commit the report and push it to `main`.** Docs-only, inside the direct-to-`main` carve-out in CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file and, if you applied a Part 2 correction, this walk's own file — and that `git diff` of the walk file changes nothing above its `# Part 2` line. Without this the report is lost when the worktree is removed.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no `supabase db push`, no function deploys, no SQL writes. If you find something trivial to fix, still do not fix it — record it and let a human decide. The only repo writes permitted are committing and pushing your own report file and, in that same commit, Part 2 corrections to this walk's own file, per the Output section above. (The four staging writes in the Safe mutation boundary are unchanged by this, and go through the UI only.)

# Part 2 — Known mechanics (expected to churn)

Everything below this line is measured fact about the app, the fixtures and the open issues, and goes stale. A run may correct it in the same commit as its report (Output, "Prompt corrections"). Nothing below may relax Part 1.

## Known mechanics

Written before the first run, from the code and the other walks' reports. **Verify each** and correct it here.

- **The fixture.** `Heartland Scent Work Week` has one trial per day for seven days from the reseed day, each with one class, `Container Novice A` at 9:00 AM, holding Willow (`exhibitor@`, run 1, armband 200) and Cooper (`secretary@`'s dog, run 2, armband 201), judge fixture assigned at class level, self-check-in on, and two normal-priority announcements. Dates are in the trial's timezone, America/Chicago; the SQL above compares against that, not UTC.
- **Do not walk on the exhibitor walk's day.** The exhibitor walk self-checks-in today's Willow entry; a same-day run of this walk sees that change in the class. The schedule keeps them on different days.
- **Routes.** Show Desk: `/shows/:id/show-day`, which accepts `?focus=<classId>`; Run order and Move up appear only on a focused class. Entry Management: `/shows/:id/entries`. Check-in: Show Desk → Tools → **People at show** → exhibitor row → `Check in`, plus a `Check-in status for <dog>` button on the class page; its undo lives in Ringside. Judge: `/judge/dashboard` → class → `/at-show`.
- **The judge reaches this class only because its assignment is class-level.** A trial- or show-level `judge_assignments` row never reaches the dashboard (seed section 11). If the class is missing from the judge dashboard, check that before calling it a defect.
- **Ringside scoring writes through the `ringside_update_entry` RPC**, under optimistic concurrency on `entries.version`. A stale client retrying a version conflict is the storm MYK9-740 addressed; count conflict responses rather than inferring from CPU.
- **Offline.** `context.setOffline(true)` is the only offline switch that the service worker and the replication layer both see. DevTools throttling is not. After reconnecting, give the queue up to 30 seconds and poll SQL, rather than reading the UI once.
- **A fresh browser context is the only cold replica.** Capture `storageState()` after sign-in and open a new context for the exhibitor's read; re-navigating one context leaves `myK9_Replication` warm.
- **Result visibility.** The fixture's show uses the `open` preset: qualification, time and faults are visible to the exhibitor as soon as they are scored; placement only once the class is completed, which this walk never does. "Result not shown" for time or qualification is therefore a finding, and "placement not shown" is correct.
- **`view_authenticated_entry_results` returns 0 rows over the MCP connection** (it is `auth.uid()`-scoped). Read it from the browser as the signed-in exhibitor if you need it; an empty MCP read is not evidence.

## Open issues to re-verify

- **MYK9-494** (judge vanished from exhibitor schedule rows), **MYK9-637** (Ringside `0 / 0`), **MYK9-639** / **MYK9-640** (move-up dropped check-in, phantom entry), **MYK9-740** (replayed score treated as a conflict). Read each with `get_issue` first; for a Done issue confirm it holds in this chain, for an open one add fresh evidence only if the symptom changed.
- **MYK9-144** is the scripted offline scoring replay (`pnpm test:e2e:audit:judge`, see `role-intent-walk`), which intercepts every staging write. This walk is the unintercepted counterpart; the two do not substitute for each other.
