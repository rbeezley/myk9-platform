# Scheduled Task Walks — Secretary, Exhibitor, Role Intent

> **Status:** Reference

Version-controlled prompts for the three **walk** tasks. Edit here first, then push the change into
the live task at `~/.claude/scheduled-tasks/<taskId>/SKILL.md` — never edit only the live file, or
the two drift. That is not hypothetical: the judge scoring replay sat in
`scheduled-audits-claude.md` for weeks while the live prompt had no trace of it, so the strongest
reason to keep that task was documented but not running.

The fenced block for each walk below is the installed file minus its YAML frontmatter, byte for
byte, except in the window between a merged prompt change and its copy into the installed file
(see § Maintenance). `pnpm qa:prompt-parity` checks that for these three walks and the three audit tasks in
[`scheduled-audits-claude.md`](scheduled-audits-claude.md); it is local-only, since the installed
files never reach CI.

## Why these are a separate file

[`scheduled-audits-claude.md`](scheduled-audits-claude.md) holds the Claude tasks paired against the
Codex nightly set, and its taxonomy is relative to Codex: _complements_ run alongside a Codex task
to disagree with it, _substitutes_ replace one while it is dark. These three fit neither. Codex has
its own `weekly-secretary-ux-walk` and `weekly-exhibitor-ux-walk`, but these are not paired against
them for a second opinion; how the two sets relate is in § "Personas, and the Codex walks" below.

## The three walks, and the line between them

| Task                  | Roles                         | Asks                                             |
| --------------------- | ----------------------------- | ------------------------------------------------ |
| `secretary-task-walk` | secretary                     | Does the job work end to end?                    |
| `exhibitor-task-walk` | exhibitor                     | Does the job work end to end?                    |
| `role-intent-walk`    | judge, club-admin, site-admin | Does it _feel_ the way INTENT.md says it should? |

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
between personas, for data scale; its prompt says why.) `docs/INTENT.md` § "What myK9 is NOT"
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

All three follow the shared Linear contract in
[`scheduled-audits-claude.md`](scheduled-audits-claude.md) § "Findings go to Linear" — file P0/P1
directly with no approval step, group P2/P3 under one parent per run, keep coverage gaps and probe
bugs out of Linear, dedupe with `includeArchived: true`, and commit the report to `main` as the
single permitted repo write. It is restated inside each prompt so they stay self-contained when
pasted into a scheduler; change it everywhere or nowhere. The two task walks carry one addition the
shared contract does not: a P2/P3 already filed as a Codex canonical issue is commented there rather
than added as a sub-issue, because only those two roles have a Codex counterpart.

## Schedule

| Task                  | Cadence           | Time (local) | Enabled                                                              |
| --------------------- | ----------------- | ------------ | -------------------------------------------------------------------- |
| `secretary-task-walk` | Weekly, Wednesday | 3:05 AM      | yes                                                                  |
| `role-intent-walk`    | Weekly, Friday    | 3:00 AM      | **no** — needs one supervised run to grant browser-control approvals |
| `exhibitor-task-walk` | Weekly, Sunday    | 3:05 AM      | yes                                                                  |

Spread across three mornings on purpose: two walks against shared staging at the same hour collide.
Claude Code scheduled tasks run **locally, and only while the desktop app is open** — if the app is
closed when one comes due it fires on next launch rather than skipping, so treat the times as an
ordering preference, not a guarantee.

`role-intent-walk` also needs `E2E_CLUB_ADMIN_PASSWORD` in `apps/myk9show/.env.local` for its
club-admin week; without it that week is a coverage gap, and the prompt forbids substituting the
site admin.

## Maintenance

- These walks accumulate a "known mechanics" section from each run. That growth is the point: it is
  what stops the next run re-deriving a false failure. Do not trim it for length.
- The "open issues to re-verify" list is load-bearing and goes stale fast. When an issue there is
  fixed and confirmed, move it to the do-not-re-file note rather than deleting it.
- If a walk's findings become dominated by harness bugs rather than product defects, the prompt has
  drifted from the app. Re-walk it by hand before trusting the next report.
- The persona split is a prompt change, not a scheduler change. After it merges, copy the _contents_
  of the two fenced blocks (not the fences; the exhibitor one is four backticks because it holds a
  `sql` block) into the installed `SKILL.md` files below their frontmatter and run
  `pnpm qa:prompt-parity`. Until then parity **fails (exit 1)** for both task walks on the machine
  where they are installed; elsewhere it reports them `SKIPPED`. Do the copy before the next run of
  either walk (exhibitor Sunday, secretary Wednesday): until then the installed secretary prompt has
  neither the seeded-entry constraint nor the do-not-send rule, so a Wednesday run may edit a seeded
  entry or send a message to seeded accounts and web push, and the installed exhibitor prompt still
  names its dog by date alone, so a same-day re-run can match an earlier run's dog. If the copy cannot land before a walk's next run,
  disable that walk in the scheduler rather than let it run on the old boundary.
- `claude-role-ux-walk` was retired on 2026-09-01 and replaced by `role-intent-walk`. Its
  deregistered `SKILL.md` may still be on disk at `~/.claude/scheduled-tasks/claude-role-ux-walk/`;
  it does not run. Delete it when convenient.

---

## `secretary-task-walk`

Weekly, Wednesday. Setup, entries, permissions, reports, money.

