# `exhibitor-task-walk` — Exhibitor task walk

> Scheduled-task prompt, read by the task at run time from `origin/main` (MYK9-733). The installed `~/.claude/scheduled-tasks/exhibitor-task-walk/SKILL.md` is only a pointer to this file; edit here, through review. How the two relate, and how a run's corrections come back into this file: [README](README.md).

# Part 1 — The job, the boundary and the output (stable)

Run a FUNCTIONAL walk of the exhibitor's real task surface in a real browser, and write an audit report. **Assume nothing else walks the exhibitor weekly.** Codex has a `weekly-exhibitor-ux-walk`; read its `status` and `rrule` with `grep -E '^(status|rrule)' ~/.codex/automations/weekly-exhibitor-ux-walk/automation.toml` and report only those two values, but it does not submit entries, pay, or tear anything down (its own ledger records an incidental hosted cart write on `exhibitor@`), so it never substitutes for any part of this walk. `claude-role-ux-walk` was retired on 2026-09-01 and its replacement, `role-intent-walk`, rotates only through judge / club-admin / site-admin. So this walk carries both questions: the functional one — **does the exhibitor's job actually work end to end?** — and the INTENT lens in Judgment rules below.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Preconditions — check before walking

- **SQL access.** The count assertions, precondition query and cross-checks below read the database through the Supabase MCP server. Run one trivial read (`select 1`) first. If the server is missing or needs authentication, say so at the top of the report and stop: without SQL the payment and residue accounting cannot be proven. Note that `view_authenticated_entry_results` is `auth.uid()`-scoped and returns **0 rows** over the privileged MCP connection. Read it from inside the browser as the signed-in exhibitor (anon key as `apikey`, session JWT as bearer). An empty MCP read of it is not evidence.
- **Record two SHAs:** the `origin/main` commit the worktree is cut from, and the prior walk's baseline SHA (read it from the newest `docs/audits/*-exhibitor-task-walk-*.md`). Run `git log --oneline <prior>..<current> -- apps/myk9show/src packages supabase/migrations` and list, in the report, the commits touching exhibitor surfaces, entries, payments, views or columns they read. **Walk those areas first and hardest.** E39 (judge vanished from every schedule row) was a migration in exactly this diff dropping a column a surface still read.
- **Surface.** State in the report which surface you walked: the deployed staging bundle (`myk9-platform-myk9show.vercel.app`, which trails `main` until someone runs Deploy myK9Show) or a local dev server on `origin/main`. Both share the staging database. If you walk the deployed bundle, record the commit it was built from (the latest Deploy myK9Show run summary names it). A migration applied to the database ahead of the frontend that reads it is a real finding class, and only this record distinguishes it.

## Isolation

Work in your OWN git worktree cut from `origin/main`, and use a unique vite port. A shared checkout gets corrupted by concurrent agents. Do not run in the primary checkout.

## Credentials — read this before signing in

**The exhibitor's env vars do NOT follow the pattern the other roles use.** They are `E2E_DEMO_EXHIBITOR_EMAIL` / `E2E_DEMO_EXHIBITOR_PASSWORD`, not `E2E_EXHIBITOR_*`. Guessing the other name gives an empty password and the run dies at sign-in. Resolved in `apps/myk9show/src/test/e2e/helpers/testUsers.ts:107`.

Two accounts, and you want BOTH — the contrast between them is where the defects are:

