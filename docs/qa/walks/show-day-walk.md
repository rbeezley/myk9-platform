# `show-day-walk` — Show-day walk

> Scheduled-task prompt, read by the task at run time from `origin/main` (MYK9-733). The installed `~/.claude/scheduled-tasks/show-day-walk/SKILL.md` is only a pointer to this file; edit here, through review. How the two relate, and how a run's corrections come back into this file: [README](README.md).

# Part 1 — The job, the boundary and the output (stable)

Run ONE entry through the show-day chain across three roles, in a real browser, and write an audit report (MYK9-732). **Secretary** checks the entry in, **judge** scores it at ringside with one offline cycle, **exhibitor** reads it. Every fact one role sets must read the same to the next role. The per-role walks (`secretary-task-walk`, `exhibitor-task-walk`, `role-intent-walk`) never cross those hand-offs, and the hand-offs are where the recent P1s were: the secretary assigned a judge and every exhibitor row said `Judge TBD` (MYK9-494); Ringside read `0 / 0` while Show Desk had the entries (MYK9-637); a move-up silently dropped check-in (MYK9-639).

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Preconditions — check before walking

- **SQL access.** Every assertion below is checked against the database through the Supabase MCP server. Run `select 1` first. If the server is missing or needs authentication, say so at the top of the report and stop: this walk's whole claim is "the database holds exactly what each role saw", and without SQL it cannot make it.
- **Record two SHAs:** the `origin/main` commit the worktree is cut from, and the prior show-day walk's baseline SHA (the newest `docs/audits/*-show-day-walk-*.md`). List, in the report, the commits since then touching `/at-show`, ringside scoring, check-in, the replication packages or entries' result columns (`git log --oneline <prior>..<current> -- apps/myk9show/src packages supabase/migrations`), and walk those first.
- **Surface.** Say whether you walked the deployed staging bundle (and the commit it was built from, named by the latest Deploy myK9Show run summary) or a local dev server on `origin/main`. Both share the staging database.
- **A show must be running today: restore it first.** The walk runs on the show-day fixture `Heartland Scent Work Week`, created by `public.seed_demo_restore_show_day_fixture()` (seed section 19, MYK9-731). There is no fixed id: each fixture is a new show with an id starting `dededede-0000-0000-0731-`, covering seven days from the day it was made, and older ones with the same name stay behind in the past. A weekly walk always lands on its fixture's last day, so the walk restores the fixture itself before every run. Call the restore through `psql`, because the MCP connection is read-only and the function is granted only to `postgres` and `service_role`:

  ```bash
  # From the walk's worktree (bootstrap copies supabase/.env); otherwise read
  # supabase/.env from the primary checkout. Never print the password.
  PGPASSWORD="$(grep '^SUPABASE_DB_PASSWORD=' supabase/.env | cut -d= -f2-)" \
    psql "postgresql://postgres.sojmvhhwsjxmfistvzbe@aws-1-us-east-2.pooler.supabase.com:5432/postgres" \
    -X -At -v ON_ERROR_STOP=1 -c "select public.seed_demo_restore_show_day_fixture();"
  ```

  It is insert-only and idempotent: when a fixture already covers today it returns that show with `"created": false` and writes nothing; otherwise it inserts a brand-new fixture show and returns `"created": true`. It never updates or deletes a row. Record the returned JSON at the top of the report. If the call errors or refuses (for example `P0002`, the Heartland demo club is missing; the refusals are listed in [`docs/operations/staging-reseed.md`](../../operations/staging-reseed.md#show-day-fixture-restore-between-reseeds)), or `supabase/.env` is missing, stop and write a short report saying the walk is **blocked: show-day fixture restore failed**, with the error. Call it once per run; never retry it in a loop, and never create, re-date or edit a show by any other means.

  Then find today's class through MCP, using the `show_id` the restore returned:

  ```sql
  select s.id as show_id, t.id as trial_id, t.date, c.id as class_id, c.name, c.start_time, c.status,
         (select count(*) from entries e where e.class_id = c.id and e.deleted_at is null) as entries
  from shows s
  join trials t on t.show_id = s.id and t.deleted_at is null
  join classes c on c.trial_id = t.id and c.deleted_at is null
  where s.id = '<show_id from the restore>'
    and t.date = (now() at time zone t.timezone)::date;
  ```

  One row is the fixture working. Use that `show_id` for every page and query below; never pick a `Heartland Scent Work Week` by name, because older fixtures share it. Zero rows after a successful restore is a defect in the restore itself: stop, write a short report saying the walk is **blocked: restored fixture has no class today**, with the returned JSON, and do not walk anything else.

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

0. **The fixture restore** (Preconditions): one `psql` call to `public.seed_demo_restore_show_day_fixture()`, which writes only when no fixture covers today, and then only inserts a new fixture show.
1. **One mail-in entry**, by the secretary, for Ranger in today's class, with no payment taken (a waived or unpaid mail-in). Record its id the moment it exists: `WALK ENTRY <entry id>` in the report file.
2. **Checking that entry in**, by the secretary.
3. **Scoring that entry**, by the judge: one online score, then one offline edit.
4. **Teardown** of that entry (below).

It never touches the seeded Willow or Cooper entries, never completes or releases the class (that would place the seeded entries too), never sends a message or announcement, never takes a payment, and writes no SQL beyond the one restore call: every other write goes through the UI, and the MCP connection is for reading.

- **Anchor every destructive click to the row that owns it** — the row holding Ranger's armband and name, never `.last()` or an index into a list whose length you did not assert. Scope every confirm click to `[role="dialog"]`, assert the dialog appeared before looking inside it, and assert the count you expect afterwards (LESSONS `confirm-click-destructive`).
- **Teardown runs on ANY exit**, including a run that stops half way. Remove the walk's entry through the secretary's own controls: delete it if the UI offers delete for an unpaid mail-in entry, otherwise pull it. The UI refuses delete for a scored entry, so after a full walk the expected path is Pull. If the UI refuses both for a scored entry, that refusal is a finding to judge on its merits, and the entry is declared residue with its id. It sits on a seeded dog, so the next reseed's dog delete removes it, and with no payment on it the reseed's money guard lets it go. Assert afterwards, in SQL, that no other entry in today's class changed (`check_in_status`, `is_scored`, `run_order` of Willow and Cooper equal their values at the start).

## What to walk

Record the SQL row for the walk's entry after every step: `check_in_status, is_scored, result_status, search_time_seconds, total_faults, run_order, armband, version, updated_at`.

1. **Secretary: add and check in.** From the secretary's show page for today's fixture (the `show_id` the precondition returned), add a day-of mail-in entry for Ranger in today's class. A secretary takes day-of entries on a real show day, so if the UI refuses because entries are closed, that is a finding (see MYK9-642 for the day-of entry flag), and the walk stops there with the refusal recorded. Then check the entry in from the check-in surface (Known mechanics has the route). Assert in SQL: exactly one new entry, handler `exhibitor@`, `check_in_status = 'checked-in'`, an armband and a run order.
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

**Audit only, with one exception.** No source edits, no PRs, no merges, no `supabase db push`, no function deploys, no SQL writes other than the one fixture restore call in Preconditions. If you find something trivial to fix, still do not fix it — record it and let a human decide. The only repo writes permitted are committing and pushing your own report file and, in that same commit, Part 2 corrections to this walk's own file, per the Output section above. (The staging writes in the Safe mutation boundary are unchanged by this: the restore through `psql`, the other four through the UI only.)

# Part 2 — Known mechanics (expected to churn)

Everything below this line is measured fact about the app, the fixtures and the open issues, and goes stale. A run may correct it in the same commit as its report (Output, "Prompt corrections"). Nothing below may relax Part 1.

## Known mechanics

Written before the first run, from the code and the other walks' reports. **Verify each** and correct it here.

- **The fixture.** `Heartland Scent Work Week` has one trial per day for seven days from the day it was created, each with one class, `Container Novice A` at 9:00 AM, holding Willow (`exhibitor@`, run 1, armband 200) and Cooper (`secretary@`'s dog, run 2, armband 201), judge fixture assigned at class level, self-check-in on, and two normal-priority announcements. Dates are in the trial's timezone, America/Chicago; the SQL above compares against that, not UTC. Several fixtures can cover today at once: on 2026-10-23 three emptied ones (0 entries, still `published`, each with its own class-level judge assignments) sat beside the live one, so the judge dashboard's Today tab showed four `Container Novice A · 09:00 AM` cards, three reading `0/0 entries`. The restore returns the live one; only its `show_id` identifies today's class.
- **Do not walk on the exhibitor walk's day.** The exhibitor walk self-checks-in today's Willow entry; a same-day run of this walk sees that change in the class. The schedule keeps them on different days.
- **Routes.** Show Desk: `/shows/:id/show-day` now redirects to the show home, `/shows/:id?focus=<classId>&anchor=<classId>` (2026-10-12); Run order and Move up appear only on a focused class. The Tools button is gone (MYK9-1262, 2026-10-20): show tools are rows in the header **Actions** menu, each opening in its own panel keyed by `?tool=`; **People at show** is `?tool=people-at-show`, and the Overview's Needs attention link `Check in N entries` opens it with `&view=needs-check-in` (2026-10-23). Entry Management: `/shows/:id/entries`. Check-in: Show Desk → Needs attention `Check in N entries` (or Actions → People at show) → exhibitor row (`Mary Smith · Also entered as Casey Morgan`) → `Check in` on the dog's row for today's trial (`Container Novice A · Trial 2 - 09:00:00`; rows for other days read `Not today`); the status line then reads `Checked in 1 entry for Mary Smith.` and the row `Checked-in`. A `Check-in status for <dog>` button also sits on the class page; its undo lives in Ringside. Judge: `/judge/dashboard` → Start Judging → `/at-show/<show>/class/<class>`. With several fixtures covering today the dashboard's Today cards are indistinguishable (MYK9-1342); on 2026-10-23 the first card (`0/3 entries`) was the live class, but check the URL's class id against SQL, or navigate to the at-show URL directly. On the entry list the `Score <dog>` button is screen-reader-only (a click on it is intercepted); open the scoresheet by clicking the dog's card.
- **The judge reaches this class only because its assignment is class-level.** A trial- or show-level `judge_assignments` row never reaches the dashboard (seed section 11). If the class is missing from the judge dashboard, check that before calling it a defect.
- **Ringside scoring writes through the `ringside_update_entry` RPC**, under optimistic concurrency on `entries.version`. A stale client retrying a version conflict is the storm MYK9-740 addressed; count conflict responses rather than inferring from CPU.
- **A normal score submission can make two `ringside_update_entry` calls**: one for the score and one for the subsequent check-in transition to `completed`. Judge entry into the score screen can also transition the row to `in-ring`. Identify each write by its resulting fields and count HTTP conflicts before judging version increments or duplicate scores. (2026-10-19: an online score needs Save, then the `Score Confirmation` panel's `Confirm & Submit`; the row is only written after Confirm, so poll SQL after that click, not after Save. 2026-10-23: the offline `Correct this score` edit takes the same two steps, Save then `Confirm & Submit`; the row stayed at the online value and version through both until reconnect. Opening the scoresheet wrote `in-ring` (+1 version), online Confirm wrote score and `completed` (+2), the reconnect flush wrote +2 again: versions 4, 6, 8.)
- **Adding the entry.** Entry Management (`/shows/:id/entries`) → Add Entry (straight to the secretary flow since MYK9-1242; `Add late entry` is under More) → pick the dog (Ranger's owner is exhibitor@; on the 2026-10-19 walk the exhibitor row read `Mary Smith · also entered as Casey Morgan` and the judge scoresheet read `Handler: Mary Smith`), the class, then Payment: choose `Check (pay at show)` and tick the AKC agreement box (no payment taken); the submit button reads `Submit — bring check to show`; confirmation `MK9-…` on step 5. The class step lists every trial of the 7-day fixture, past days included: pick the one dated today. A day-of entry for today's trial is allowed. The entry gets an armband (202) and a `run_order` at creation (3, after Willow and Cooper; 2026-10-12, MYK9-1048). A dog that already has an enrollment on the show (Ranger, from earlier runs' residue) gets the new entry added to it, so the receipt repeats that enrollment's confirmation number; on a brand-new fixture the receipt carries a new number (`MK9-000311` on 2026-10-23). The dog search (`Ranger`) returns one row; the Handlers step shows `Mary Smith · Owner` and needs no change; the receipt step reads `Entry submitted.`, `Confirmation # MK9-…`, `Total · Fees due $35.00`, and the entry lands with `is_day_of_show = true`, `payment_method = check`, `payment_status = pending`, version 2. Check in only on the entry's own row; `Check in all eligible` would also check in Willow.
- **Scored entries cannot be deleted from the UI.** Remove entry on a scored entry shows a dialog with Delete disabled; its `Withdraw / Pull entries` link lands on that entry form with the All view (MYK9-1024, fixed by 2026-10-12). Teardown is Pull from the per-class status chip (Accepted → Pull, applied at once with no confirm dialog) after searching the entry. The entry form's per-entry rows name the trial and date (`Wed, Oct 14 · Trial 1 · Container Novice A`, MYK9-1107 fixed by 2026-10-14), so anchor on that label; confirm in SQL which entry is which when earlier residue sits on the same form. The Remove dialog says "This entry is scored. Use Withdraw or Pull instead of deleting it." with `Delete entry` disabled (2026-10-14). Pull sets `entry_status = scratched`, `check_in_status = pulled`, `withdrawn_at = now()`, keeps `is_scored`, and the row stays live (`deleted_at` null), so declare it residue. The chip's menu (2026-10-23) offers `Accepted (current)`, `Mark pending`, `Pull`, `Reject`, `Withdrawn`, `Request payment…`; after Pull the chip reads `Pulled · refund at the club's discretion`, the exhibitor's My Entries row reads `Pulled` / `pulled` with no result (MYK9-1258 fixed 2026-10-20), the exhibitor's `You owe` total drops by the unpaid fee, and the dog leaves the exhibitor's `Your dogs today` list.
- **Running the restore from a worktree-isolated Claude Code session.** The harness refuses the inline `PGPASSWORD="$(…)" psql …` command as too complex to verify (2026-10-14). Put the same lines in a scratchpad shell script and run `bash <script>` from the worktree root. The same guard refuses a heredoc that writes the script and any `cmd && cmd` chain that touches a path outside the worktree (2026-10-23): write the script with the Write tool, and keep each Bash call a single plain command. The worktree's `EnterWorktree` bootstrap hook did not run on 2026-10-23 (no `node_modules`, no `supabase/.env`); the restore script may read `supabase/.env` from the primary checkout, and `bash scripts/bootstrap-worktree.sh` run by hand (log to the scratchpad, since `.logs/` does not exist yet) fills the rest.
- **`public.seed_demo_show_day_fixture_today()` is not callable over MCP** (42501, 2026-10-06 and 2026-10-12). The walk no longer needs it: the restore call in Preconditions returns the `show_id`. If you need it elsewhere, inline its body from `pg_get_functiondef` as a CTE.
- **Secretary Remove Entry soft-deletes the entry** (unscored entries only). It sets `entries.deleted_at` and leaves the row in SQL. Count live Ranger entries with `deleted_at is null` after teardown; compare the secretary UI separately, because the 2026-09-28 run still showed the removed registration in search after reload.
- **Offline.** `context.setOffline(true)` is the only offline switch that the service worker and the replication layer both see. DevTools throttling is not. After reconnecting, give the queue up to 30 seconds and poll SQL, rather than reading the UI once. To make the offline edit, use `Correct this score` on the post-save panel: offline it opens the prefilled form at once (MYK9-1106 fixed; 2026-10-14). The offline confirmation reads `Saved on this device. It will send when you're back online.`; after reconnect it reads `Saved on this device · waiting to sync`, then `Score saved`. On 2026-10-14 the flip to `Score saved` came 10-45 s after both server writes returned 200, so poll SQL rather than the label. An online save shows `Saved on this device · waiting to sync` for a few seconds, then `Score saved` and a `Scores sent` toast. 2026-10-23 (playwright-cli): `run-code "async page => { await page.context().setOffline(true); return navigator.onLine; }"` throws `ReferenceError: navigator is not defined` AFTER setOffline has taken effect (the callback runs in Node); confirm with `run-code "async page => page.evaluate(() => navigator.onLine)"`. Offline, a `No internet connection · Changes will be saved locally and synced when connection is restored.` banner with `Retry` sits at the page foot, and the replication pulls (`classes`, `view_authenticated_entry_results_replication`) and `ringside_claim_generation_current` retry on a backoff (1 s, 2 s, 4 s, then about every 10 s), 22 `FAILED` requests over a 2.5-minute offline window; none is a scoring write. After `setOffline(false)` the label read `Score saved` within 8 s and SQL already held the offline value on the first poll.
- **A fresh browser context is the only cold replica.** Capture `storageState()` after sign-in and open a new context for the exhibitor's read; re-navigating one context leaves `myK9_Replication` warm.
- **Result visibility.** The fixture's show uses the `open` preset: qualification and time are visible to the exhibitor as soon as they are scored, labelled `preliminary` until release; faults show only when above zero (owner decision 2026-10-12, #2923), so a 0-fault run correctly shows no fault count on any exhibitor surface; placement only once the class is completed, which this walk never does. "Result not shown" for time or qualification is therefore a finding, and "placement not shown" is correct.
- **`view_authenticated_entry_results` returns 0 rows over the MCP connection** (it is `auth.uid()`-scoped). Read it from the browser as the signed-in exhibitor if you need it; an empty MCP read is not evidence.

## Open issues to re-verify

- **MYK9-494** (judge vanished from exhibitor schedule rows), **MYK9-637** (Ringside `0 / 0`), **MYK9-639** / **MYK9-640** (move-up dropped check-in, phantom entry), **MYK9-740** (replayed score treated as a conflict). Read each with `get_issue` first; for a Done issue confirm it holds in this chain, for an open one add fresh evidence only if the symptom changed.
- **MYK9-144** is the scripted offline scoring replay (`pnpm test:e2e:audit:judge`, see `role-intent-walk`), which intercepts every staging write. This walk is the unintercepted counterpart; the two do not substitute for each other.