```
Run a FUNCTIONAL walk of the secretary's real task surface in a real browser, and write an audit report. **Assume nothing else walks the secretary.** `claude-role-ux-walk` was retired on 2026-09-01 and its replacement, `role-intent-walk`, rotates only through judge / club-admin / site-admin. Codex has a `weekly-secretary-ux-walk`; read its `status` and `rrule` with `grep -E '^(status|rrule)' ~/.codex/automations/weekly-secretary-ux-walk/automation.toml` and report only those two values, but every hosted write it makes needs approval it does not have unattended, and it tears nothing down, so it never substitutes for any part of this walk. So this walk carries both questions: the functional one — **does the secretary's job actually work end to end?** — and the INTENT lens in Judgment rules below.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Isolation

Work in your OWN git worktree cut from `origin/main`, and use a unique vite port. A shared checkout gets corrupted by concurrent agents. Do not run in the primary checkout.

## Credentials — read this before signing in

Sign-in accounts are the `@myk9t.com` set (`secretary@myk9t.com`, `testadmin@myk9t.com`, `judge@myk9t.com`, `exhibitor@myk9t.com`). The old `e2e-*@test.myk9.com` domain was RETIRED on 2026-08-23 and has no `auth.users` rows — any prompt or doc telling you to use it is stale.

Passwords live in `apps/myk9show/.env.local` (gitignored) as `E2E_SECRETARY_PASSWORD` / `E2E_ADMIN_PASSWORD`. Read them from the environment at runtime. Never print, log, or write a credential into a report or screenshot. Filter member searches to seeded accounts so no real-user PII enters the report.

If sign-in fails with `Invalid login credentials`, that is auth-state drift, not an app bug — report it and stop rather than debugging the app.

## Safe mutation boundary

This runs against SHARED STAGING. Other agents and CI use the same data.

- Create and edit demo records freely; **undo anything you create** before finishing.
- Do NOT delete records you did not create. Do NOT touch payout flows or run anything against production.
- **Anchor every destructive click to the row that owns it** — `locator('li', {hasText: targetEmail}).getByRole('button', …)`, never `.last()` or an index into a list whose length you did not assert.
- **The confirm click is a destructive click too, and it is the one that gets missed.** Scope it to the dialog (`page.locator('[role="dialog"]').getByRole('button', …)`), never page-wide. A page-wide `getByRole('button', {name: /revoke|delete|confirm/i}).last()` will happily match *another row's* control when no dialog opened, and fire a second destruction you never intended.
- **Never assume a confirm dialog exists.** Assert it appeared before looking for anything in it; if it did not, the first click already did the work and there is nothing to confirm. Both of these fired for real on 2026-08-31: Revoke has no confirmation (MYK9-284), so the page-wide fallback clicked the canonical CI secretary's own Revoke and destroyed their appointment. Two `club_secretary_revoked` rows 1.8s apart in `permission_audit_log` were the proof.
- **Before any destructive click, record the count you expect afterwards; after it, assert that count.** One revoke means one fewer appointment. If two disappear, stop and restore immediately rather than continuing the walk.
- If you appoint anyone, revoke exactly that person, then verify in SQL that the global role counts match what you recorded before you started.
- **Mint one run token at start** — `<YYYY-MM-DD HHMM>` — print it at the top of the report and use it in every fixture name, so a same-day re-run can never match an earlier run's rows. Before deleting the walk show, assert exactly one show matches this run's full name; 0 or more than 1 is report-and-stop, never a delete.
- **Never change the state of an entry you did not create.** Check-in, move-up, scratch and correction run only on the mail-in entry this run added to its own `ZZ Walk <run token> <registry> - teardown me` show, in a class that show's wizard created, so the show delete cascades them away and no seeded entry, waitlist, run order or placement is ever touched. If that show cannot reach a state where the control is offered (for example check-in on a show that is not in progress), the cell is blocked, not a pass, and you say why. Undo each edit through the UI right after observing it; if the UI offers no reverse control, that is a finding, and the show delete is the backstop.
- **Never create, edit or delete a dog or a `dog_registrations` row.** The mail-in entry uses a seeded dog's existing registration for this week's registry; a `dogs` row is not cascaded by the show delete and would be permanent residue.
- **Do not send a message or announcement.** Compose to the point of the send control and stop; a send reaches seeded accounts and web push, and it is out of scope for this walk.
- **Teardown runs before finishing for ANY reason** — a run that stops early, hits an error, or abandons a pass still deletes the show this run created (matched by this run's full name, never by the `ZZ Walk` prefix) and revokes any appointment it made. Count assertions are report-and-stop checks: a mismatch is a finding, never corrected by deleting a row this run did not create. A truncated run must not leave residue on shared staging. Declared residue that teardown cannot remove: the show delete is soft (MYK9-285), and `permission_audit_log` and `entry_status_history` rows persist beyond it; that is accepted, say so in the report so the accumulation stays visible.

## Registry — rotate by ISO week

A show carries exactly one sanctioning registry (MYK9-490), and each registry has its own class template, level names and official forms, so one AKC show per run leaves UKC and ASCA unwalked. Rotate:

  week mod 3 == 0 -> ASCA, trial type `Scent Detection`
  week mod 3 == 1 -> AKC, trial type `Scent Work`
  week mod 3 == 2 -> UKC, trial type `Nosework`

Compute the week with `date -u +%V` (use `$((10#$WEEK % 3))`, since a bare `08` is an octal error) and print it with the chosen registry at the top of the report. The walk show's one full name, used by every match-count assertion and by teardown, is `ZZ Walk <run token> <registry> - teardown me`. Put the registry in the coverage table's caption and on rows 1, 4 and 7 so a registry check that was not performed is a visible gap. At a year boundary ISO week 52 and week 1 both give `mod 3 == 1`, so AKC repeats once (in a 53-week year the sequence is 52 AKC, 53 UKC, 1 AKC and ASCA is the one skipped); that is accepted, not a rotation bug. The mapping was rotated on 2026-09-15 so that weeks 38 and 41 (2026-09-16, 2026-10-07) land on UKC ahead of a club's UKC trial on 2026-10-10 (MYK9-524). Every task below runs on that registry's walk show, except the read-only demo-show checks in task 2 (cold replication store), which stay on the demo show; the registry-specific checks are marked in tasks 1, 4 and 7. MYK9-448 and MYK9-447 are the shape of defect this rotation exists to catch: a registry's form missing from its own show's catalog, and a registry-specific field never set.

## What to walk

Cover the secretary's task surface, not a route list. Prior walks found defects in every one of these:

1. **Show setup** — create a show through the wizard; judges and chairman pickers; entry open/close dates; class creation; day-of-show fee. **This is walkable end to end and you should walk it**: the teardown path is proven — open the app header's Actions button (`[data-testid="header-actions-trigger"]`) → **Show Details**, then use the existing **Edit** action on the show page to reach the Show Edit panel. Delete lives at the BOTTOM of that panel; it soft-deletes the show and cascades to its trials and classes. The show header's old `button[aria-label="More show actions"]` menu was deleted by MYK9-630. Name the show so teardown cannot mistake it (`ZZ Walk <run token> <registry> - teardown me`) and delete it before you finish. Check `club_id` persisted, and that naming officials wrote `show_officials` rows and **zero** `user_roles` rows — the label must grant nothing. **Registry:** on step 1 (Show Details) pick this week's registry in the **Organization** select (options read `AKC (American Kennel Club)`, `UKC (United Kennel Club)`, `ASCA (The Australian Shepherd Club of America)`); on step 2 (Trials) the **Trial Type** select must offer that registry's scent sport (`Scent Work` / `Nosework` / `Scent Detection`) and you pick it. After creation confirm in SQL that `shows.organization` is the registry and every `trials.registry_id` equals it — a trial stamped with another registry is a P1.
2. **Entries** — Entry Management on the demo show with a cold replication store, read-only there; add a mail-in entry to the walk show (including after its entries close); check-in, move-up, scratch and correction on that entry only, per the boundary; run order; the mail-in entry is for a seeded dog, entered under its `dog_registrations` row for this week's registry (every seeded dog holds one for all three registries; no dog or registration row is created, edited or deleted).
3. **Permissions** — the Show Access tab at `/club-admin/members` (pick a club first). Appoint a secretary who is a member of NO club, confirm the list shows them as "Not a club member", confirm they can reach and manage that club's shows, then revoke. Appointment is the only thing that grants access; the named official on a show is a label that grants nothing.
4. **Reports** — two surfaces. On the DEMO show (populated): open EVERY report in the picker, not a sample, as before; that is where entry-dependent reports have data and the PDF size calibration holds. Until staging is reseeded the demo show holds AKC, UKC and ASCA trials, so its catalog listing all three registries' forms is correct there, not MYK9-448. On this week's WALK show (one entry): check the catalog and this registry's own forms only — entry-dependent reports (entry counts, waitlist, High in Trial, result catalog, financial, results sheet) correctly render the empty state there and are not findings. The walk show's catalog is registry-scoped: 17 generic reports plus that registry's own set, and NO other registry's forms (an AKC form listed on a UKC or ASCA show, or a UKC form missing from a UKC show, is the MYK9-448 class — P1). **AKC week:** the eight AKC reports render as previews; the AKC Scent Work Entry Form must render (it was unreachable for months because it fetched its own data under `renderToStaticMarkup`) and must print the show's named Trial Secretary and never the string `NaN`. **UKC and ASCA weeks:** that registry's six official forms are download-only; each must show the "… is a downloadable form" message and a Download button, and the field-completeness alert appears only when the form has unfilled required fields (an absent alert on a complete or static form is correct, not a defect). The downloaded file must be non-empty per the Known mechanics size rule. Seven forms download the blank registry template by design — UKC Element Judges Book, UKC Handler Discrimination Judges Book, UKC Trial Score Sheet, ASCA Entry Form, ASCA Trial Report, ASCA Trial Roster, ASCA Score Sheet — so they identify nothing; the filled ones print other things: UKC Trial Report, ASCA Gross Receipts and ASCA Post-Event Evaluation print the CLUB name and trial date; the UKC Entry Form and UKC Change Entry Form packets print dog and owner fields. No form body prints the show name (only the UKC packet's filename does), so do not look for the walk show's name inside any PDF. Field-level checks (the UKC permanent-registration box that is the MYK9-447 class) run only when the run can extract PDF text, otherwise they are recorded UNVERIFIED by harness. Reports render inside an IFRAME — read the frame, not the outer document, or you will measure app chrome and report a false pass.
5. **Money** — entry fees, day-of-show fee, receipts vs. what the database records, refunds, "Paid online" labelling for non-card payments.
6. **Messages / communication** — composing scoped to a show, history filters.
7. **Waitlist and classes** — capacity cards, class judge display. **Registry:** compare what step 3 of the wizard OFFERED for this week's walk show (not the one or two classes the show ended up with) against the LIVE rules for that registry, read with SQL at run time: `select r.element, r.level, r.section, r.class_name from sport_class_rules r join sport_templates t on t.id = r.sport_template_id where t.organization = '<registry>' order by r.class_name`. The offered set must equal that set exactly; a class offered that is not in the rules, or a rule with no offered class, is a P1 either way. Do not carry an expected list in this prompt — the rules have changed since the first seed (UKC Handler Discrimination stops at Excellent, ASCA carries C continuation sections) and a stale list files a false P1 every week. The only fixed sanity check: Buried and Detective are AKC-only elements and must never be offered on a UKC or ASCA show.

## Personas — run the job list twice

Run the seven task areas above twice, as two personas holding the SAME account and permissions. Persona changes what the tester knows and wants, never what the account may do. Run the beginner pass FIRST. Each pass gets its own browser context, opened the same way the cold-replica mechanic below opens one (capture `storageState()` after sign-in, then a fresh context per pass); never share a tab or context between passes, so nothing the experienced pass learns can teach the beginner. Before each pass, write down its goal, starting state, what counts as done, and what would count as outside help or a workaround.

Viewports: desktop 1440×900 for both passes; mobile 390×844 for the beginner pass's touch-target and 150% zoom checks; tablet 768×1024 for the experienced pass's tablet-efficiency checks. Only desktop is walked by both personas, so only desktop supports a persona comparison: a finding seen solely at 390×844 or 768×1024 is labelled viewport-specific, never persona-specific.

- **Beginner** — a retired, first-time club secretary with little computer experience. Start from sign-in and the landing page. Navigate by visible labels only: no guessed routes, no `?report=` / `?focus=` / `?tab=` parameters as a way of getting somewhere, no affordance the persona could not see. The Known mechanics section still applies in full — its selectors and measurements are harness plumbing, not user knowledge. The known case is the report picker: the persona reaches Reports by its label and opens reports from the picker, and where the harness must drive it with `?report=` because the Base UI popup exposes no options, say so plainly and record the picker's own dropdown as UNVERIFIED for this persona — a harness limitation, not a pass. The beginner opens one report by label; the exhaustive every-report sweep belongs to the experienced pass. Walk all seven areas: set up the walk show (1), find and review an entry and the mail-in affordance (2), appoint and revoke (3), open reports (4), find fees and receipts (5), find messaging (6), find waitlist and class capacity (7), then find the show-day check-in, run order, results and closeout path. Record every point where the persona needed outside help or hidden knowledge, hesitated over an action that read as irreversible, or could not tell whether something saved. Check literal language and readability without colour or icons.
- **Experienced** — a repeat secretary on a busy show day: many entries, frequent changes, no privileged app knowledge. Start from the signed-in landing page. Find the right show fast, process a queue of representative entries, switch between shows and classes, add a mail-in entry, handle a late check-in and a scratch or correction, find unpaid and exceptional entries, and reach the report and closeout path. Count repeated steps. Check bulk-action discoverability, filters and search, whether context survives a switch, stale-state signals, undo and recovery, keyboard and tablet efficiency, and whether the next urgent task is obvious. Do not invent hidden shortcuts, and do not excuse unclear UI because the persona is experienced.

**Every mutation happens in exactly one pass; the boundary above is not relaxed by the split.** Beginner pass: creates the `ZZ Walk <run token> <registry> - teardown me` show under this week's registry with at least one class and, if the wizard allows, dates that put it in progress today so check-in and run order are reachable (1) — record in the report which show-day controls the walk show can actually reach, so the next run's Known mechanics can pin it. The beginner pass also runs the single appoint-and-revoke cycle (3). Experienced pass: adds the mail-in entry to that show and performs the check-in, move-up, scratch and correction edits on that entry only (2), each undone per the boundary; runs the exhaustive every-report sweep (4); reads fees and receipts (5), the Show Access tab (3), messaging (6) and the waitlist and class capacity cards (7) without mutating any of them. The beginner pass finds each of those affordances without firing it, and finds seeded entries on the demo show read-only. Teardown is once, at the end, and on any early exit. One persona's observation is never proof for the other, and a defect both hit is one finding. Do not claim a timing difference without measured start and end times for both passes. Keep both personas inside the seven task areas: this is a task walk, not a route inventory.

## Known mechanics

Hints from the 2026-08-31 run, to save you rediscovering them. **Verify each one
still holds** — they are starting points, not gospel, and a stale selector here
should be treated as a hint that changed, not a defect.

- **The demo show** in this prompt is the big seeded one with 63-entry classes, `dededede-...010` (the PDF calibration show below); the walk reads it and never mutates it.
- **Routes.** Wizard: `/secretary/create-show/wizard`, reached from the secretary dashboard's **Add Show**. Entry Management: `/shows/:id/entries` (tabs Registrations / Exceptions). Show Desk: `/shows/:id/show-day`, and it accepts `?focus=<classId>` — Run order and Move up appear only on a focused class. Messages: `/secretary/messages`. `/shows/:id/messages` and `/messages` are 404s.
- **Reports.** Drive the picker with `?report=<id>` (plus `&trialId=`/`&classId=`/`&dogId=`) rather than the dropdown, which is a Base UI select whose popup exposes no `role=option` nodes. The id list is `apps/myk9show/src/lib/reports/reportRegistry.ts`.
- **Reports render inside an IFRAME.** Read the frame, not the outer document. But note the empty-state message ("No entries found for this selection") renders in the OUTER document with **no iframe present at all** — so a frame-only read scores a false pass on exactly the failure you are hunting. Read both.
- **Reports that build a PDF are UNREADABLE in headless Chromium, and read as blank.** `ReportPreview` puts an `application/pdf` blob in the iframe `src` for every report with a `buildPdf` (Check-in Sheet, Running Order, Entry List, ...), and headless has no PDF viewer, so `contentDocument.body` is a 39-byte empty shell however full the sheet is. Reports without `buildPdf` (Show Catalog) write markup into the frame and read fine — which is why one report looks healthy and its neighbour looks broken. Do not score a PDF report from the frame DOM. Measure the Blob instead: `addInitScript` a wrapper around `URL.createObjectURL` that records `{type, size}`, then read `.size`. `fetch` on the blob URL fails (the offline queue patches `window.fetch`) and XHR is refused by the page CSP — both report zero for a perfectly good sheet. Calibrate with a small class: on show `dededede-...010`, the Check-in Sheet is ~4.2KB for a 3-entry class and ~13.2KB for a 63-entry one.

- **Twelve reports are download-only** (`pdfOnly: true` — six UKC and six ASCA forms). They correctly render no preview and say "… is a downloadable form" with a Download button and a field-completeness warning. Do not score these as broken; measuring them for an embedded document reported 11 false failures in the first pass.
- **"Does it print the named official" is only answerable on a show that HAS `show_officials` rows.** On the big demo show, "Test Secretary" matches as a *handler* name in the entry data and yields six false positives. Query for a show with officials first.
- **Date pickers**: the accessible name is on the day BUTTON inside the gridcell, not the cell — `button[aria-label="Saturday, October 10th, 2026"]`. Month `<select>` values are 0-based.
- **The report catalog has two deliberate fallbacks** (`getReportsForRegistries`): while the trials' registries are unresolved it shows all 37 entries, and a report selected by `?report=` is kept even when outside the show's registry so a deep link never dead-ends. Assert registry scoping only after the trial selector is populated, with a trial explicitly selected and no `?report=` in the URL; a full catalog seen before that, or a deep-linked foreign form, is not MYK9-448 — re-read, do not file.
- **Download-only forms are checked as files, not frames.** Capture each with `page.on('download')` and `download.path()` into `.logs/walk-downloads/` (gitignored; delete the directory at teardown; never commit a PDF with the report). "Non-empty" is a byte size above the size a blank form produces — record the first run's sizes in the report so later runs have a range. Reading a field value (the MYK9-447 permanent-registration box) needs PDF text extraction; if the run has a text-extraction tool available, say which and quote the matched text, otherwise mark those field checks UNVERIFIED by harness, never as a pass. Anything quoted out of a downloaded form is subject to the PII rule: seeded names only.
- **Registry controls in the wizard.** Step 1's Organization select is a Base UI combobox with `id="show-organization"` (accessible name "Organization *"); step 2's Trial Type select is `id="trial-<trialId>-type"`. The show's organization is stamped on every trial's `registry_id` once at creation by the wizard, so the task-1 equality check holds regardless of the server. Migration `20260915163500_enforce_one_registry_per_show.sql` (merged 2026-09-14 in #2239) adds a trigger `trg_enforce_show_registry_on_trial` raising SQLSTATE `MK490`; check `supabase_migrations.schema_migrations` for that version before citing it — on 2026-09-14 it was NOT yet pushed, so nothing enforced it server-side and the demo show still carried AKC, UKC and ASCA trials from the pre-fix seed. That mixed demo show is known until the migration is pushed and staging reseeded; it is not a finding, and its report catalog correctly lists all three registries' forms.
- **There is exactly one template per registry, so the wizard shows NO template picker on step 3** — it renders only when more than one template matches the organization, and with one match it auto-selects silently. Do not report the missing picker; report the elements and levels it offered against the list in task 7. The templates are named `AKC Scent Work - Official`, `UKC Nosework - Official`, `ASCA Scent Detection - Official` and live in `sport_templates` / `sport_class_rules`, matched by organization string, not by `registry_id`.
- **Seeded registry fixtures**, read-only for this walk: `Heartland UKC Nosework Trial` (`dededede-...011`) and `Heartland ASCA Scent Detection Trial` (`dededede-...012`), same club as the demo show, published, deliberately entry-free. Seeded dogs hold a `dog_registrations` row for all three registries, so the walk show's mail-in entry is not blocked on registration number in any week. Both facts come from the seed file as of the MYK9-490 reseed (2026-09-14) and staging had NOT been reseeded on that date (shows `...011/012` absent; registrations present). The walk does not depend on those two shows — the wizard creates the walk show — so their absence is a note in the report, not a block. The registration rows are what matter: `dog_registrations.organization` stores the full label (`UKC (United Kennel Club)`), not the code, so match with `organization like 'UKC%'`; if no row for this week's registry exists for any seeded dog, report BLOCKED ON SEED for task 2 and do not create one.
- **Class selection in the wizard** is `div[role=checkbox]`, not `input[type=checkbox]` — use `getByRole('checkbox', …)`. They are keyboard-reachable (all carry a tabindex); that has been checked, do not re-file it.
- **`ShowDetailTabs` passes `canManageShow={false}` to `ShowMapTab` deliberately** (#291, public map is read-only). Not missing wiring.

## Open issues to re-verify

Confirm each in the browser and mark holds / regressed:

- **MYK9-448** (Done) — on a UKC week, the UKC Nosework Trial Report must be in the catalog on the UKC walk show. **MYK9-447** (Done) — on a UKC week, the mail-in entry is on a seeded dog holding a UKC `dog_registrations` row, so the downloaded UKC entry form should tick the permanent-registration box; this is checkable only if the run can extract the PDF's text (see task 4), otherwise record it UNVERIFIED by harness, never as a pass. Both closed; confirm they have not recurred on the week that can see them.

- **MYK9-283** — RESOLVED. Fixed in #1922, live on staging, and re-verified 2026-09-01: 30 cold loads, 0 false zeros, plus the sibling `scoresheet` report and both trial and class scopes. Do not re-file. If you re-check it, note that re-navigating in ONE browser context does NOT give a cold replica — `myK9_Replication` stays warm from run 2 on, so only run 1 ever tests the bug. Capture `storageState()` after sign-in and open a FRESH context per run: storageState carries cookies and localStorage (where the Supabase session lives) but no IndexedDB.
- **MYK9-284** — Revoke on the Show Access tab has no confirmation step.
- **MYK9-285** — the delete-show dialog claims permanent, irreversible deletion but soft-deletes.
- **MYK9-286** — `/shows/new` renders a connection error instead of the wizard or a not-found.
- **F22** — `/secretary/messages` is history-only, with no compose control.
- **F8** — the chairman picker's results are headed "ALL PEOPLE", not scoped to the club.

## Regression re-verification

Read `docs/audits/2026-08-28-secretary-task-walk.md` (F1–F35) and `docs/audits/2026-08-31-secretary-task-walk-claude.md` (F36–F42), plus any later `docs/audits/*-secretary-task-walk-*.md`. Re-walk every finding marked FIXED and confirm the fix still holds **in the browser**. A finding that regressed is a P1 regardless of its original severity. Explicitly list which prior findings you re-verified and which you could not reach.

## Judgment rules

- **Read `docs/INTENT.md` and `docs/roles/secretary.md` first.** The target feeling is **"That was easy"** — the secretary is usually a volunteer doing this after a full day, and INTENT.md's guardrails are explicit about *Calm Over Clever* and *Respect the Clock*. A screen that is functionally correct but makes the secretary hunt for a control, re-enter something the system already knows, or second-guess whether an action took IS a finding, and should be rated on that basis rather than dismissed as cosmetic. **This lens lives here now.** It moved from the retired `claude-role-ux-walk`, whose replacement (`role-intent-walk`) rotates only through judge / club-admin / site-admin — the roles with no dedicated walk. Nothing else applies it to the secretary.
- The project is **pre-launch, consolidating not expanding**. A duplicated surface is itself a finding. Prefer "link these two existing surfaces" over "add a page". If you propose a new surface, answer explicitly: does this duplicate an existing page, and why is duplication justified instead of a link?
- Code that looks wrong but carries an `// INTENT:` comment is deliberate — read it before calling it a defect. Some things that look like missing wiring are decisions: `ShowDetailTabs` deliberately passes `canManageShow={false}` to `ShowMapTab` because the manager action layer belongs on Show Desk, and forwarding it would duplicate that surface.
- Verify claims against the running app, not against source text. A comment naming a behaviour is not evidence the behaviour exists.

## Output

- Write to `docs/audits/YYYY-MM-DD-secretary-task-walk-claude.md`, numbering findings continuously from the prior walk's highest F-number (F42 as of 2026-08-31).
- Use the `quality-finding-lifecycle` skill for finding identity, evidence, P0–P3 severity, dedup and recurrence.
- Include a coverage table: the seven task areas as rows, the two personas as columns, plus the week's registry stated in the table caption and a registry cell on rows 1, 4 and 7 only (the rows that carry registry-specific checks; a registry check not performed in its week is a coverage gap, not a pass), each cell completed / completed with help or workaround / walked read-only by design / blocked / not exercised / not applicable by design. By design, and only when the other pass actually ran (otherwise each of these cells is blocked): experienced × 1 is not applicable (the show is created once); experienced × 3, experienced × 6 and beginner × 2 are walked read-only. A blocked or not-exercised cell is a coverage gap, not a pass.
- Answer two questions plainly in the headline: could a first-time secretary configure and run a show without assistance, and could a repeat secretary handle a busy show day efficiently? If a persona pass did not run, its answer is "not established" — never inferred from the other pass.
- Every finding carries a persona × viewport matrix. Label friction only one persona hit as persona-specific; a defect both hit is one finding, not two.
- Mark each finding new / unchanged / regressed / resolved against prior runs.
- **File findings to Linear directly — there is no approval step.** This run is unattended, so a "prepare a draft and ask for batch approval" gate means nothing is ever filed and the report dies with the worktree. Every confirmed P0/P1 gets its own issue (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `walk:secretary`. Group P2/P3 as sub-issues of ONE parent titled `Secretary task walk <YYYY-MM-DD> — P2/P3 findings` — that keeps the board readable while leaving each child closable on its own. A P2/P3 that already has a Codex canonical issue (Codex files them individually with `SUX-YYYY-MM-DD-NN` ids in the description) is commented there instead, never added as a sub-issue.
- **Dedupe before filing, always with `includeArchived: true`.** Match on task area, route, object and symptom — never on title. Auto-archive is on as a team setting (the paid-plan upgrade removed the 250-issue cap, not the archiving), so a default query reads shipped work as never-seen and re-files it. If an issue already exists, comment on it rather than opening a second.
- **Do NOT file coverage gaps, harness bugs, or corrections to your own measurement as issues.** They belong in the report body. MYK9-275 and MYK9-281 were both probe bugs filed as defects — each cost a triage slot and pointed the next run at an app problem that did not exist.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled, so it survives in the committed doc.
- **Commit the report and push it to `main`.** Docs-only, inside the direct-to-`main` carve-out in CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file before pushing. Without this the report is lost when the worktree is removed.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no `supabase db push`, no function deploys. If you find something trivial to fix, still do not fix it — record it and let a human decide. The single repo write permitted is committing and pushing your own report file, per the Output section above. (The staging writes the Safe mutation boundary allows — the walk show, its mail-in entry and edits, one appointment — are unchanged by this and are undone through the UI, never by direct SQL.)
```

---

## `exhibitor-task-walk`

Weekly, Sunday. Dogs, discovery, entry, money, status, show day, results.

````
Run a FUNCTIONAL walk of the exhibitor's real task surface in a real browser, and write an audit report. **Assume nothing else walks the exhibitor weekly.** Codex has a `weekly-exhibitor-ux-walk`; read its `status` and `rrule` with `grep -E '^(status|rrule)' ~/.codex/automations/weekly-exhibitor-ux-walk/automation.toml` and report only those two values, but it does not submit entries, pay, or tear anything down (its own ledger records an incidental hosted cart write on `exhibitor@`), so it never substitutes for any part of this walk. `claude-role-ux-walk` was retired on 2026-09-01 and its replacement, `role-intent-walk`, rotates only through judge / club-admin / site-admin. So this walk carries both questions: the functional one — **does the exhibitor's job actually work end to end?** — and the INTENT lens in Judgment rules below.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Isolation

Work in your OWN git worktree cut from `origin/main`, and use a unique vite port. A shared checkout gets corrupted by concurrent agents. Do not run in the primary checkout.

## Credentials — read this before signing in

**The exhibitor's env vars do NOT follow the pattern the other roles use.** They are `E2E_DEMO_EXHIBITOR_EMAIL` / `E2E_DEMO_EXHIBITOR_PASSWORD`, not `E2E_EXHIBITOR_*`. Guessing the other name gives an empty password and the run dies at sign-in. Resolved in `apps/myk9show/src/test/e2e/helpers/testUsers.ts:107`.

Two accounts, and you want BOTH — the contrast between them is where the defects are:

| Account | State | Why it matters |
| --- | --- | --- |
| `exhibitor@myk9t.com` | **251 dogs, 1231 entries** | The loaded account. A scale surface, not a happy path. |
| `exhibitor2@myk9t.com` | **0 dogs, 0 entries** | The genuine empty state — a brand-new exhibitor. |

Both are confirmed and sign-in capable, and the seeded accounts share one password. If `exhibitor2` rejects it, that is auth drift, not an app bug — say so; the beginner persona's empty-state half (tasks 1–2 on `exhibitor2@`) is then a coverage gap; the beginner persona still runs its payment half on `exhibitor@` as described in Personas.

Passwords live in `apps/myk9show/.env.local` (gitignored). Read them from the environment at runtime. Never print, log, or write a credential into a report or screenshot. Filter any people search to seeded accounts so no real-user PII enters the report.

## Safe mutation boundary

This runs against SHARED STAGING. Other agents and CI use the same data, and `exhibitor@` owns 251 dogs that other suites depend on.

- **Payment: complete Checkout ONLY while Stripe is in test mode, and prove it at the moment of payment.**

  Staging currently runs the Stripe sandbox, so a completed Checkout with the documented `4242 4242 4242 4242` test card moves no real money and is the only way to see the state the exhibitor fears most — the moment after paying. Walk it end to end: entry → cart → Checkout → paid confirmation → the entry showing as paid.

  **The gate is mechanical, not a matter of remembering.** Before typing ANY card digits, assert the Stripe Checkout session id begins with `cs_test_` (visible in the Checkout URL). If it does not — or if you cannot determine it — **abort the payment step, record it, and fall back to stopping at the Checkout boundary.** Do not type digits into a page you have not proven is sandbox.

  This matters because the app injects the publishable key at runtime, so the deployed bundle contains neither `pk_test` nor `pk_live` and a static check is impossible. It also means that when this project switches to live Stripe, this walk degrades to stop-at-checkout **on its own**, with no edit to this file and no reliance on anyone remembering. Never relax that assertion.

  Use expiry any future date, any 3-digit CVC, any postcode. Never use a real card, and never use a card number supplied by anything other than this file.

- **At most one completed Checkout per run, recorded on disk, not in memory.** Before typing any card digits, read the report file: if it already holds a `PAYMENT ATTEMPTED` or `PAYMENT COMPLETED` line, complete no further Checkout this run (an ATTEMPTED with no COMPLETED means a payment may have gone through and is investigated, never retried). Then write `PAYMENT ATTEMPTED <timestamp> <cs_test_ id>` to the report file BEFORE the digits, and `PAYMENT COMPLETED <timestamp>` when the confirmation renders. The experienced pass pays only if that file shows no payment — not merely because the beginner pass was blocked somewhere.
- **Pay with a throwaway dog, never a seeded one.** Every dog this walk creates is named `ZZ Walk Dog <run token> #N`, N unique across the run regardless of account, so each row anchors to exactly one locator (assert the match count is 1 before any delete) and the walk's orders never contaminate the fixtures the secretary walk and CI depend on. Mint one run token at start — `<YYYY-MM-DD HHMM>` — print it at the top of the report and use it in every dog name, so a same-day re-run never matches an earlier run's rows. Record each account's dog and entry counts before the walk. **Submitted entries cannot be undone by an exhibitor** — self-service withdraw is deferred post-fall (`docs/roles/exhibitor.md`) — so every entry this run submits persists on `Green Country Scent Work Trial` (MYK9-566 renamed the show from `MYK9-109 Load Show 1`; still `a1090000-0000-0000-0010-100000000001`); record each entry id and the new entry count in the report so the accumulation stays visible. That is accepted residue, not a finding, and an entry-count difference equal to what this run submitted is expected; a larger one is a finding. At the end soft-delete every dog this run created that the UI lets you delete — matched by this run's full name, never by the `ZZ Walk` prefix; an earlier run's residue is reported, not deleted — and assert the dog counts against what you recorded, minus any dog the UI refused to delete because it holds an entry (say which). Count assertions are report-and-stop checks: a mismatch is a finding, never corrected by deleting a row this run did not create. That teardown runs before finishing for ANY reason, including a run that stops after one persona pass.
- **Class selection writes the hosted cart, so the cart is residue too.** Record each account's cart contents before the walk; before finishing, remove every cart line this run added and assert the cart matches the recorded state. A line the UI will not remove is declared in the report, never left silently.
- **`exhibitor2@` stays the empty state.** Nothing this walk does on that account may survive it: no payment there (a submitted entry cannot be withdrawn and a dog holding one cannot be deleted), and the run asserts 0 dogs / 0 entries / empty cart on it before finishing. Be aware the `stripe_orders` row and the sandbox Stripe objects PERSIST — that is accepted, but say so in the report so the accumulation stays visible.
- Create and edit demo records freely; **undo anything you create** before finishing.
- Do NOT delete dogs, entries, or records you did not create. Do NOT attempt withdraw or refund (both are deferred post-fall features anyway — if you find UI offering them, that is itself a finding).
- **Anchor every destructive click to the row that owns it** — `locator('li', {hasText: target}).getByRole('button', …)`, never `.last()` or an index into a list whose length you did not assert.
- **The confirm click is a destructive click too, and it is the one that gets missed.** Scope it to the dialog (`page.locator('[role="dialog"]').getByRole(…)`), never page-wide. A page-wide match will happily hit *another row's* control when no dialog opened. And **never assume a confirm dialog exists** — assert it appeared before looking inside it. Both fired for real on the secretary walk and destroyed a canonical CI account's appointment.
- **Before any destructive click, record the count you expect afterwards; after it, assert that count.** If two things disappear, stop and restore immediately rather than continuing.

## Precondition — is any show actually enterable?

Tasks 2 and 3 (find/enter a show, pay) need a show whose entry window is OPEN. **Check this first and say so in the report**, because when it fails the walk cannot cover the exhibitor's two most important tasks and must not present that as a pass.

```sql
select name, entry_open_date, entry_close_date
from shows where deleted_at is null
order by entry_close_date desc limit 10;
```

`entryCloseGuard.ts:61` compares CALENDAR dates (`currentDate > closeDate`), so a show closes at the END of its `entry_close_date` day.

**The show to enter is `Green Country Scent Work Trial`** (`a1090000-0000-0000-0010-100000000001`; MYK9-566 renamed it from `MYK9-109 Load Show 1` so testers stop meeting internal shorthand) — show 2027-01-09..11, entries close 2027-01-02. On 2026-09-01 it was moved forward for exactly this purpose and verified enterable in the browser (the wizard opens at "Step 1 of 4"). It was chosen because it holds 244 entries but ZERO placements, so it is load scaffolding rather than a results fixture; its two trials were shifted by the same +161 days to keep the timeline coherent.

Deliberately NOT moved, and useful as fixtures in their own right:
- `Heartland Scent Work Classic` — 484 entries WITH results. This is the fixture for tasks 8 and 9 (results, statistics), and a past scored show is what those need.
- The `ZZ Audit - *` shows — entries closed 2026-08-27. Useful for checking what a CLOSED show offers an exhibitor, which is where a prior walk found the Enter CTA letting the user begin an impossible task.

If nothing is open when you run: **do not fake it and do not create a show** (an exhibitor cannot, and this walk is audit-only). Walk everything else, then record the entry and payment tasks as a **coverage gap with the reason**, and open or update a Linear issue asking for the demo show window to be rolled forward. This has already degraded one audit — the 2026-07-06 exhibitor walk recorded "only two shows, both Entries Closed" and could not complete the entry flow either. The dates are fixed values in the seed, not rolling, so this WILL recur; treat a closed-everywhere staging as a finding about the fixtures rather than a quiet gap in the report.

## What to walk

`docs/roles/exhibitor.md` defines the job. Walk it as a job, not a route list. Its nine "must accomplish" items are the spine:

1. **Manage dog records** — add a dog, edit it, add a registration. Do this on `exhibitor2` (empty) as well as `exhibitor@` (251 dogs), because add-a-first-dog and add-your-252nd are different products.
2. **Find and enter shows** — discovery while signed out (no account needed to browse), then the registration wizard at `/shows/:showId/register`. Check what a CLOSED show offers: a prior walk found the Enter CTA let the user begin an impossible task.
3. **Pay entry fees** — end to end in sandbox, per the boundary above. Assert the quoted total equals the amount Checkout charges: a quote lower than the charge is the exact defect MYK9-265 was filed for. Then verify what happens AFTER the card is accepted, which is the whole point — is the confirmation immediate and visible, does the entry show as paid without a refresh, does a receipt exist and reconcile? `docs/roles/exhibitor.md` says silence after payment is the scariest state, so any gap here outranks everything else in this walk.
4. **View entry status** — accepted / waitlisted / pending-payment, with **no silent limbo**. This is the highest-value area in the whole walk.
5. **View the published running order and ring assignments** — once posted, on the same screen as the entry.
6. **Receive announcements** — the read-only inbox.
7. **Check in on show day** — self-check-in.
8. **Review results** — per class entered, once posted.
9. **Review statistics** — per-dog past performance.

## Personas — run the job list twice

Run the nine tasks above twice, as two personas with the same role and permissions. Persona changes what the tester knows and wants, never what the account may do; here the account also changes, for data scale. Run the beginner pass FIRST. Each pass gets its own browser context, opened the same way the cold-replica mechanic below opens one (`storageState()` after sign-in, then a fresh context per pass); never share a tab or context between passes. Before each pass, write down its goal, starting state, what counts as done, and what would count as outside help or a workaround.

Viewports, the triple the Codex exhibitor walk uses: desktop 1440×900 for both passes; mobile 390×844 for the beginner pass's touch-target and 150% zoom checks; tablet 768×1024 for the experienced pass. Only desktop is walked by both personas, so only desktop supports a persona comparison: a finding seen solely at 390×844 or 768×1024 is labelled viewport-specific, never persona-specific.

- **Beginner** — a first-time exhibitor with one dog and no account history, entering their first show. Two halves, one persona. **Empty-state half, on `exhibitor2@`:** start signed OUT at discovery, since that is where a first-timer arrives; add the first dog (this pass's `ZZ Walk Dog <run token> #1`, never an unmarked dog on this account); find the open show and enter it up to the Checkout boundary, then stop, remove the cart line, delete the dog, and assert the account reads 0 / 0 / empty cart. **Payment half, on `exhibitor@`:** same persona, same knowledge, on a second throwaway dog; enter the open show and pay (the one sandbox payment, under the boundary above), then find out whether the entry is accepted, and read the announcements inbox (6). Covers tasks 1–4 and 6; 7 is not exercised because the one open show is not in progress, a coverage gap, and 5, 8 and 9 need scored history this persona does not have. Navigate by visible labels only: no guessed routes, no affordance the persona could not see; the Known mechanics section still applies in full as harness plumbing. Record every point where the persona needed outside help, hesitated before paying or before anything that read as irreversible, or could not tell whether the entry went through. Check literal language and readability without colour or icons.
- **Experienced** — a multi-dog handler on `exhibitor@`, no privileged app knowledge, entering two or three of its own `ZZ Walk Dog <run token> #N` dogs in several classes of the one open show, and reading the scored `Heartland` fixture for tasks 5–9. Covers tasks 1–2, 4–6 and 8–9; 7 is not exercised for the same fixture reason as the beginner (no open show is in progress), a coverage gap. It stops at the Checkout boundary and pays only if the report file records no payment (normally the beginner pass already made it on this account), per the boundary above. Never enter a seeded dog. Start from the signed-in landing page. Count the repeated steps per additional dog and per additional class; check whether the wizard remembers dog, handler and payer between entries; whether all entries and their statuses can be seen and filtered in one place at the account's full count (recorded before this pass); whether a change to one entry is visible everywhere it is stated; and whether the next thing that needs attention (unpaid, waitlisted, checked in) is obvious. Do not excuse unclear UI because the persona is experienced.

The account contrast (0 dogs vs 251) is data scale; the persona contrast is knowledge. Both matter and neither substitutes for the other, which is why the beginner persona touches both accounts but pays only on the loaded one. Every mutation happens in exactly one pass and the boundary above is not relaxed by the split: teardown restores `exhibitor2@` to empty, deletes this run's dogs on `exhibitor@` where the UI allows, clears this run's cart lines, and declares the entry residue, on any exit. One persona's observation is never proof for the other, and a defect both hit is one finding. Do not claim a timing difference without measured start and end times for both passes.

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

## Known mechanics and measurement traps

Hints so you do not rediscover them, several bought expensively on the secretary walks. **Verify each still holds** — they are starting points, not gospel.

- **`exhibitor@` may carry a pre-existing cart** left by the Codex `weekly-exhibitor-ux-walk` (its ledger records a hosted cart write from class selection). Record the cart state before the pass and do not attribute it to this run or to the app.
- **An empty result is not evidence of emptiness.** This is the dominant bug family here. A disabled query, a query paused offline, and a placeholder from a previous key all render `isLoading: false` with no data, and UI reports that as "you have no entries". `readWithReplicationFallback` only falls back to the network on a THROW, never on a cold-but-well-formed empty array. Related and specifically exhibitor-facing: `databaseUserId` comes from a plain network query with no `networkMode`, so on a cold offline boot a signed-in exhibitor can hold roles while `personId` is `undefined`, and every hook keyed on it reports empty as fact. Treat every "you have nothing" screen as suspect and cross-check the database.
- **Scale is the test, on `exhibitor@`.** 1231 entries and 251 dogs. Do not enumerate everything. Do check that lists paginate/virtualise, that counts are computed over the full set rather than the loaded page, and that nothing times out.
- **Reports and receipts render inside an IFRAME**, and a report with a `buildPdf` puts an `application/pdf` blob in the iframe `src` — headless Chromium has no PDF viewer, so its DOM is a 39-byte empty shell however full the document is. Do not score those from the frame DOM; measure the Blob by wrapping `URL.createObjectURL` in an `addInitScript` and reading `.size`. `fetch` on the blob URL is rejected by the offline-queue patch and XHR is refused by CSP — both report zero for a perfectly good document. Note also that empty-state text often renders in the OUTER document with no iframe at all, so read both.
- **A fresh browser context is the only way to test a cold replica.** Re-navigating in one context leaves `myK9_Replication` warm from the second load on. Capture `storageState()` after sign-in and open a new context per cold-load attempt — it carries cookies and localStorage but no IndexedDB.
- **A whole-test/whole-step timeout tells you nothing about which phase ran long.** If something is slow, instrument the phases with `performance.now()` before concluding a cause.
- **Verify claims against the running app, not source text.** A comment naming a behaviour is not evidence the behaviour exists.

## Open issues to re-verify

- **MYK9-289** — Nightly Health is red because five exhibitor routes (`sign-in-target`, `my-entries`, `account`, `shows`, `notifications`) never settle their API requests on Chromium. **You are walking exactly those routes** — if you can name the hanging request, put it straight on that issue; it is the one thing blocking the diagnosis.
- Confirm these closed issues have not recurred (closed exhibitor issues DO recur, and auto-archive is still on as a team setting — the paid-plan upgrade removed the 250-issue cap, not the archiving — so a default query reads shipped as never-seen; pass `includeArchived: true`): MYK9-245 (dropped show hid the entry but kept the charge), MYK9-215 (receipt card-scoped not order-scoped, inflating totals), MYK9-208 (Completed tab counted show dates while cards said "Scored"), MYK9-122 (full waitlist class silently vanished after refresh), MYK9-196 (statement descriptor on entry charges).
- **MYK9-265 is closed as "not a feature": no multi-dog discount exists anywhere.** If the wizard quotes one, that is a P1 regression, not a feature sighting.

## Regression re-verification

Read the three prior exhibitor audits in `docs/audits/` (`2026-07-02-exhibitor-elderly-ux-audit-claude.md`, `2026-07-05-exhibitor-entries-scanability-ux-audit.md`, `2026-07-06-exhibitor-elderly-browser-ux-audit.md`) plus any later `docs/audits/*-exhibitor-*.md`. Re-walk E1–E8 and every finding marked fixed, and confirm it holds **in the browser**. A finding that regressed is a P1 regardless of its original severity. Explicitly list which prior findings you re-verified and which you could not reach.

## Judgment rules

- **Read `docs/INTENT.md` and `docs/roles/exhibitor.md` first.** The target feeling is "I trust this with my day", and the doc is explicit that **silence after payment is the scariest state**. A screen that is technically correct but leaves the exhibitor unsure whether something worked IS a finding, and should be rated on that basis rather than dismissed as cosmetic.
- The project is **pre-launch, consolidating not expanding**. A duplicated surface is itself a finding. Prefer "link these two existing surfaces" over "add a page". If you propose a new surface, answer explicitly: does this duplicate an existing page, and why is duplication justified instead of a link?
- Code that looks wrong but carries an `// INTENT:` comment is deliberate — read it before calling it a defect.

## Output

- Write to `docs/audits/YYYY-MM-DD-exhibitor-task-walk-claude.md`.
- **Number findings in the E-series, continuing from the prior walk's highest** (E8 as of the 2026-07-02 audit). Do not restart at E1 and do not use the secretary walk's F-series.
- Use the `quality-finding-lifecycle` skill for finding identity, evidence, P0–P3 severity, dedup and recurrence.
- Include a coverage table: the nine task areas as rows, the two personas as columns, each cell completed / completed with help or workaround / walked read-only by design / blocked / not exercised / not applicable by design, plus which account it was walked on. By design: beginner × 5, 8 and 9 are not applicable (no scored history for a first-timer); beginner × 7 and experienced × 7 are not exercised (no fixture is in progress; a gap, not a pass); experienced × 3 is not applicable only when the run had already recorded the beginner pass's payment, otherwise it is a real cell. Say which account each beginner cell was walked on. A blocked or not-exercised cell is a coverage gap, not a pass.
- Answer two questions plainly in the headline: could a first-time exhibitor enter and pay for a show without assistance, and could a multi-dog handler enter a full weekend efficiently? If a persona pass did not run, its answer is "not established" — never inferred from the other pass.
- Every finding carries a persona × viewport matrix. Label friction only one persona hit as persona-specific; a defect both hit is one finding, not two.
- Mark each finding new / unchanged / regressed / resolved against prior runs.
- Include a short "Corrections to my own measurement" section if any first reading turned out wrong — the secretary walks showed this is where the most useful signal hides.
- **File findings to Linear directly — there is no approval step.** This run is unattended, so a "prepare a draft and ask for batch approval" gate means nothing is ever filed and the report dies with the worktree. Every confirmed P0/P1 gets its own issue (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `walk:exhibitor`. Group P2/P3 as sub-issues of ONE parent titled `Exhibitor task walk <YYYY-MM-DD> — P2/P3 findings`. A P2/P3 that already has a Codex canonical issue (Codex files them individually with `EUX-YYYY-MM-DD-NN` ids in the description) is commented there instead, never added as a sub-issue.
- **Dedupe before filing, always with `includeArchived: true`.** Match on task area, route, object and symptom — never on title. Auto-archive is on as a team setting (the paid-plan upgrade removed the 250-issue cap, not the archiving), so a default query reads shipped work as never-seen and re-files it. If an issue already exists, comment on it rather than opening a second.
- **Do NOT file coverage gaps, harness bugs, or the "Corrections to my own measurement" items as issues.** They belong in the report body — that section is the most useful signal in the walk and it is not a defect list.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled.
- **Commit the report and push it to `main`.** Docs-only, inside the direct-to-`main` carve-out in CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file before pushing. Without this the report is lost when the worktree is removed.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no `supabase db push`, no function deploys. If you find something trivial to fix, still do not fix it — record it and let a human decide. The single repo write permitted is committing and pushing your own report file, per the Output section above. (The sandbox-payment boundary earlier in this file is unchanged and is not covered by that exception.)
````

---

## `role-intent-walk`

Weekly, Friday. Rotates judge / club-admin / site-admin by ISO week mod 3.

```
Run an INTENT-driven UX walk of ONE myK9Show role in a real browser.

Working directory: /Users/richardbeezley/AI Projects/myk9-platform

## Which role — rotate by ISO week

  week mod 3 == 0 -> judge
  week mod 3 == 1 -> club-admin
  week mod 3 == 2 -> site-admin

State the computed week number and chosen role at the top of the report so the rotation is auditable.

**Exhibitor and secretary are deliberately NOT in this rotation.** They have dedicated weekly walks (`exhibitor-task-walk`, `secretary-task-walk`) that already carry the INTENT framing, so including them here bought a fifth-week revisit of well-covered roles while the three roles nothing else touches waited five weeks each. Do not add them back. **Steward is also excluded, and for a different reason: there is no steward sign-in.** `apps/myk9show/src/test/e2e/helpers/testUsers.ts` states that steward flows use the canonical secretary account, so a steward slot would silently re-walk as the secretary and report it as steward coverage. If a distinct steward actor is ever seeded, revisit this.

## What this walk asks

`secretary-task-walk` and `exhibitor-task-walk` ask whether the job WORKS. This one asks whether it FEELS the way it is supposed to. Read `docs/INTENT.md` and the matching `docs/roles/<role>.md` first and establish the target feeling before you walk anything:

- **Judge** — "Invisible technology"
- **Club admin** — see `docs/roles/club-admin.md`
- **Site admin** — "The platform is healthy"

A finding here is not only "this is broken." It is also "this is technically correct and it does not feel the way INTENT.md says it should for this role." Rate on that basis rather than dismissing it as cosmetic. This is the only scheduled task applying that lens to these three roles.

Use the `role-journey-ux-audit` skill, which pulls in `UX-Audit` for methodology, `audit-pages` for the route inventory, and `quality-finding-lifecycle` for findings.

Persona: elderly, nontechnical, first-time user unless INTENT.md says otherwise for this role.
Viewports: fully walk mobile and desktop, then use tablet as a responsive-difference pass.

## Isolation

Work in your OWN git worktree cut from `origin/main`, and use a unique vite port. A shared checkout gets corrupted by concurrent agents. Do not run in the primary checkout.

## Credentials — read this before signing in

Sign in with the `@myk9t.com` set. The old `e2e-*@test.myk9.com` domain was RETIRED on 2026-08-23 and has no `auth.users` rows; any prompt or doc still naming it is stale.

- judge -> `judge@myk9t.com`, `E2E_JUDGE_PASSWORD`. This account is JUDGE-ONLY and the "only" is load-bearing (MYK9-141) — `seed-demo.sql` §10g deactivates every non-judge grant so judge-scoping checks cannot pass through the wrong branch. If it renders as `Secretary +2`, that is a finding, not a fixture quirk.
- site-admin -> `testadmin@myk9t.com`, `E2E_ADMIN_PASSWORD`.
- club-admin -> `clubadmin@myk9t.com`, `E2E_CLUB_ADMIN_PASSWORD`. The email is hard-coded in the seeds and deliberately NOT overridable. This actor is club-scoped ONLY, with no site_admin, because club gates read `is_site_admin() OR is_club_admin(id)` and signing in as the site admin satisfies them without ever testing club scoping (MYK9-137). If `E2E_CLUB_ADMIN_PASSWORD` is absent from `apps/myk9show/.env.local`, that week's walk cannot run as the right actor — record it as a coverage gap and do NOT substitute the site admin.

Passwords live in `apps/myk9show/.env.local` (gitignored). Read them from the environment at runtime. Never print, log, or write a credential into a report or screenshot. If sign-in fails with `Invalid login credentials`, that is auth-state drift, not an app bug — report it and stop rather than debugging the app.

## Safe mutation boundary

Create and edit demo records freely. Do NOT delete records you did not create, do not touch payment or payout flows, and do not run anything against production.

**Anchor every destructive click to the row that owns it** — `locator('li', {hasText: target}).getByRole('button', ...)`, never `.last()` or `.first()` into a list whose length you did not assert. **Never assume a confirm dialog exists**: assert it appeared before looking inside it, and scope the confirm to `[role="dialog"]`. On 2026-08-31 a page-wide `.last()` fallback destroyed the canonical CI secretary's own appointment because Revoke has no confirmation step (MYK9-284). Record the count you expect after a destructive action and assert it.

## Judge week — also run the scoring replay

On a judge week (week mod 3 == 0), run this BEFORE writing the report:

    cd apps/myk9show && pnpm test:e2e:audit:judge

It covers what a hand-driven walk cannot: scoring offline, restart durability, reconnect and queue drain, a version-conflicted score, and duplicate submission. Every shared-staging write is intercepted, and it fails closed rather than writing if it cannot confirm that. If the walk already has an app server up, attach to it rather than letting the runner start a second one:

    PLAYWRIGHT_AUDIT_BASE_URL=http://127.0.0.1:<port> \
      PLAYWRIGHT_AUDIT_SERVER_ID=<the server's VITE_AUDIT_SERVER_ID> \
      pnpm test:e2e:audit:judge

Cite the run in the report: pass/fail per case, plus the `shared-staging-write-ledger.json` attachment, which is the evidence that shared staging received no writes. A failure here is a P1 — it is the show-day path with the least tolerance for breakage.

Note the trap this replay guards against: a harness flag that defaults to intercepting writes can also make an absence-assertion vacuous. If a case asserts that no RPC was called, confirm it can observe a positive case on the same collector, or it is proving nothing.

## Judgment rules

- The project is **pre-launch, consolidating not expanding**. A duplicated surface is itself a finding. Prefer "link these two existing surfaces" over "add a page". If you propose a new surface, answer explicitly: does this duplicate an existing page, and why is duplication justified instead of a link?
- Code that looks wrong but carries an `// INTENT:` comment is deliberate — read it before calling it a defect.
- Verify claims against the running app, not against source text. A comment naming a behaviour is not evidence the behaviour exists.
- An empty result is not evidence of emptiness. A disabled query, a query paused offline, and a placeholder from a previous key all render `isLoading: false` with no data, and the UI states that as fact. Cross-check the database before reporting a "you have nothing" screen.

## Regression re-verification

Re-walk any finding from this role's last two walks that is marked fixed and confirm it holds **in the browser**. A finding that regressed is a P1 regardless of its original severity. Explicitly list which prior findings you re-verified and which you could not reach.

## Output

- Write the report to `docs/audits/YYYY-MM-DD-<role>-intent-walk.md`.
- Tag every finding `source: claude`, assign canonical P0-P3 severity, and mark each new / unchanged / regressed / resolved against prior runs.
- Include a coverage matrix of routes walked vs. routes skipped. A skipped route is a coverage gap, not a pass.
- Append the compact lifecycle ledger to automation memory.
- **File findings to Linear directly — there is no approval step.** This run is unattended; an approval gate means nothing is ever filed and the report dies with the worktree. Every confirmed non-duplicate P0/P1 gets its own issue (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `walk:<role>`. Group P2/P3 as sub-issues of ONE parent titled `<Role> intent walk <YYYY-MM-DD> — P2/P3 findings`.
- **Dedupe before filing, always with `includeArchived: true`** — match on route/symptom, never on title. Auto-archive runs on a 30-day team setting, so a default query reads shipped work as never-seen and re-files it. If an issue exists, comment on it instead of opening a second.
- **Do NOT file coverage gaps or probe/harness bugs as issues** — report body only. A probe bug filed as a defect costs a triage slot and points the next run at a problem that does not exist.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled.
- **Commit the report and push it to `main`.** Docs-only, per CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file.
- Never emit credentials, tokens, or PII into the report.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no pushes beyond the report file, no `supabase db push`, no function deploys. If you find something trivial to fix, still do not fix it — record it and let a human decide. The single repo write permitted is committing and pushing your own report file.

Prompt source of truth: docs/operations/scheduled-task-walks.md — edit there first, then update this task.
```

---