| Account                | State                                                                                                                                      | Why it matters                                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exhibitor@myk9t.com`  | **5 seeded dogs, 19 seeded entries** (12 on `Heartland Scent Work Classic`, 7 on `Heartland Scent Work Week`; plus earlier walks' residue) | The established account: paid, pending, refunded, move-up, scored and full-class history on the Heartland show, and Willow's entry on the show running today. With the opt-in MYK9-109 load fixture applied it also carries ~250 load dogs and ~1,200 entries; a plain reseed removes them. |
| `exhibitor2@myk9t.com` | **0 dogs, 0 entries**                                                                                                                      | The genuine empty state — a brand-new exhibitor.                                                                                                                                                                                                                                            |

Both are confirmed and sign-in capable, and the seeded accounts share one password. If `exhibitor2` rejects it, that is auth drift, not an app bug — say so; the beginner persona's empty-state half (tasks 1–2 on `exhibitor2@`) is then a coverage gap; the beginner persona still runs its second half on `exhibitor@` as described in Personas.

Passwords live in `apps/myk9show/.env.local` (gitignored). Read them from the environment at runtime. Never print, log, or write a credential into a report or screenshot. Filter any people search to seeded accounts so no real-user PII enters the report.

## Safe mutation boundary

This runs against SHARED STAGING. Other agents and CI use the same data, and `exhibitor@` owns seeded dogs and entries that other suites depend on.

- **Payment: STOP at the Stripe Checkout boundary. Never type card details, never press Pay.** (Owner decision, 2026-09-26.) An unattended run does not complete a payment, even in Stripe test mode. The harness refuses the Pay click as a real-world transaction anyway, and the Oct 10 test show takes no online payments. Walk entry → cart → the Checkout page. Assert that the quoted total equals the amount Checkout shows (MYK9-265), and record the Checkout session id's prefix (`cs_test_` / `cs_live_`) as evidence. Then leave the page without paying and remove the cart lines this run added. The post-payment state (confirmation, paid badge, receipt) is recorded as **"not exercised by design: stop-at-checkout"**, never as a pass. A human covers it in their own end-to-end test until this decision is reversed here.
- **There are three ways into Stripe, and all three stop at the Checkout page:**
  1. the cart's Checkout button;
  2. **"Finish Payment"**, which fills the hosted cart with the seeded Classic pending entries (`cartStore.removeItem` deletes only the `entry_cart_items` row, never the entry, so removing those lines afterwards is safe and required);
  3. the waitlist offer's **"Complete payment"**, which skips the cart and opens Checkout directly.

  For each, read the Checkout URL and totals, then leave. Never open a Checkout session you don't need for a check.

- **Enter with a throwaway dog, never a seeded one.** Every dog this walk creates is named `ZZ Walk Dog <run token> #N`, N unique across the run regardless of account, so each row anchors to exactly one locator (assert the match count is 1 before any delete). Mint one run token at start, `<YYYY-MM-DD HHMM>`, print it at the top of the report and use it in every dog name, so a same-day re-run never matches an earlier run's rows. Record each account's dog, entry and cart counts before the walk. Because this walk never pays, it submits no entries, so nothing it creates should be undeletable. At the end soft-delete every dog this run created, matched by this run's full name, never by the `ZZ Walk` prefix. An earlier run's residue is reported, not deleted. If the delete UI refuses a dog that holds no entry, that is a finding (MYK9-799 was exactly this): record the dog's name and id with the line `WALK RESIDUE TOKEN <run token>` for an operator, and don't work around it. Then assert each account's dog count equals its recorded start count plus any dog named as residue. Count assertions are report-and-stop checks: a mismatch is a finding, never corrected by deleting a row this run didn't create. Teardown runs before finishing for ANY reason, including a run that stops after one persona pass.
- **Class selection writes the hosted cart, so the cart is residue too.** Record each account's cart contents before the walk; before finishing, remove every cart line this run added and assert the cart matches the recorded state. A line the UI will not remove is declared in the report, never left silently.
- **`exhibitor2@` stays the empty state.** Nothing this walk does on that account may survive it: and the run asserts 0 dogs / 0 entries / empty cart on it before finishing. A Checkout session opened while checking the boundary may leave a `stripe_orders` row and sandbox Stripe objects; that is accepted, but say so in the report.
- Create and edit demo records freely; **undo anything you create** before finishing. The one exception to "never touch a seeded row" is the single self-check-in in task 7 (Personas, experienced).
- Do NOT delete dogs, entries, or records you did not create. Do NOT withdraw, pull or refund anything. Exhibitors can now leave a class ("Leave class…" on My Shows, MYK9-631, backed by `withdraw_own_entry`, with owner withdraw and pull refused after a show ends, MYK9-778). Walk that UI read-only: check it is offered where it should be and refused where it should be, but never confirm it.
- **Anchor every destructive click to the row that owns it** — `locator('li', {hasText: target}).getByRole('button', …)`, never `.last()` or an index into a list whose length you did not assert.
- **The confirm click is a destructive click too, and it is the one that gets missed.** Scope it to the dialog (`page.locator('[role="dialog"]').getByRole(…)`), never page-wide. A page-wide match will happily hit _another row's_ control when no dialog opened. And **never assume a confirm dialog exists** — assert it appeared before looking inside it. Both fired for real on the secretary walk and destroyed a canonical CI account's appointment.
- **Before any destructive click, record the count you expect afterwards; after it, assert that count.** If two things disappear, stop and restore immediately rather than continuing.

