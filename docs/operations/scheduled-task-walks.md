# Scheduled Task Walks — Secretary, Exhibitor, Role Intent

> **Status:** Reference

Version-controlled prompts for the three **walk** tasks. Edit here first, then push the change into
the live task at `~/.claude/scheduled-tasks/<taskId>/SKILL.md` — never edit only the live file, or
the two drift. That is not hypothetical: the judge scoring replay sat in
`scheduled-audits-claude.md` for weeks while the live prompt had no trace of it, so the strongest
reason to keep that task was documented but not running.

The fenced block for each walk below is the installed file minus its YAML frontmatter, byte for
byte. `pnpm qa:prompt-parity` checks that for these three walks and the three audit tasks in
[`scheduled-audits-claude.md`](scheduled-audits-claude.md); it is local-only, since the installed
files never reach CI.

## Why these are a separate file

[`scheduled-audits-claude.md`](scheduled-audits-claude.md) holds the Claude tasks paired against the
Codex nightly set, and its taxonomy is relative to Codex: *complements* run alongside a Codex task
to disagree with it, *substitutes* replace one while it is dark. These three fit neither. They have
no Codex counterpart and are not seeking a second opinion.

## The three walks, and the line between them

| Task | Roles | Asks |
| --- | --- | --- |
| `secretary-task-walk` | secretary | Does the job work end to end? |
| `exhibitor-task-walk` | exhibitor | Does the job work end to end? |
| `role-intent-walk` | judge, club-admin, site-admin | Does it *feel* the way INTENT.md says it should? |

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

## What is in these prompts that is not obvious

Most of the bulk is not instructions, it is **hard-won measurement mechanics** — the parts that took
a bad audit to learn. Preserve them on any edit:

- Reports render in an **iframe**, and any report with a `buildPdf` puts a PDF blob in the frame
  `src`. Headless Chromium has no PDF viewer, so a full sheet reads as a 39-byte empty shell. The
  Blob must be measured by wrapping `URL.createObjectURL`; `fetch` and XHR both report zero for a
  perfectly good document. Eleven UKC/ASCA forms are download-only and correctly render no preview.
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
pasted into a scheduler; change it everywhere or nowhere.

## Schedule

| Task                  | Cadence           | Time (local) | Enabled |
| --------------------- | ----------------- | ------------ | ------- |
| `secretary-task-walk` | Weekly, Wednesday | 3:05 AM      | yes     |
| `role-intent-walk`    | Weekly, Friday    | 3:00 AM      | **no** — needs one supervised run to grant browser-control approvals |
| `exhibitor-task-walk` | Weekly, Sunday    | 3:05 AM      | yes     |

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
- `claude-role-ux-walk` was retired on 2026-09-01 and replaced by `role-intent-walk`. Its
  deregistered `SKILL.md` may still be on disk at `~/.claude/scheduled-tasks/claude-role-ux-walk/`;
  it does not run. Delete it when convenient.

---

## `secretary-task-walk`

Weekly, Wednesday. Setup, entries, permissions, reports, money.

````
Run a FUNCTIONAL walk of the secretary's real task surface in a real browser, and write an audit report. **Nothing else walks the secretary.** `claude-role-ux-walk` was retired on 2026-09-01 and its replacement, `role-intent-walk`, rotates only through judge / club-admin / site-admin. So this walk carries both questions: the functional one — **does the secretary's job actually work end to end?** — and the INTENT lens in Judgment rules below.

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

## What to walk

Cover the secretary's task surface, not a route list. Prior walks found defects in every one of these:

1. **Show setup** — create a show through the wizard; judges and chairman pickers; entry open/close dates; class creation; day-of-show fee. **This is walkable end to end and you should walk it**: the teardown path is proven — the show header's `button[aria-label="More show actions"]` carries Delete, which soft-deletes the show and cascades to its trials and classes. Name the show so teardown cannot mistake it (`ZZ Walk <date> - teardown me`) and delete it before you finish. Check `club_id` persisted, and that naming officials wrote `show_officials` rows and **zero** `user_roles` rows — the label must grant nothing.
2. **Entries** — Entry Management on a show with a cold replication store; add a mail-in entry (including after entries close); check-in; move-up; run order; a dog with no registration number.
3. **Permissions** — the Show Access tab at `/club-admin/members` (pick a club first). Appoint a secretary who is a member of NO club, confirm the list shows them as "Not a club member", confirm they can reach and manage that club's shows, then revoke. Appointment is the only thing that grants access; the named official on a show is a label that grants nothing.
4. **Reports** — `/shows/:showId/reports`. Open EVERY report in the picker, not a sample. Two specific pins: the AKC Scent Work Entry Form must render (it was unreachable for months because it fetched its own data under `renderToStaticMarkup`), and it must print the show's named Trial Secretary and never the string `NaN`. Reports render inside an IFRAME — read the frame, not the outer document, or you will measure app chrome and report a false pass.
5. **Money** — entry fees, day-of-show fee, receipts vs. what the database records, refunds, "Paid online" labelling for non-card payments.
6. **Messages / communication** — composing scoped to a show, history filters.
7. **Waitlist and classes** — capacity cards, class judge display.