## Precondition — is any show actually enterable?

Tasks 2 and 3 (find/enter a show, pay) need a show whose entry window is OPEN. **Check this first and say so in the report**, because when it fails the walk cannot cover the exhibitor's two most important tasks and must not present that as a pass.

```sql
select name, entry_open_date, entry_close_date
from shows where deleted_at is null
order by entry_close_date desc limit 10;
```

`entryCloseGuard.ts:61` compares CALENDAR dates (`currentDate > closeDate`), so a show closes at the END of its `entry_close_date` day.

**Is a show running today?** Tasks 5, 6 and 7 need it. Check, and put the answer in the report:

```sql
select t.date, t.id as trial_id, c.id as class_id, c.start_time, e.id as entry_id,
       e.run_order, e.armband, e.check_in_status
from trials t
join classes c on c.trial_id = t.id and c.deleted_at is null
join entries e on e.class_id = c.id
join people p on p.id = e.handler_id and lower(p.email) = 'exhibitor@myk9t.com'
where t.show_id = 'dededede-0000-0000-0000-000000000014'
  and t.date = (now() at time zone t.timezone)::date;
```

One row is the fixture working. Zero rows means the seven-day window has lapsed because nobody has reseeded for a week: record tasks 5 and 7 as **blocked: show-day fixture stale** (not "not exercised"), name the last trial date the fixture holds, and say a reseed is due. Do not create or re-date anything yourself.

**The show to enter is `Heartland UKC Nosework Trial`** (`dededede-0000-0000-0000-000000000011`), a lean-seed show: entry window `CURRENT_DATE - 16 .. + 76` relative to the last reseed, so it is always open, zero seeded entries, and its Checkout runs against the Heartland club's sandbox Stripe account. It is UKC, so the throwaway dog needs a UKC registration number before a class can be selected — add one in task 1. (Until MYK9-558 this walk entered a MYK9-109 load show, which a plain reseed now removes.) Because the walk stops at Checkout it leaves no paid entry here. If one ever appears, it blocks the next reseed on the seed's money guard, so record its id and the run token for an operator (`seed-reset` skill, "When the seed aborts").

**Seed dates are relative to the reseed day** (the demo seed documents its offsets in its header). The query above is the only source of truth for today's windows. Never trust a calendar date quoted in this file. Also confirm the club is Stripe-capable: `select count(*) from club_stripe_accounts csa join shows s on s.club_id = csa.club_id where s.id = '<show>'`.

Deliberately NOT the target, and useful as fixtures in their own right:

- `Heartland Scent Work Week` (`dededede-0000-0000-0000-000000000014`) — the show-day fixture (MYK9-731): one one-day trial per day from the reseed day to six days after, each with one class (`Container Novice A`, 9:00 AM) whose published running order is Willow (`exhibitor@`, run 1, armband 200) then Cooper (run 2), the judge fixture assigned, self-check-in on, and the only seeded announcements. This is the fixture for tasks 5, 6 and 7. Its entry window is closed on purpose (it is running): never enter it. Find today's entry with the show-day query below.
- `Heartland Scent Work Classic` (`...010`) — the scored demo show: released results on Container Novice A, preliminary results on Interior Advanced Preliminary, a full class, a waitlist, a move-up request and a refunded entry. This is the fixture for tasks 8 and 9 (results, statistics). Never enter it: its entries are seed fixtures that CI pins.
- `Heartland Scent Work Week` (entries closed because it is running) and `Prairie Trail Spring Scent Work Trial` (past) are the closed-show fixtures. The older `ZZ Audit - *` and `[E2E MYK9-336] Past Due` shows no longer exist on staging. **Walk what a CLOSED show offers an exhibitor every run.** A prior walk found the Enter CTA letting the user begin an impossible task (E24 / MYK9-336), and the 2026-09-13 walk skipped it with the fixture available. That omission is not repeated.

If nothing is open when you run: **do not fake it and do not create a show** (an exhibitor cannot, and this walk is audit-only). Walk everything else, then record the entry and payment tasks as a **coverage gap with the reason**, and open or update a Linear issue asking for the demo show window to be rolled forward. This has already degraded one audit — the 2026-07-06 exhibitor walk recorded "only two shows, both Entries Closed" and could not complete the entry flow either. The seed's dates roll with each reseed, so a closed-everywhere staging means either a lapsed reseed or a fixture bug; treat it as a finding about the fixtures rather than a quiet gap in the report.

## What to walk

`docs/roles/exhibitor.md` defines the job. Walk it as a job, not a route list. Its nine "must accomplish" items are the spine:

1. **Manage dog records** — add a dog, edit it, add a registration. Do this on `exhibitor2` (empty) as well as `exhibitor@` (established), because add-a-first-dog and add-to-an-existing-roster are different products.
2. **Find and enter shows** — discovery while signed out (no account needed to browse), then the registration wizard at `/shows/:showId/register`. Check what a CLOSED show offers: a prior walk found the Enter CTA let the user begin an impossible task.
3. **Pay entry fees**: up to the Checkout boundary only (see the boundary above). Assert that the quoted total equals the amount Checkout shows: a quote lower than the charge is the exact defect MYK9-265 was filed for. Record the post-payment state as "not exercised by design: stop-at-checkout".
4. **View entry status** — accepted / waitlisted / pending-payment, with **no silent limbo**. This is the highest-value area in the whole walk.
5. **View the published running order and ring assignments** — once posted, on the same screen as the entry.
6. **Receive announcements** — the read-only inbox.
7. **Check in on show day** — self-check-in.
8. **Review results** — per class entered, once posted.
9. **Review statistics** — per-dog past performance.

## Personas — run the job list twice

Run the nine tasks above twice, as two personas with the same role and permissions. Persona changes what the tester knows and wants, never what the account may do; here the account also changes, for account history. Run the beginner pass FIRST. Each pass gets its own browser context, opened the same way the cold-replica mechanic below opens one (`storageState()` after sign-in, then a fresh context per pass); never share a tab or context between passes. Before each pass, write down its goal, starting state, what counts as done, and what would count as outside help or a workaround.

Viewports, the triple the Codex exhibitor walk uses: desktop 1440×900 for both passes; mobile 390×844 for the beginner pass's touch-target and 150% zoom checks; tablet 768×1024 for the experienced pass. Only desktop is walked by both personas, so only desktop supports a persona comparison: a finding seen solely at 390×844 or 768×1024 is labelled viewport-specific, never persona-specific.