## Known mechanics

Hints from the 2026-08-31 run, to save you rediscovering them. **Verify each one
still holds** — they are starting points, not gospel, and a stale selector here
should be treated as a hint that changed, not a defect.

- **Routes.** Wizard: `/secretary/create-show/wizard`, reached from the secretary dashboard's **Add Show**. Entry Management: `/shows/:id/entry-management` (tabs Registrations / Exceptions). Show Desk: `/shows/:id/show-desk`, and it accepts `?focus=<classId>` — Run order and Move up appear only on a focused class. Messages: `/secretary/messages`. `/shows/:id/messages` and `/messages` are 404s.
- **Reports.** Drive the picker with `?report=<id>` (plus `&trialId=`/`&classId=`/`&dogId=`) rather than the dropdown, which is a Base UI select whose popup exposes no `role=option` nodes. The id list is `apps/myk9show/src/lib/reports/reportRegistry.ts`.
- **Reports render inside an IFRAME.** Read the frame, not the outer document. But note the empty-state message ("No entries found for this selection") renders in the OUTER document with **no iframe present at all** — so a frame-only read scores a false pass on exactly the failure you are hunting. Read both.
- **Reports that build a PDF are UNREADABLE in headless Chromium, and read as blank.** `ReportPreview` puts an `application/pdf` blob in the iframe `src` for every report with a `buildPdf` (Check-in Sheet, Running Order, Entry List, ...), and headless has no PDF viewer, so `contentDocument.body` is a 39-byte empty shell however full the sheet is. Reports without `buildPdf` (Show Catalog) write markup into the frame and read fine — which is why one report looks healthy and its neighbour looks broken. Do not score a PDF report from the frame DOM. Measure the Blob instead: `addInitScript` a wrapper around `URL.createObjectURL` that records `{type, size}`, then read `.size`. `fetch` on the blob URL fails (the offline queue patches `window.fetch`) and XHR is refused by the page CSP — both report zero for a perfectly good sheet. Calibrate with a small class: on show `dededede-...010`, the Check-in Sheet is ~4.2KB for a 3-entry class and ~13.2KB for a 63-entry one.