- **Beginner** — a first-time exhibitor with one dog and no account history, entering their first show. Two halves, one persona. **Empty-state half, on `exhibitor2@`:** start signed OUT at discovery, since that is where a first-timer arrives; add the first dog (this pass's `ZZ Walk Dog <run token> #1`, never an unmarked dog on this account); find the open show and enter it up to the Checkout boundary, then stop, remove the cart line, delete the dog, and assert the account reads 0 / 0 / empty cart. **Second half, on `exhibitor@`:** same persona, same knowledge, on a second throwaway dog; enter the open show up to the Checkout page (task 3, stop-at-checkout), remove the cart line (no entry exists yet: the Stripe webhook creates it only after payment, so task 4 reads the seeded entries on this account, never this dog), and read the announcements inbox (6). Covers tasks 1–4 and 6 (the inbox holds the show-day fixture's announcements); 5, 7, 8 and 9 are not applicable by design, because a first-timer's only dog is not entered in a running show and has no scored history. Navigate by visible labels only: no guessed routes, no affordance the persona could not see; the Known mechanics section still applies in full as harness plumbing. Record every point where the persona needed outside help, hesitated at Checkout or before anything that read as irreversible, or could not tell whether the entry went through. Check literal language and readability without colour or icons.
- **Experienced** — a multi-dog handler on `exhibitor@`, no privileged app knowledge, entering two or three of its own `ZZ Walk Dog <run token> #N` dogs in several classes of the one open show, reading the scored `Heartland` fixture for tasks 8–9, and the show-day fixture for tasks 5–7: today's running order and class time on Willow's entry (5, compared against the same fact on every other surface that states it), the announcements inbox (6), and self-check-in on **today's Willow entry only** (7). That check-in is the one change this walk makes to a seeded entry: exactly one entry, the one the precondition query returned, recorded in the report with its before and after `check_in_status`. The fixture has one Willow entry per day for exactly this reason, so tomorrow's walk finds a fresh one, and the next reseed resets it; never check in any other seeded entry. Covers tasks 1–2 and 4–9. It stops at the Checkout boundary, per the boundary above. Never enter a seeded dog. Start from the signed-in landing page. Count the repeated steps per additional dog and per additional class; check whether the wizard remembers dog, handler and payer between entries; whether all entries and their statuses can be seen and filtered in one place at the account's full count (recorded before this pass); whether a change to one entry is visible everywhere it is stated; and whether the next thing that needs attention (unpaid, waitlisted, checked in) is obvious. Do not excuse unclear UI because the persona is experienced.

The account contrast (empty vs established) is account history; the persona contrast is knowledge. Both matter and neither substitutes for the other, which is why the beginner persona touches both accounts. Every mutation happens in exactly one pass and the boundary above is not relaxed by the split: teardown restores `exhibitor2@` to empty, deletes this run's dogs on `exhibitor@`, clears this run's cart lines, and declares any residue the UI refused to remove, on any exit. One persona's observation is never proof for the other, and a defect both hit is one finding. Do not claim a timing difference without measured start and end times for both passes.

## The signature exhibitor defect: two surfaces, one fact, two answers

Nearly every finding in the July exhibitor audits (E1–E8) was the same shape — the app stating a fact one way in one place and another way somewhere else, often **on the same page**. Hunt for this deliberately; it is the highest-yield technique for this role:

- A dog card said "1 upcoming class" while the dog's own profile said "No upcoming entries" (E1).
- A stat card said 9 entries, the list below it said 10 (E2).
- The Waitlist tab said 0 while a widget on the same page showed waitlist position #1 (E3).
- A run-schedule row said "Upcoming" while the entries section below said "Withdrawn · Refunded" (E4).
- "Total paid $66.30" sat above rows summing $96.30, a refund silently netted with no refund row (E5).
- The secretary had assigned a judge; every exhibitor-facing row said "Judge TBD" (E6).
- The same entry number was issued twice, and was called "Entry #" in one place and "Registration #" in another (E7).

For every count, total, status and date you see, find the OTHER place the app states it and compare. Where they disagree, say which one is right and how you know.

## Judgment rules

- **Read `docs/INTENT.md` and `docs/roles/exhibitor.md` first.** The target feeling is "I trust this with my day", and the doc is explicit that **silence after payment is the scariest state**. A screen that is technically correct but leaves the exhibitor unsure whether something worked IS a finding, and should be rated on that basis rather than dismissed as cosmetic.
- The project is **pre-launch, consolidating not expanding**. A duplicated surface is itself a finding. Prefer "link these two existing surfaces" over "add a page". If you propose a new surface, answer explicitly: does this duplicate an existing page, and why is duplication justified instead of a link?
- Code that looks wrong but carries an `// INTENT:` comment is deliberate — read it before calling it a defect.

## Output