- **Eleven reports are download-only** (`pdfOnly: true` — the UKC and ASCA forms). They correctly render no preview and say "… is a downloadable form" with a Download button and a field-completeness warning. Do not score these as broken; measuring them for an embedded document reported 11 false failures in the first pass.
- **"Does it print the named official" is only answerable on a show that HAS `show_officials` rows.** On the big demo show, "Test Secretary" matches as a *handler* name in the entry data and yields six false positives. Query for a show with officials first.
- **Date pickers**: the accessible name is on the day BUTTON inside the gridcell, not the cell — `button[aria-label="Saturday, October 10th, 2026"]`. Month `<select>` values are 0-based.
- **Class selection in the wizard** is `div[role=checkbox]`, not `input[type=checkbox]` — use `getByRole('checkbox', …)`. They are keyboard-reachable (all carry a tabindex); that has been checked, do not re-file it.
- **`ShowDetailTabs` passes `canManageShow={false}` to `ShowMapTab` deliberately** (#291, public map is read-only). Not missing wiring.

## Open issues to re-verify

Confirm each in the browser and mark holds / regressed:

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
- Include a coverage table: task areas walked vs. skipped. A skipped area is a coverage gap, not a pass.
- Mark each finding new / unchanged / regressed / resolved against prior runs.
- **File findings to Linear directly — there is no approval step.** This run is unattended, so a "prepare a draft and ask for batch approval" gate means nothing is ever filed and the report dies with the worktree. Every confirmed P0/P1 gets its own issue (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `walk:secretary`. Group P2/P3 as sub-issues of ONE parent titled `Secretary task walk <YYYY-MM-DD> — P2/P3 findings` — that keeps the board readable while leaving each child closable on its own.
- **Dedupe before filing, always with `includeArchived: true`.** Match on task area, route, object and symptom — never on title. Auto-archive is on as a team setting (the paid-plan upgrade removed the 250-issue cap, not the archiving), so a default query reads shipped work as never-seen and re-files it. If an issue already exists, comment on it rather than opening a second.
- **Do NOT file coverage gaps, harness bugs, or corrections to your own measurement as issues.** They belong in the report body. MYK9-275 and MYK9-281 were both probe bugs filed as defects — each cost a triage slot and pointed the next run at an app problem that did not exist.
- **A failed Linear write is a reportable failure, never a silent skip.** Put the finding's full text at the top of the report and say plainly that it is unfiled, so it survives in the committed doc.
- **Commit the report and push it to `main`.** Docs-only, inside the direct-to-`main` carve-out in CLAUDE.md § Auto Mode. Verify the commit's filelist contains only the report file before pushing. Without this the report is lost when the worktree is removed.

## Hard constraint

**Audit only, with one exception.** No source edits, no PRs, no merges, no `supabase db push`, no function deploys. If you find something trivial to fix, still do not fix it — record it and let a human decide. The single repo write permitted is committing and pushing your own report file, per the Output section above.
````

---

## `exhibitor-task-walk`

Weekly, Sunday. Dogs, discovery, entry, money, status, show day, results.

````
Run a FUNCTIONAL walk of the exhibitor's real task surface in a real browser, and write an audit report. **Nothing else walks the exhibitor.** `claude-role-ux-walk` was retired on 2026-09-01 and its replacement, `role-intent-walk`, rotates only through judge / club-admin / site-admin. So this walk carries both questions: the functional one — **does the exhibitor's job actually work end to end?** — and the INTENT lens in Judgment rules below.

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

Both are confirmed and sign-in capable, and the seeded accounts share one password. If `exhibitor2` rejects it, that is auth drift, not an app bug — say so and continue with `exhibitor@` rather than debugging it.

Passwords live in `apps/myk9show/.env.local` (gitignored). Read them from the environment at runtime. Never print, log, or write a credential into a report or screenshot. Filter any people search to seeded accounts so no real-user PII enters the report.

## Safe mutation boundary

This runs against SHARED STAGING. Other agents and CI use the same data, and `exhibitor@` owns 251 dogs that other suites depend on.

- **Payment: complete Checkout ONLY while Stripe is in test mode, and prove it at the moment of payment.**

  Staging currently runs the Stripe sandbox, so a completed Checkout with the documented `4242 4242 4242 4242` test card moves no real money and is the only way to see the state the exhibitor fears most — the moment after paying. Walk it end to end: entry → cart → Checkout → paid confirmation → the entry showing as paid.

  **The gate is mechanical, not a matter of remembering.** Before typing ANY card digits, assert the Stripe Checkout session id begins with `cs_test_` (visible in the Checkout URL). If it does not — or if you cannot determine it — **abort the payment step, record it, and fall back to stopping at the Checkout boundary.** Do not type digits into a page you have not proven is sandbox.

  This matters because the app injects the publishable key at runtime, so the deployed bundle contains neither `pk_test` nor `pk_live` and a static check is impossible. It also means that when this project switches to live Stripe, this walk degrades to stop-at-checkout **on its own**, with no edit to this file and no reliance on anyone remembering. Never relax that assertion.

  Use expiry any future date, any 3-digit CVC, any postcode. Never use a real card, and never use a card number supplied by anything other than this file.

- **Pay with a throwaway dog, never a seeded one.** Create a dog named `ZZ Walk Dog <date>` for the entry you pay for, so the walk's paid orders are identifiable and never contaminate the fixtures the secretary walk and CI depend on. Soft-delete the entry and dog at the end. Be aware the `stripe_orders` row and the sandbox Stripe objects PERSIST — that is accepted, but say so in the report so the accumulation stays visible.
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

**The show to enter is `MYK9-109 Load Show 1`** (`a1090000-0000-0000-0010-100000000001`) — show 2027-01-09..11, entries close 2027-01-02. On 2026-09-01 it was moved forward for exactly this purpose and verified enterable in the browser (the wizard opens at "Step 1 of 4"). It was chosen because it holds 244 entries but ZERO placements, so it is load scaffolding rather than a results fixture; its two trials were shifted by the same +161 days to keep the timeline coherent.

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
- Include a coverage table: the nine task areas above, walked vs. skipped, and which account each was walked on. A skipped area is a coverage gap, not a pass.
- Mark each finding new / unchanged / regressed / resolved against prior runs.
- Include a short "Corrections to my own measurement" section if any first reading turned out wrong — the secretary walks showed this is where the most useful signal hides.
- **File findings to Linear directly — there is no approval step.** This run is unattended, so a "prepare a draft and ask for batch approval" gate means nothing is ever filed and the report dies with the worktree. Every confirmed P0/P1 gets its own issue (team **MyK9-platform**), labelled `p0`/`p1`, `source:claude`, `walk:exhibitor`. Group P2/P3 as sub-issues of ONE parent titled `Exhibitor task walk <YYYY-MM-DD> — P2/P3 findings`.
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

````
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
````

---