- Write to `docs/audits/YYYY-MM-DD-exhibitor-task-walk-claude.md`.
- **Number findings in the E-series, continuing from the prior walk's highest** (E43 as of the 2026-09-13 walk).
- **Canary candidates section.** For every prior finding you re-verified as holding, and every new P0/P1, write one line: the exact user-visible assertion that would catch its recurrence against staging (route, account, locator or text, expected value). An example is "`/my-entries` schedule as `exhibitor@`: zero rows read `Judge TBD` for Heartland classes whose `judge_assignments` are confirmed". These feed the staging canary suite (MYK9-730). Assertions only, no code.
- **Prompt corrections section.** List every statement in this walk's file, `docs/qa/walks/exhibitor-task-walk.md`, that the run found stale, with the evidence. A correction that falls below the file's `# Part 2 — Known mechanics` line you apply yourself, in the same commit as the report (see Hard constraint): that part exists to churn, and a correction that waits for a human is re-derived by every run in between. A correction to anything ABOVE that line — the job, the safe mutation boundary, the output and filing rules — is listed here only, and a human makes it through a reviewed PR. Never weaken a safety rule from Part 2 either: if a mechanic conflicts with the boundary, the boundary wins and the conflict goes in this section.
- Do not restart the finding numbering at E1 and do not use the secretary walk's F-series.
- Use the `quality-finding-lifecycle` skill for finding identity, evidence, P0–P3 severity, dedup and recurrence.
- Include a coverage table: the nine task areas as rows, the two personas as columns, each cell completed / completed with help or workaround / walked read-only by design / blocked / not exercised / not applicable by design, plus which account it was walked on. By design: beginner × 5, 7, 8 and 9 are not applicable (a first-timer's dog is in no running show and has no scored history); experienced × 5 and × 7 are real cells on the show-day fixture, and blocked only when the precondition query found the fixture stale (a gap, not a pass); task 3 is a real cell for both personas up to the Checkout page; record the post-payment half as "not exercised by design: stop-at-checkout", never as a pass. Say which account each beginner cell was walked on. A blocked or not-exercised cell is a coverage gap, not a pass.
- Answer two questions plainly in the headline: could a first-time exhibitor enter a show and reach Checkout without assistance, and could a multi-dog handler enter a full weekend efficiently? If a persona pass did not run, its answer is "not established" — never inferred from the other pass.
- Every finding carries a persona × viewport matrix. Label friction only one persona hit as persona-specific; a defect both hit is one finding, not two.
- Mark each finding new / unchanged / regressed / resolved against prior runs.
- Include a short "Corrections to my own measurement" section if any first reading turned out wrong — the secretary walks showed this is where the most useful signal hides.
- **File findings to Linear directly — there is no approval step.** This run is unattended, so a "prepare a draft and ask for batch approval" gate means nothing is ever filed and the report dies with the worktree. Every confirmed P0/P1 gets its own issue (team **MyK9-platform**), labelled `Claude` plus `Bug` (or `Improvement`), with severity in Linear's **priority field**: P0/P1 → Urgent, P2 → High, P3 → Low. The labels `p0`/`p1`/`source:claude`/`walk:exhibitor` do NOT exist in this workspace, and creating labels unattended is a shared-system change this walk has no mandate for. Put `walk:exhibitor <YYYY-MM-DD> E<n>` as the description's first line so walk issues stay searchable. Group P2/P3 as sub-issues of ONE parent titled `Exhibitor task walk <YYYY-MM-DD> — P2/P3 findings`. A P2/P3 that already has a Codex canonical issue (Codex files them individually with `EUX-YYYY-MM-DD-NN` ids in the description) is commented there instead, never added as a sub-issue.
- **Dedupe before filing, always with `includeArchived: true`.** Match on task area, route, object and symptom — never on title. Auto-archive is on as a team setting (the paid-plan upgrade removed the 250-issue cap, not the archiving), so a default query reads shipped work as never-seen and re-files it. If an issue already exists, comment on it rather than opening a second.
- **Do NOT file coverage gaps, harness bugs, or the "Corrections to my own measurement" items as issues.** They belong in the report body — that section is the most useful signal in the walk and it is not a defect list.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled.
- **Commit the report and push it to `main`.** Docs-only, inside the direct-to-`main` carve-out in CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file and, if you applied a Part 2 correction, this walk's own file — and that `git diff` of the walk file changes nothing above its `# Part 2` line. Without this the report is lost when the worktree is removed.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no `supabase db push`, no function deploys. If you find something trivial to fix, still do not fix it — record it and let a human decide. The only repo writes permitted are committing and pushing your own report file and, in that same commit, Part 2 corrections to this walk's own file, per the Output section above. (The stop-at-checkout payment boundary earlier in this file is not covered by that exception: only a reviewed change to Part 1 can relax it.)

# Part 2 — Known mechanics (expected to churn)

Everything below this line is measured fact about the app, the fixtures and the open issues, and goes stale. A run may correct it in the same commit as its report (Output, "Prompt corrections"). Nothing below may relax Part 1.

## Known mechanics and measurement traps

Hints so you do not rediscover them, several bought expensively on the secretary walks. **Verify each still holds** — they are starting points, not gospel.

- **`exhibitor@` may carry a pre-existing cart** left by the Codex `weekly-exhibitor-ux-walk` (its ledger records a hosted cart write from class selection). Record the cart state before the pass and do not attribute it to this run or to the app. `entry_carts.exhibitor_id` references **`exhibitor_profiles.id`**, not `people.id` or the auth uid: key the query on `exhibitor_profiles.person_id` or it returns 0 rows (2026-09-26). A cart header with 0 items and non-zero `subtotal_cents` was already present on the Classic show on 2026-09-26; no UI removes a cart header, so declare new empty headers as residue.
- **"Finish Payment" and the waitlist offer both write or spend.** Finish Payment fills the hosted cart with the seeded Classic pending entries; each line's Remove deletes only the `entry_cart_items` row, never the entry (`cartStore.removeItem`). The waitlist offer's "Complete payment" skips the cart and opens Stripe Checkout directly, creating a sandbox session; read the URL only and leave.
- **Dog teardown is blocked while MYK9-799 is open.** The delete dialog's pre-check 403s for every dog, so a run cannot delete its throwaway dogs through the UI. Create as few dogs as the tasks need, and declare every one as residue.
- **The show-day page's rows are indistinguishable while MYK9-800 is open.** `/at-show/…014` lists every day's Willow entry with a Check in button. Do task 7 from My Shows ("Check in Willow for <weekday>") or anchor to `li[data-testid=at-show-my-entry-<today's entry id>]`, and guard the write to that entry id.
- **`playwright-cli` writes snapshots under the daemon's working directory.** Open the session from your scratchpad, not the primary checkout, whose shared `.playwright-cli/` belongs to other sessions.
- **An empty result is not evidence of emptiness.** This is the dominant bug family here. A disabled query, a query paused offline, and a placeholder from a previous key all render `isLoading: false` with no data, and UI reports that as "you have no entries". `readWithReplicationFallback` only falls back to the network on a THROW, never on a cold-but-well-formed empty array. Related and specifically exhibitor-facing: `databaseUserId` comes from a plain network query with no `networkMode`, so on a cold offline boot a signed-in exhibitor can hold roles while `personId` is `undefined`, and every hook keyed on it reports empty as fact. Treat every "you have nothing" screen as suspect and cross-check the database.
- **Scale needs the opt-in load fixture.** On a plain reseed `exhibitor@` holds 5 seeded dogs and 19 entries (12 Classic, 7 Scent Work Week), which cannot show whether lists paginate or counts span the full set. Count the account's dogs first: if it holds the MYK9-109 load dogs (`supabase/seed-load-fixture.sql` applied, ~250 dogs), check that lists paginate/virtualise, that counts are computed over the full set rather than the loaded page, and that nothing times out. If not, record scale as NOT EXERCISED with that reason. Never apply the fixture yourself: it is a shared-staging write.
- **Reports and receipts render inside an IFRAME**, and a report with a `buildPdf` puts an `application/pdf` blob in the iframe `src` — headless Chromium has no PDF viewer, so its DOM is a 39-byte empty shell however full the document is. Do not score those from the frame DOM; measure the Blob by wrapping `URL.createObjectURL` in an `addInitScript` and reading `.size`. `fetch` on the blob URL is rejected by the offline-queue patch and XHR is refused by CSP — both report zero for a perfectly good document. Note also that empty-state text often renders in the OUTER document with no iframe at all, so read both.
- **A fresh browser context is the only way to test a cold replica.** Re-navigating in one context leaves `myK9_Replication` warm from the second load on. Capture `storageState()` after sign-in and open a new context per cold-load attempt — it carries cookies and localStorage but no IndexedDB.
- **A whole-test/whole-step timeout tells you nothing about which phase ran long.** If something is slow, instrument the phases with `performance.now()` before concluding a cause.
- **Verify claims against the running app, not source text.** A comment naming a behaviour is not evidence the behaviour exists.

## Open issues to re-verify

- **MYK9-289** (Done 2026-09-05): Nightly Health's exhibitor routes (`sign-in-target`, `my-entries`, `account`, `shows`, `notifications`) never settled their API requests on Chromium. If any of those routes shows a request that never settles, name the URL and comment on MYK9-289 with it.
- **The 2026-09-26 findings**: MYK9-799 (E44, no dog can be deleted: the pre-check filters on `entries.result_status`), MYK9-800 (E45, show-day list offers check-in for every day), and the P2/P3 parent MYK9-801 (E46–E53: announcements inbox empty until `/at-show`, zero-dog wizard dead end, paid banner money, preliminary result shown as final, dog profile dates, raw discipline enum, month strip, 150% zoom overflow). Read each with `get_issue` first and confirm it in the browser.
- **The 2026-09-13 findings** (all Done; E37, E38, E39, E41 and E43 confirmed holding on 2026-09-26; E42 not reached without a payment): MYK9-494 (E39, judge vanished from schedule rows after `classes.judge_name` was dropped), MYK9-495 (E38, an order's `paid` masks an entry's `pending`), MYK9-497 (E40, "upcoming classes" vs the dog profile), MYK9-498 (E41, `Waitlist 1` filters to `0 entries`), MYK9-499 (E42, `Confirmation #` means two things), MYK9-500 (E43, breed optional on the dog but required by the registration), and MYK9-423 (E37, "Finish Payment" dead end, masked rather than fixed by E38). Read each with `get_issue` first. For a Done issue, confirm it holds in the browser. For an open one, add fresh evidence only if the symptom changed.
- Confirm these closed issues have not recurred (closed exhibitor issues DO recur, and auto-archive is still on as a team setting — the paid-plan upgrade removed the 250-issue cap, not the archiving — so a default query reads shipped as never-seen; pass `includeArchived: true`): MYK9-245 (dropped show hid the entry but kept the charge), MYK9-215 (receipt card-scoped not order-scoped, inflating totals), MYK9-208 (Completed tab counted show dates while cards said "Scored"), MYK9-122 (full waitlist class silently vanished after refresh), MYK9-196 (statement descriptor on entry charges).
- **MYK9-265 is closed as "not a feature": no multi-dog discount exists anywhere.** If the wizard quotes one, that is a P1 regression, not a feature sighting.

## Regression re-verification

Read the prior exhibitor audits in `docs/audits/`: `2026-07-02-exhibitor-elderly-ux-audit-claude.md` (E1–E8), `2026-07-05-exhibitor-entries-scanability-ux-audit.md`, `2026-07-06-exhibitor-elderly-browser-ux-audit.md`, `2026-09-01-exhibitor-task-walk-claude.md` (E9–E23), `2026-09-04-…` (E24–E31), `2026-09-06-…` (E32–E37), `2026-09-13-…` (E38–E43), `2026-09-26-…` (E44–E53), plus any later `docs/audits/*-exhibitor-*.md`. Re-walk E1–E8 and every finding marked fixed, and confirm it holds **in the browser**. A finding that regressed is a P1 regardless of its original severity. Explicitly list which prior findings you re-verified and which you could not reach.
