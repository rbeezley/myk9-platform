# Secretary Task Walk — Findings

> **Status:** Active — Checkpoint A complete (Tasks 1–2 of 19)

Live browser walk of the show secretary's common tasks, performed as
`secretary@myk9t.com` against the shared staging database via a local dev server.
Audit-only: findings are recorded, not fixed.

- **Audit show:** `ZZ Audit - Secretary Task Walk` — `e8675466-b637-4632-b65a-b7bc7eec21f1`
  (AKC, Heartland Scent Work Club, Aug 28–29 2026, 1 trial, 2 classes, published).
- **Comparison show:** `Heartland Scent Work Classic` — `dededede-0000-0000-0000-000000000010` (514 registrations).
- **Method:** step-driven Playwright explorer; accessibility snapshot, console errors,
  and REST responses captured after every step.

## Deploy state

`20260828200000_secretary_payment_bookkeeping.sql` and
`20260828210000_require_dog_registration_for_entries.sql` were pushed to
`sojmvhhwsjxmfistvzbe` on 2026-08-28. Verified against the applied database, not the
migration text:

| Check | Result |
| --- | --- |
| New columns on `public.entries` | 3 present |
| New columns on `view_authenticated_entry_results` | 3 present |
| View `reloptions` | `{security_invoker=false}` — **preserved** |
| View SELECT: authenticated / anon | granted / denied |
| `authenticated` column SELECT on the new entries columns | denied (by design — reads go through the view) |
| `authenticated` table INSERT/UPDATE on entries | retained |
| anon's readable `entries` columns | **still exactly 15** — the board boundary survived |
| `trg_entries_require_dog_registration` | present |
| Organization normalisation | `AKC (American Kennel Club)` → `AKC`, matches plain `AKC`; UKC likewise |
| Entry Management after the push | renders, 0 × 4xx |

The trigger's own write path could not be exercised from here — the MCP connection is
read-only, and the wizard's client guard blocks before the server is reached. The
behavioural SQL test remains CI-first.

### Immediate consequence on staging

With the trigger live and existing data deliberately left alone, **1 of 259 dogs can
be entered in an AKC trial** (Tera) and 1 in a UKC trial. Every other dog is now
refused at the database. This is the chosen behaviour, not a defect, but it blocks
demo, QA and any e2e spec that creates an entry until the dogs carry registration
numbers. `seed-demo.sql` fixes this on the next reseed; current staging rows are not
backfilled.

## Severity

| | Meaning |
| --- | --- |
| P1 | Blocks a secretary from completing a required task. |
| P2 | Task completable, but with real friction, a trap, or misleading information. |
| P3 | Polish, copy, accessibility, or developer-experience. |

## Findings

### F1 — P1 — FIXED — Entry Management is dead on any show with a cold replication store

Opening Entry Management on the freshly created audit show renders
**"Couldn't load entries"**; the show workbench header shows **"Total Entries
Unavailable — Couldn't load entry counts."** Five REST calls return
`403 {"code":"42501","message":"permission denied for table entries"}`.
Still failing after 45s and an explicit **Retry** — it does not self-heal.

The same page on the Heartland show works perfectly (0 errors, 514 registrations),
which is what makes this easy to miss: it only reproduces when the replication
store is cold.

Mechanism — two read paths that have drifted apart:

- `services/database/entries/secretary.ts:73` reads replicated entries first;
  when `result.isColdStore` is true it falls through to
  `postgrestGetSecretaryEntriesForShow(...)` at `:96`.
- That fallback uses `SECRETARY_ENTRIES_BASE_SELECT`
  (`services/database/entries/secretaryPostgrest.ts:12`), which requests
  `result_status`, `search_time_seconds`, `total_faults`, `final_placement`,
  `judge_notes`, `disqualification_reason`.
- `public.entries` has **no table-level SELECT** for `authenticated` (54
  column-level grants instead), and none of those six columns is granted.
  PostgREST therefore rejects the whole request.

So the fallback fires exactly when the secretary most needs it — a brand-new show,
a new device, or cleared storage — and is guaranteed to fail. The working path
(`AUTHENTICATED_ENTRY_READ_COLUMNS`) stays inside the allowlist.

This is the "dual-path reads must match SELECT *and* WHERE" trap, one layer down:
the paths diverged on columns the grant allowlist forbids.

**Blocks:** mail-in entry, waitlist, payments/refunds — Tasks 3, 13, 14 — on the audit show.

**Fix applied.** `postgrestGetSecretaryEntriesForShow` now reads
`view_authenticated_entry_results` — the same relation `ReplicatedEntriesTable`
pulls — so both secretary read paths agree on columns as well as rows. The view's
row gate includes `access.can_manage`, so a managing secretary sees their whole
show including unreleased results; there is no false-empty risk.

The view does not carry the pull/refund bookkeeping (`withdrawn_at`,
`refund_decision`, `refund_decided_at`), so those are merged in from
`postgrestGetSecretaryPullMetadataMap`, which reads `entries` using only
allowlisted columns — mirroring what the replicated path already did. Without the
merge every scratched entry would have read as "no saved decision" and invited a
duplicate refund. The pre-migration retry guard moved with those columns.

*Verified:* audit show Entry Management renders "No entries yet" with the real
trial filter and **zero 4xx** (was 5×403); workbench header reads "Total Entries 0"
instead of "Unavailable"; Heartland unchanged at 514 registrations / 3 needs-review,
also zero 4xx. 347 unit tests pass across 42 files, `typecheck` clean,
`qa:code-quality-ratchet` clean, `lint` 0 errors.

*Guard:* `src/test/database/secretaryEntriesFallbackGrantContract.test.ts` fails if
any `.from('entries')` select in that module requests a revoked scored column, or
if the fallback stops reading the view. Confirmed non-vacuous — all three
assertions fail when the fix is reverted.

### F2 — P2 — FIXED (#1858) — `.env.local` points secretary e2e runs at a deleted account

`E2E_SECRETARY_EMAIL=e2e-secretary@test.myk9.com` has **no `auth.users` row**, so
every local secretary sign-in fails with `Invalid login credentials`. The code
default in `src/test/e2e/helpers/testUsers.ts` (`secretary@myk9t.com`) is correct
and authenticates; the env override breaks it. Note `Invalid login credentials`
is returned identically for absent-user and wrong-password, so this reads as a
password-rotation problem when it is not.

This also inverts what `project_staging_named_accounts_no_auth` records (that memory
says the `e2e-*` accounts work and the named ones do not; the reverse is now true).

### F3 — P2 — Escape in the show wizard threatens to discard the show

Pressing **Escape** anywhere in the create-show wizard — with no popover open —
raises an `Unsaved Changes` alertdialog: *"You have unsaved changes that will be
lost. Are you sure you want to leave the wizard?"* with **Keep Editing** /
**Leave Wizard**. Escape is the universal dismiss key, and the natural reflex after
opening the club or judge picker. Recoverable, but alarming, and it hides the form.

### F4 — P2 — Judges can only be assigned if they were added on Step 1

Step 3 shows a per-class judge dropdown **only when judges were added via the
optional, unstarred "Show Judges" field on Step 1**. Skip that field and Step 3
offers no way to assign a judge, and Review reports **"Judges Assigned 0/0"** while
listing every class as `Judge: Unassigned`. The wizard still declares
"Show Configuration Complete" and offers **Create & Publish**.

With a judge added, it works well — Step 3 auto-assigned the single judge to both classes.

*Documentation impact:* `docs/user-guides/secretary-guide.md` §2 step 4 tells the
secretary to "assign a judge to each class" on Step 3 without mentioning the Step 1
prerequisite, so following the guide literally produces a show with no judges.

### F5 — P2 — FIXED (#1858) — "Judges Assigned n/n" counts the wrong thing

The Review summary tile counts **judges used / judges added**, not classes covered.
Two classes both assigned to one judge reads `1/1`; zero judges added with two
unassigned classes reads `0/0` — which looks complete. The adjacent line
("2 Classes 0 Assigned") is correct, so the page contradicts itself.

### F6 — P2 — FIXED (#1858) — Entry-close default time makes same-day close always invalid

The wizard enforces *"Entry close date must be on or before the show start date."*
The entry-period picker defaults the close time to **11:59 PM** while the show start
defaults to **8:00 AM**, so choosing the show's own start date as the entry-close
date — normal for a day-of-entry show — always violates the rule. The time control
is inside the date popover, so the fix is not where the error is shown.

### F7 — P3 — MOSTLY FIXED ELSEWHERE — Judge and chairman pickers were not exposed as lists

Accurate when observed, and largely resolved by someone else the same day.

The walk found both pickers rendering rows as bare `<div>`s inside a `role="dialog"`
popover — no `option`/`listitem` role, nothing keyboard-navigable, the person's name
not a leaf node. `git log -S 'role="option"'` on
`components/ui/grouped-searchable-popover.tsx` returns exactly one commit: `8b8868f33`,
[#1845](https://github.com/rbeezley/myk9-platform/pull/1845), merged **2026-08-28** —
the day of the walk. It added `role="listbox"`, `role="option"`, `tabIndex={0}` and
Enter/Space activation. My snapshot predates it.

Checked before changing anything, because F29 had just taught me what happens when I
do not.

**Residual, and it is real:** the listbox had no `aria-selected`. An ARIA listbox
option carries its chosen state there, so a screen reader could enumerate the choices
but never say which one was in effect — for a role the audit elsewhere describes as
low-computer-savviness volunteers, that is the half that matters. Both pickers now
pass their selection (`selectedItemIds`), single-select for chairman/secretary and
multi-select for judges. The prop is optional: a picker tracking no persistent
selection omits the attribute entirely rather than announcing a misleading
"not selected".

### F8 — P3 — Chairman picker lists every person on the platform

The Show Chairman picker shows "All People" — other clubs' secretaries, exhibitors,
admins — with no club-member grouping. A search box exists. The judge picker does
this better: it splits "Qualified Judges: Credentials on File" from
"All People: No Credentials Yet" with a *Tap to add credentials* affordance.

### F9 — P3 — FIXED (#1858) — "1 classes"

Step 3, Detective element. Missing singular form.

### F10 — P3 — FIXED (#1858) — Playwright failure artifacts capture the password in plaintext

`test-results/**/error-context.md` records the accessibility snapshot including the
filled password field's value. These artifacts persist locally and are uploaded by
CI on failure.

### F11 — P3 — FIXED (#1858) — Root `playwright.config.ts` cannot load from a worktree

The root config imports `@playwright/test`, which the root workspace does not
declare; it resolves in the main checkout only by hoisting accident. In a fresh
worktree after `scripts/bootstrap-worktree.sh`, loading it fails with
`Cannot find module '@playwright/test'`.

### F12 — P2 — Reassigning a class judge needs a judge added at show level first

The class **Edit** dialog's Judge dropdown offers only judges already attached to the
show (here: `Test Judge` and `TBD`), so a secretary who needs a different judge finds
no way forward from the dialog they are standing in. The judge must first be added
via **More show actions → Edit → Judges tab**, after which the dropdown offers them.
Both halves work; nothing in the class dialog points at the other half.

### F13 — P3 — FIXED (#1858) — Judge option label renders empty placeholders

The class Edit dropdown lists the judge as `Test Judge( - )` — a template emitting
its separator and parentheses with no values to put in them.

### F14 — P1 — FIXED — "Add mail-in entry" is a dead end once entries close

Entry Management → **Add entry** → **Add mail-in entry** routes to
`/secretary/register/:showId`, the exhibitor registration wizard, which enforces the
exhibitor entry-close gate and stops the secretary with:

> This show is no longer accepting normal online entries. Entries are closed for
> this show. **Contact the trial secretary for late-entry help.**

The secretary *is* the trial secretary — the app tells them to contact themselves.
This bites exactly when mail-in work is most common: checks that arrive after the
close date, and day-of paperwork.

The working path is **Show Desk → Tools → Late entry → Add late entry**, which opens
the same wizard with `?entryMode=late` and bypasses the gate. Nothing in Entry
Management points at it, and Entry Management is the canonical entries surface.

Note the Tools panel offers *both* "Add mail-in entry" (blocked) and "Add late entry"
(works) side by side, with no indication that one of them will refuse.

**Fix applied.** `getEntryCloseSubmitBlocker` now exempts organizer workflows
(`workflowMode !== 'exhibitor'`), mirroring `getEntryOpenSubmitBlocker`. The
asymmetry was the whole bug: the open gate already exempted RBAC-derived organizers
and deliberately refused to trust the URL flag, while the close gate did the reverse —
trusting only `?source=show-desk&entryMode=late` and never exempting the secretary.

That also closes a hole the open gate's own comment had already named: the flag "any
exhibitor can append" was the *only* way past the close gate, so appending it bought a
self-service entry after the deadline. `isLateEntryMode` is no longer honoured alone;
every legitimate late-entry caller is an organizer, which the RBAC check covers.

*Verified:* Entry Management → Add entry → Add mail-in entry now opens Step 1 (Select
Dogs) on a show whose entries closed, with no `entryMode=late` in the URL. Two new
guard tests: a secretary is not blocked after close without the flag, and an exhibitor
IS blocked after close even with it. 18 guard tests pass.

### F15 — P1 — FIXED — A blank Day-of-Show Fee charges $0 for every entry once the show starts

`getShowEntryFee` (`components/shows/RegistrationWorkflow/PaymentStep/utils.ts:69`):

```ts
if (now >= showStart && show.dayOfShowFee) {
  const dayFee = parseFloat(show.dayOfShowFee.replace(/[$,]/g, ''));
  if (!isNaN(dayFee) && dayFee >= 0) return dayFee;
}
```

Leaving **Day-of-Show Fee** blank in the creation wizard stores `"0.00"`, not NULL.
That string is truthy, parses to `0`, and satisfies `dayFee >= 0` — so from the show's
start date onward it *overrides* the pre-entry fee and every class prices at zero.

Walked end to end on the audit show (pre-entry fee $30.00, day-of fee blank, starts
today): the Classes step shows `Container $0/class`, the Payment step shows
`Subtotal $0.00 / Total Due $0.00 / Amount Due: $0.00`, and the submitted entry is
stored `entry_fee 0.00` with `payment_status paid` — so nothing downstream will ever
flag it as owing money.

An unset day-of fee should mean "no day-of tier, use the pre-entry fee", not "free".
The demo show masks this by having a $35.00 day-of fee set.

Related: `ClassSelectionStep.tsx:137` calls `getClassFee(show, { entryFee: undefined })`
and reuses one `defaultFee` for every element, so per-class `entry_fee` (correctly
$30.00 in the database) is never consulted at all. Left as-is — with the tier fixed
the show-level fee is correct, and honouring per-class overrides is a separate
decision the code comments already flag as needing a `feeOverride` flag.

**Fix applied.** `dayFee >= 0` -> `dayFee > 0`, so zero means "no day-of tier" and the
pre-entry fee applies. A blank field persists as `"0.00"` rather than NULL, so there is
nothing else to separate "unset" from "deliberately free" — and a day-of tier exists to
charge more, never nothing. Fixing it in the read path also repairs every show already
carrying `0.00`, which a write-side fix would not.

*Verified:* Classes step now reads `Container $30/class` / `Interior $30/class`, and a
walked late entry shows `Tera Interior Novice A $30.00`, `Subtotal $30.00`,
`Total Due $30.00`, `Amount Due: $30.00` (was $0.00 throughout). 201 registration tests
pass, typecheck / ratchet / lint clean.

*Guard:* two tests in `PaymentStep/__tests__/utils.test.ts` — an unset (`"0.00"`) day-of
fee falls back to pre-entry, and a genuinely lower positive day-of fee (`$10` under a
`$30` pre-entry) still wins, so the fix cannot be over-applied to all low fees. The
first fails (`+0` vs `30`) without the change.

### F16 — P1 — FIXED AND DEPLOYED — The mail-in check number and payment date are discarded

The Payment step offers **Secretary Payment (Already Received)** with *Payment Date*,
*Reference/Receipt #*, and *Payment Notes* — exactly the mail-in bookkeeping the role
requires. Of the three, only the notes survive, and they land in the wrong column.

`submitOfflineLateEntry.ts:174` writes `paymentDetails.paymentNotes` into
`entries.special_requests`, and reads nothing else off `paymentDetails`. The walked
entry stored `special_requests = 'Mail-in check, audit walk'`; the reference
`CHK-1042` and the payment date are dropped on the floor. `special_requests` is the
exhibitor-facing "special requests" field, which is the wrong home for payment
bookkeeping and can surface on ring paperwork.

`public.entries` has no `payment_reference`, `payment_date`, or `payment_notes`
column — only the refund-side `refund_notes` / `refund_decided_at`. So there is
nowhere for a check number to go today.

The `registration_id` / `enrollments` path is not the intended home either: **0 of
514** Heartland entries carry a `registration_id`, and the column has no foreign key
at all, so nothing on the platform populates it. The receipt's
"Confirmation # LOCAL-7619998A" is likewise the entry's own UUID prefix rendered
client-side, not a server-issued number.

The check number a secretary types is therefore unrecoverable, which defeats
"record check number, amount paid, and outstanding balances for mail-in entries."

**Fixed. Migration applied to staging 2026-08-28.**

`supabase/migrations/20260828200000_secretary_payment_bookkeeping.sql` adds
`payment_reference`, `payment_received_on`, and `payment_notes` to `public.entries`
and rebuilds `view_authenticated_entry_results` to expose them behind the existing
`can_view_admin` mask, restating `WITH (security_invoker = false)` inline.

Deliberately **no grant on `entries`** for the new columns: reads reach them through
the owner-run view (which needs no base-table column privilege), and `authenticated`
already holds table-level INSERT/UPDATE covering new columns — so the column
allowlist is not widened for a reader that does not exist. Deliberately **no anon
REVOKE on `entries`** either: `anonEntriesGrantContract` conservatively treats *any*
revoke naming anon on that table as clearing the whole folded allowlist, so a
belt-and-braces revoke would read as wiping the 15-column board boundary. The
standalone view grant carries an explicit anon decision instead.

Client side: `submitOfflineLateEntry` writes the three fields and no longer
overwrites `special_requests`; `SecretaryEntry`, the fallback select, and the
replication mapper all carry them so both read paths still match.

Because the migration is not applied, the read **degrades**: it asks for the payment
columns, and on `42703` retries without them (`isSecretaryPaymentSchemaUnavailable`,
mirroring the existing pull-refund compatibility shim). So the branch is safe against
today's database and self-heals once the migration lands.

*Not yet done:* the stored reference is not surfaced in the Entry Management UI —
that needs the entry view-model threaded through, and is a follow-up.

*Verified:* 1415 unit tests pass (including the DB contract suite, 730 tests, which
initially rejected two earlier drafts of this migration); typecheck, ratchet and lint
clean. A unit test proves the pre-migration retry drops the payment columns without
dropping the scored columns the reports need.

*Deploy order:* push the migration BEFORE deploying the app, then re-run
`generate_typescript_types` — `ReplicatedEntriesTable.mapper.ts` reads the new
columns through a defensive accessor precisely because the generated row type cannot
know them yet.

### F21 — P2 — FIXED — A dog can be entered with no registration number by any path but the wizard

`registrationPrerequisite.ts` correctly blocks class selection when the dog has no
registration for the show's registry, and carves out only conformation puppy classes.
That gate is **client-side only**: `public.entries` carries 17 triggers and none
checks registration, and there is no constraint.

Staging shows the consequence — **2 of 259** dogs have a registration row, and
**1270 of 1271** entries are for dogs with none (seeded straight into the database).
A downstream backstop exists (`buildEntryBlankProps` sets `missingRegistration`, and
`MissingRegistrationNotice` warns "before mailing"), so the invariant is advisory
rather than enforced.

Owner decision (2026-08-28): the registration number **should be required** — an
entry without one occupies a capacity spot that cannot compete on show day. Hard
block at entry creation; existing rows left alone and the seed fixed going forward.

**Enforcement applied to staging 2026-08-28** —
`supabase/migrations/20260828210000_require_dog_registration_for_entries.sql`.

A `BEFORE INSERT` trigger on `public.entries` rejects a dog with no registration
number for the **trial's** registry (`trials.registry_id`, defaulting to AKC — a show
can host AKC, UKC and ASCA trials side by side, as the demo show does, so a
show-level check would be wrong). It mirrors `registrationPrerequisite.ts`,
including the conformation-puppy carve-out, and reuses the client's organization
normalisation via a new `public.normalize_registry_organization(text)` so
`'AKC (American Kennel Club)'` still matches registry `'AKC'` — an exact-string
match would reject most real registrations.

`SECURITY DEFINER` is required rather than incidental: `dog_registrations` is
RLS-protected, so a secretary entering someone else's dog would otherwise read zero
rows and be rejected for a registration that exists. The function returns only a
pass/fail.

Scope, stated so it is not mistaken for an oversight:

- **INSERT only.** Existing rows are untouched and UPDATE is unguarded, so move-ups
  and status changes on the 1270 legacy entries keep working — but a move-up can
  still re-point a legacy entry at another class while carrying no number.
- **`seed-demo.sql` updated** — it previously inserted no `dog_registrations` at all,
  so the first entry insert of any reseed would now fail. An idempotent backfill runs
  after each of the three dog blocks (6 demo dogs plus two generated load sets).
- **Risk to watch on deploy:** the offline replication queue writes entries directly.
  If a queued entry somehow lacks a number, the sync now fails with `23514` and will
  retry. The wizard blocks first, so this should be unreachable — but it is the
  failure mode to watch when the migration lands.

*Verified:* 1415 unit tests, the 730-test DB contract suite (which rejected two
earlier drafts of these migrations for missing anon grant decisions), typecheck,
ratchet and lint all clean.

*NOT verified:* `supabase/tests/entry_requires_dog_registration_test.sql` — six cases
covering rejection, registry scoping, naming drift, the puppy exception and a blank
number — **has never executed.** Behavioural SQL tests need a container runtime this
machine does not have, so CI is their first real run. It is registered in both
`scripts/qa/run-behavioral-sql-tests.sh` and `run-behavioral-sql-tests.test.ts`;
that registration is checked and passing, which proves only that it is on the list.

### F17 — P3 — FIXED (#1858) — Secretary entry wizard links to the exhibitor guide

The **Help** link on `/secretary/register/:showId` points at
`help.myk9show.com/guides/exhibitor-guide` even in the secretary's mail-in and
late-entry modes.

### F18 — P2 — Every paid entry is labelled "Paid online", including checks

`mapPaymentStatus` (`utils/entryManagementUtils.ts:31`) maps the generic database
status `'paid'` onto `PaymentStatus.PAID_ONLINE`, discarding `payment_method`
entirely:

```ts
case 'paid':
case PaymentStatus.PAID_ONLINE:
  return PaymentStatus.PAID_ONLINE;
```

The walked mail-in entry is stored `payment_method = 'secretary_paid'`,
`payment_status = 'paid'` — and Entry Management renders it **"Paid online"**.
`paymentLabel` in `EntryRegistrationQueue.tsx:68` has correct branches for
`Paid by check` / `Paid by cash`, but they are unreachable for any entry whose
status is the generic `'paid'`.

A secretary reconciling mail-in checks against the Stripe payout therefore cannot
tell the two apart on the list, and the row asserts a payment channel that did not
happen. The truth is on `entries.payment_method`, which the label never consults.

### F19 — P3 — FIXED (#1858) — Filter chips do not expose their selected state (several pages)

`Needs review` / `Missing information` / `Payment due` / `All registrations` carry no
`aria-pressed` or `aria-selected`, so assistive tech cannot tell which queue is
active. The consequence is visible even to a sighted user: a show with one entry
lands on the `Needs review` queue and reads "No matching registrations" while the
chip beside it says "All registrations 1", with nothing indicating which filter is
responsible. (`?queue=all` shows the row correctly, so the filtering itself is fine.)

The Exceptions sub-tabs (`Move-ups` / `Pulls / scratches` / `Waitlist`) *do* expose
`[pressed]`, so this is an inconsistency within the same page.

The Show Map filters behave the same way: `Today` / `Tomorrow` / `All dates` and
`Active` / `Completed` / `All` carry no pressed state. This cost real time during the
walk — a scored class vanished from the tree while the header still said "2 Classes",
and only clicking `Completed` revealed that the default `Active` filter was hiding it.
Manage Classes gets it right (`2 Total Classes [pressed]`), so the app is
inconsistent with itself in three places.

### F20 — P3 — FIXED (#1858) — Waitlist capacity cards are headed by the judge's name

Waitlist Management lists capacity cards titled "Richard Beezley" and "Test Judge"
with a date and "1 / 125 entries". This is the judge-day capacity model working as
designed, but nothing on the card says the name is a *judge*, so it reads as an
exhibitor with 125 entries.

### F22 — P2 — "Messages" is history-only; composing lives somewhere else

`/secretary/messages` is titled **Communication History** and has no compose control
— only a show filter and Messages / Email delivery views. The composer lives in the
**Message Center panel** opened from the header button (`MessageCenterPanel` →
**Compose**). A secretary told to "email the exhibitors" goes to Messages, finds
nothing to click, and has no pointer to the panel.

Entry Management does not help either: its **Bulk actions** menu offers only
*Accept selected* and *Reject selected*, and the per-registration detail shows only
"No decision email sent yet" — decision emails are lifecycle-triggered, not composed.

The composer itself is good once found: *"Send a show message to everyone, a class,
or checked-in exhibitors."*

### F23 — P2 — The composer does not inherit the show you opened it from

Opening **Message Center → Compose** while standing on a show's Show Desk leaves the
Show field at "Select a show" and blocks with "Select a show to continue." The role
doc explicitly lists "manually copying data between screens" as something the
secretary should never have to do; the context is already on screen.

### F24 — P3 — Other clubs' show names appear in the Communication History filter

The show filter lists **MYK9-109 Load Show 1/2/3**, which belong to Load Clubs 1, 2
and 3. This secretary holds `user_roles` only for Heartland, and the dashboard
correctly shows one show — so the filter is not club-scoped.

Selecting one renders "No messages in MYK9-109 Load Show 1 yet." **This does not prove
message content is isolated:** all three load shows have zero messages, so the empty
result is unsurprising either way. What is demonstrated is that show names and their
existence leak across clubs; whether content would leak is untested.

### F25 — P1 — FIXED — Switching report type can leave the previous PDF on screen, and Print prints it

`ReportPreview` has two rendering paths. Check-in Sheet and Score Sheet build a real
PDF and set `iframe.src = URL.createObjectURL(blob)`
(`ReportsPage/ReportPreview.tsx:166`). Every other report builds HTML and injects it
with `iframe.contentDocument.open()/write()/close()` (`:294`).

The PDF effect early-returns without clearing the frame:

```ts
if (!iframe || !pdfResult?.bytes) return;   // iframe.src still points at the old PDF
```

So when the secretary moves from Score Sheet to a markup report, `iframe.src` still
holds the previous PDF blob. Writing to `contentDocument` of a frame that is
displaying a PDF does nothing — the plugin owns the frame — so the **old document
stays on screen with no error**.

Measured on the demo show (blob id in the iframe `src`):

| Selection | Preview blob | Result |
| --- | --- | --- |
| Check-in Sheet (default) | `2ad8e339` | — |
| Score Sheet | `2620ef8e` | regenerated correctly |
| Show Catalog | `2620ef8e` | **stale — still the Score Sheet** |
| Results Sheet | `2620ef8e` | **stale — still the Score Sheet** |
| Armband Labels | `""` | preview blanked |

Not a timing artefact: traced for 60s on a show with a single entry, and the `src`
never changes.

`handlePrint` prints that same frame (`printIframe(iframeRef)`, `index.tsx:250`), so
the secretary selects "Trial Secretary Report", sees a rendered document, prints —
and gets the Score Sheet. The surrounding code takes real care not to print an empty
report ("the secretary gets a roster with no dogs on it"); this case defeats that
guard, because the frame is not empty, it is simply the wrong document.

Registry paperwork is the worst place for a silent wrong-document bug.

**Fix applied.** Frame ownership moved into a sibling module,
`ReportsPage/reportPreviewFrame.ts`: `writeMarkupIntoFrame` drops a PDF blob to
`about:blank` and writes only once the frame has reloaded as HTML, and
`releasePdfFrame` covers the other leak — a `buildPdf` report that renders no pages,
where the markup effect returns early and nothing else would clear the stale blob.

The extraction was not cosmetic: adding the fix inline pushed `ReportPreview.tsx` to
528 lines and `qa:code-quality-ratchet` failed with `oversizedSourceFiles: 171
exceeds 170`. Extracting brought it to 498 and produced a testable seam.

*Verified in the browser* — each report now renders its own document (previously all
three showed the Score Sheet):

| Report | Content now shown |
| --- | --- |
| Show Catalog | "AKC Scent Work Show Catalog … ARMBAND CALL NAME BREED" |
| Results Sheet | "AKC Container **Preliminary Results**" |
| Trial Secretary Report | "Report of Scent Work Trial … Superintendent/Event Secretary shall complete" |
| AKC Judge's Report | "AKC Scent Work Trial Judge's Report" |
| Financial Report | "ENTRIES GROSS FEES DISCOUNTS WAIVED/COMPED COLLECTED REFUNDED" |

*Guard:* `__tests__/reportPreviewFrame.test.ts` — five cases; the key one asserts the
blob is dropped before the markup write. Confirmed non-vacuous (it fails when the
handoff is removed). 123 ReportsPage tests, typecheck, ratchet and lint all clean.

### F26 — P1 — CORRECTED — High in Trial / High in Class does not exist

Task 11 has no report. The Reports picker lists 24 report types and none of them is a
High in Trial or High in Class award report.

I first recorded this as "an implementation exists but is orphaned". **That was too
generous.** `components/awards/AwardsProcessor.tsx` computes nothing: it runs
`simulateProcessing(800)` fake delays behind a progress bar and then returns a
hardcoded `mockAwards` array — "Champion Rex / John Smith", "Lady Belle /
Mary Johnson". It is a UI prototype, not an award calculator.

Its only importer anywhere is `src/test/phase5-component-validation.test.ts`, which
renders it directly. So a passing test keeps a mock alive that no user can reach and
that would produce fabricated winners if they could.

**Not fixed; rule since established.** `docs/rulebooks/akc-scent-work-regulations.txt`
Chapter 6 §8 defines it: offered only when more than one element runs at a difficulty
level; eligible teams entered every element offered at that level and qualified in each;
Handler Discrimination excluded; ranked by summed faults, then summed time, then a coin
flip; one winner per level. §10 covers uneven element offerings, and §9 makes High
Combined Division mandatory alongside HIT when Handler Discrimination is offered.

Also worth correcting: **"High in Class" is not an AKC concept** (zero rulebook
occurrences). The equivalent is §6 Placements 1–4 per class, which the app already
computes — verified during the walk. So this is one missing report, not two.

Planned as Phase 2B in `plan-secretary-walk-remediation.md`.

### F27 — P2 — FIXED (#1858) — A cold replication store reports "Class not found" for a class that exists

Navigating directly to `/scoring/classes/:classId/entries` immediately after sign-in
renders **"Class not found"** with a Go Back button. The class exists, renders on its
own detail page, and appears on Show Desk.

Reproduced both ways: the demo show's `Exterior Excellent` (66 entries) reported
"Class not found" on direct navigation, then rendered "0 of 66 scored" from the same
URL once the show had been visited first. No 4xx, no console error.

This is the F1 family — the app reading "not replicated yet" as "does not exist" —
but here it states the absence as a fact rather than an error. It matters because the
class detail page's readiness rows deep-link straight to this URL, so a bookmark, a
shared link, or a fresh device lands on a flat denial that the class is real.

### F28 — P2 — FIXED (#1858) — Manage Classes shows the judge's UUID instead of their name

On `/shows/:showId/classes/:trialId` ("Manage Classes"), the per-class judge selector
renders the judge's raw id as its visible text:

```
Judge for Container Novice A  ->  "08a66fc8-51b4-484a-918a-03bdd5a8d5bf"
Judge for Interior Novice A   ->  "b0728006-4428-4b5d-8462-00015c26a35b"
```

The same judge shows correctly as "Test Judge" in the class Edit dialog, so the data
is fine — this control is displaying the option value rather than its label, on the
page whose purpose is assigning judges.

Also note this is the **third** surface that sets a class judge, after the class
detail Edit dialog and Edit Show → Judges (F12).

### F29 — SPLIT — one half WITHDRAWN (my error), one half REAL and still open

**I got this wrong, shipped the wrong fix, and CI caught it.** Recorded in full
because the mistake is the instructive part.

**What I claimed:** `ShowDetailTabs` discards its `canManageShow` prop and passes
`canManageShow={false}` to `ShowMapTab`; since that is the only mount of
`ShowMapTab`, the entire action layer was unreachable app-wide. I changed it to
forward the prop, and rewrote the test that asserted `false`, reasoning that the
property was "inherited, not decided" because #1035 (a refactor) said the map
"stays read-only".

**Why that was wrong.** I looked at the refactor that preserved the behaviour
instead of the commit that chose it. The origin is
[#291](https://github.com/rbeezley/myk9-platform/pull/291), *"feat(show-map): make
public map read-only"* — a deliberate feature PR — and
`docs/archive/plan-show-map-workbench-collapse.md` lists **"view-only public map"**
among the architectural commitments the workbench collapse had to respect. The
`false` is an INTENT, not drift. A second test I had not run,
`ShowDetailsPage.test.tsx:753` ("renders the public Show Map as read-only for show
managers"), pinned it and failed in CI on all three shards.

**F29a — WITHDRAWN, then RE-OPENED by the verification walk (2026-08-29).**

I withdrew F29a on the grounds that Show Desk reaches the row actions through
`ShowDeskPanel` -> `SecretaryCockpit` -> `getRankedActions`, which does contain
`move-up-entry`, `mark-checked-in`, `scratch-entry` and `edit-score`. The
verification walk found no Move up anywhere on Show Desk, on the demo show or on a
focused class, so I traced it properly.

**The catalog has exactly two consumers, and neither reaches these actions from a
management surface:**

| Consumer | Getter | Consequence |
| --- | --- | --- |
| `ShowMapRowActionsMenu` | `getDirectActionsForNode` — every action | Renders ONLY inside `ShowMapStructureTable` -> `ShowMapTab` -> the public Show Map, which is read-only by intent (#291) |
| `buildSecretaryCockpitSnapshot` | `getRecommendedActionsForNode(node, …, 1)` — filters `action.recommended`, limit 1 | **None** of the entry row actions set `recommended`, so none are ever offered |

So `ShowDeskPanel` owning `ShowMapMoveUpDialog` proves nothing: the dialog opens from
`runCommand`, `runCommand` resolves a commandId the cockpit emits, and the cockpit
only ever emits recommended actions. The dialog is unreachable on that page.

**What I got wrong, and how.** I checked that `getRankedActions('root', …)` contains
move-up and stopped there — I confirmed the action is *eligible* and never checked
whether any UI *renders* it. That is the same shape as the mistake this walk exists to
catch: verifying a mechanism exists rather than verifying a user can reach it.

**The revert itself was still correct.** #291 deliberately made the public map
read-only and the collapse plan lists that as an architectural commitment; forwarding
`canManageShow` there would contradict it. The fix is to give these actions a home on
a management surface, not to unlock a browsing one.

**F29b — REAL, still open, and BROADER than run order.** Run order was only the half
I could prove at the time. With F29a re-opened, the whole row-action layer is
unreachable: **Move up, Mark checked in, Pull / no-show, Edit score and Message
handler**, plus run order. All of it:

- `ShowMapRunOrderMenu` and `reorderMode` (drag plus `Alt+ArrowUp/ArrowDown`) render
  only inside `ShowMapStructureTable`, which is imported only by `ShowMapTab`, whose
  `reorderMode={canManageShow ? reorderMode : undefined}` is now — correctly — always
  undefined.
- The cockpit action catalog has **no** run-order/reorder command, so Show Desk does
  not offer it either.
- **Manage Classes** → "More actions" has no run-order control.
- Show Desk links out to **"Run order and class setup"**, which lands on Manage
  Classes — a deep link named for a capability its destination does not have.

So `docs/roles/secretary.md`'s "publish the running order" still has no working path,
and a reorder implementation exists that nothing can reach. The fix is **not** to
unlock the public map. It is to give run order a home on a management surface —
either a cockpit action or a control on Manage Classes, where the existing deep link
already points. Left open deliberately; sized as a Phase 2 judgment call, not a
mechanical fix.

### F30 — P1 — MECHANISM FOUND — Deleting a club silently strips management from its shows, permanently

**Twice rewritten. The first version blamed the creation wizard, the second the edit
path. Both were wrong, and the disproof is the useful part.**

Observed: `shows.club_id IS NULL` on the audit show
(`e8675466-…`), which makes every secretary write to it fail — see F31 for the chain.

Attempts to reproduce, all negative:

| Probe | Path | Result |
| --- | --- | --- |
| `ZZ Audit - Club Persistence Probe` | wizard → **Create Show (Unpublished)** | `club_id` set correctly |
| `ZZ Audit - Publish Path Probe` | wizard → **Create & Publish Show** | `club_id` set correctly |
| Probe 1 again | More show actions → Edit → Judges → Save Changes | `club_id` **preserved** |

The wizard and the edit path are therefore exonerated: identical steps produced a
correct `club_id` twice.

**The cause is club deletion, and a reseed does it every time.** Both probe shows had
a correct `club_id` at 00:58; after running `seed-demo.sql` they were both NULL. The
chain:

- `seed-demo.sql:249` — `DELETE FROM public.clubs WHERE id IN ('dededede-…001', …)`.
- `shows_club_id_fkey` is `FOREIGN KEY (club_id) REFERENCES clubs(id)`
  **`ON DELETE SET NULL`**.
- So deleting the club nulls `club_id` on **every** show that references it.
- The seed recreates the club under the same id and re-inserts *its own* fixture shows
  with `club_id` set, so the fixture data looks correct — and every non-fixture show is
  silently orphaned.

That also explains the original audit show, whose `updated_at` (21:59) was hours after
its creation: a reseed, not the wizard.

What *is* established, and is the finding worth keeping:

- `shows.club_id` is nullable and nothing — no constraint, no trigger — prevents a
  club-less show from existing.
- `20260828230000` (MYK9-258) rewrote `can_manage_show` to require
  `s.club_id IS NOT NULL`. That fix is right on its own terms: a club-less show
  should not be manageable by *every* secretary.
- Together those mean a show that loses its club becomes manageable by **nobody** —
  not its creator, not a club admin, only a site admin. There is no in-app route back,
  because every repair write is itself gated by `can_manage_show`.

So the severity is not "the wizard is broken" but **"deleting a club silently and
permanently removes management from all of its shows"**.

Pre-launch this only costs demo and QA shows on every reseed. It is not a demo-only
problem though: the same FK rule applies to a real club deleted for any reason, and
after MYK9-258 the resulting shows cannot be repaired from inside the app, because
every repair write is itself gated by `can_manage_show`.

Worth noting the two changes are individually reasonable and only dangerous together:
`ON DELETE SET NULL` was harmless while `club_id` was descriptive, and MYK9-258 is
correct that a club-less show should not be manageable by every secretary. Making
`club_id` authorization-critical turned an existing nullable FK into a trapdoor.

Options, none of which I am picking unilaterally: `ON DELETE RESTRICT` (would require
the seed to stop delete-recreating its club), a `NOT NULL` constraint, or a site-admin
reassign-club repair path. The seed could also simply re-point or refuse to orphan
shows it does not own.

*Audit artifacts on staging:* the walk show plus three probe shows
(`6cea4cdf-…`, the publish probe, and `ZZ Audit - Rewalk`), and one move-up-created
entry on the demo show (`7ae6ac8b-…`, Interior Advanced) whose id falls outside the
seed's fixture ranges, so a reseed will not remove it.

### F31 — P3 — CORRECTED, diagnosis FIXED (#1858) — CORRECTED — A denied entry update is diagnosed internally as a deletion

**This finding was first written as a P1 silent-data-loss bug. That was wrong, and the
correction is the substantive part.** The app *does* tell the secretary. On the failed
status change it raised a persistent toast:

> We couldn't update this entry. Retry or discard this change.  [Retry] [Discard]

with `duration: Infinity` and both recovery actions wired to
`retryFailedMutation` / `discardFailedMutation`
(`providers/ReplicationSyncProvider.tsx:674`). I originally grepped a snapshot taken
before the toast rendered and concluded "no error anywhere". The user-facing
behaviour here is good.

What remains, and it is developer-facing only: the failure is **misdiagnosed**. The
chain is

1. `shows.club_id IS NULL` (F30), so `can_manage_show` — which `20260828230000` now
   requires `s.club_id IS NOT NULL` for — returns false.
2. The `entries_update` policy denies, so the UPDATE matches zero rows and PostgREST
   answers `200 []` (captured: `PATCH 200 rows=[]`; the walk's 4xx count stays 0).
3. `classifyEmptyUpdateResult` (`packages/replication/src/mutation-occ.ts:139`) then
   re-reads the row to tell deletion, OCC conflict and RLS denial apart — good design.
   But the re-read `SELECT` is filtered by the *same* policy that denied the UPDATE,
   so it returns nothing, and the `!serverCheck` branch concludes:

   `Row <id> on entries no longer exists server-side.`

An unreadable row and a deleted row are indistinguishable to that check, so a
permission problem is logged as data loss. The user gets the right prompt; anyone
reading the log to work out *why* is pointed at the wrong cause.

The optimistic list also shows the change as applied ("Needs review 1") until the
failure lands — correct for offline-first, worth knowing when reading a screenshot.

### F32 — P3 — FIXED (#1858) — The Volunteers page tells you to use a sidebar picker that does not exist

`/secretary/volunteers` without a `showId` renders **"Select a Show — Choose a show
from the sidebar to manage volunteers."** The sidebar has no show picker; it has a
single link to the current live show, and following it navigates away from Volunteers.
Visiting a show first does not help either — the page still asks you to select one.

The working entry point is **Show Desk → Tools → Volunteers → Open volunteer
scheduling**, which appends `?showId=…`; with that param the page is fully functional
(Add Volunteer, per-class "Assign volunteer" slots grouped by trial). So the feature
works and only its empty state misdirects — but it misdirects toward a control that
does not exist, which is worse than saying nothing.

Third instance of the same shape: `Compose` not inheriting the show (F23), Show Desk's
"Run order and class setup" naming a capability its destination lacks (F29), and this.

### F33 — P1 — FIXED AND DEPLOYED — The receipt says $30.00 and the database records $0.00

Found during the post-fix re-walk, on a clean show with a club. A mail-in entry
submitted through Entry Management produced:

- Receipt on screen: **"Confirmation # MK9-000103 $30.00"**
- `entries.entry_fee`: **0.00**
- `enrollments.total_amount`: **0**, `paid_amount`: **0.00**, `payment_status`: `paid`

So the secretary is told they took $30 and the club's records say the entry was free.
For contrast, the 514 seeded entries on the demo show all carry `entry_fee = 30.00`,
so this is specific to the wizard's write path, not the data model.

This is **not** F15 resurfacing. F15 displayed $0 and stored $0 — wrong but internally
consistent, and the fix corrected the computation the Payment step displays. Here the
display is now right and the persisted value is still zero, which is worse: nothing on
screen contradicts the record, so it cannot be noticed at the desk.

It also explains something I saw earlier and did not question: the closeout panel on a
514-entry show reports **"At-show collected $0.00"**.

**Root cause — the server-side twin of F15.** The client was never at fault: it
computed and sent 3000 cents. `submit_show_entries` is authoritative and priced the
entry itself:

```sql
v_server_fee := COALESCE(
  CASE WHEN v_show_start IS NOT NULL AND CURRENT_DATE >= v_show_start
       THEN v_show_dos_fee ELSE v_show_pre_fee END,
  v_class_fee, 0);
```

`COALESCE` only falls through on NULL, and a blank Day-of-Show Fee is stored as
`0.00`. So from the show's start date the day-of branch yields zero.

The fee-mismatch guard cannot catch it, because it is one-directional:

```sql
IF v_client_cents IS NOT NULL AND v_client_cents < v_server_cents THEN RAISE ...
```

It exists to stop underpayment, so `3000 < 0` is false and the correct client figure
is silently discarded. Fixing F15 on the client therefore made this *less* visible,
not more: before, display and record agreed at zero; now the screen says $30 and the
record says nothing.

`submit_show_entries` is the only server-side use of `day_of_show_fee` for pricing —
the edge functions only print it on the premium list — so the fix is contained.

Impact is the Financial Report, closeout reconciliation and any payout maths: entries
the secretary believes are paid contribute nothing to the show's totals.

**Fixed. Migration applied to staging 2026-08-29.**
`supabase/migrations/20260829030000_day_of_fee_zero_is_not_a_tier.sql` takes the
day-of fee only when it is `> 0`, mirroring the client fix. Rebuilt from the LIVE
`pg_get_functiondef` rather than an older migration file so no intervening change is
reverted; the only edit is the fee expression. Role decisions restate the verified
live grants (anon false, authenticated true, service_role true). 733 DB contract tests
pass — the suite first rejected it for missing EXECUTE decisions.

*Verified against the applied database:* the fee expression now carries
`v_show_dos_fee > 0`, grants are unchanged (anon false, authenticated true,
service_role true) and the function is still `SECURITY DEFINER`.

*Verified end to end* on the same show, same wizard, same dog:

| Entry | Created | `entry_fee` |
| --- | --- | --- |
| Container Novice A | 01:54, before the push | **0.00** |
| Interior Novice A | 02:32, after the push | **30.00** |

The enrollment moved from `total_amount: 0` to `3000` with `paid_amount: 30.00`.

**History is not repaired.** Every entry created on or after a show's start date while
this was live still carries `entry_fee = 0` and contributes nothing to that show's
totals. A backfill would need to decide which fee tier applied on the day each entry
was taken, so it is a deliberate decision rather than an obvious follow-up.

*Push note:* `pg_get_functiondef` returns the definition WITHOUT a trailing semicolon,
so the first push failed with a syntax error at the following `REVOKE` — the grants had
run on as part of the function statement. Worth knowing for any migration rebuilt from
a live definition.

*Unit oddity, not investigated:* `enrollments.total_amount` is in cents (3000) while
`paid_amount` is in dollars (30.00). `utils/enrollmentGrouping.ts` documents the cents
convention for Stripe, so this looks intentional rather than a defect.

### Move-up semantics (verified, not a defect)

Worth writing down because the dialog's wording ("Move this entry into another
class") does not describe what happens, and a reader of the data would otherwise
suspect a duplicate:

- The original entry becomes `entry_status = 'moved'`, keeps `move_up_requested = true`
  and **keeps its $30 fee** — the paid record and its history survive.
- A **new** entry is created in the target class, `confirmed`, at `entry_fee = 0.00`.

So the dog is not double-booked and not double-charged; the money stays on the record
that was paid. The one thing to check downstream is whether the Financial Report and
closeout totals count `moved` entries — if they only count `confirmed`, that $30 would
vanish from show takings. Not investigated here.

Target eligibility is enforced by `utils/moveUpEligibility` via
`buildMoveUpTargets`: same element, strictly higher level, deliberately aligned across
the Show Map, Show Desk and Entry Management so none of them offers cross-element or
lower-level targets. Confirmed live: an Interior Novice entry offered exactly one
target (Interior Advanced), and a show with only Container Novice A + Interior Novice A
correctly offered none.

### F34 — P1 — FIXED — Every id-keyed dropdown in the app displayed a raw UUID

Found while fixing F28, which turned out to be one instance of a general defect rather
than a one-page bug.

**Mechanism, verified against the installed package.** `@base-ui/react` 1.7.0 documents
on `Select.Root` (`select/root/SelectRoot.d.ts:97`):

> "Data structure of the items rendered in the select popup. When specified,
> `<Select.Value>` renders the label of the selected item instead of the raw value."

Our `SelectItem` wraps its children in `Select.ItemText` correctly, but the items are
**unmounted while the popup is closed** — which is exactly when the trigger has to render
a label. Without `items` on the root there is nothing to resolve the value against, so
the trigger prints the value itself.

**It is not limited to preselected values.** A scratch probe (written, run, deleted)
rendered a select with no `items`, opened it, and clicked "Richard Beezley". The closed
trigger then read:

```
TRIGGER TEXT AFTER SELECT >>> "08a66fc8-51b4-484a-918a-03bdd5a8d5bf"
```

So the user picks a name and the control answers with a UUID. Both the preset path (data
loaded from the database) and the interactive path are affected.

**Blast radius.** 179 `<Select>` sites pass a value without `items`. Most are harmless
because their value already *is* the label (`"Novice"`, `"AKC"`). The visible damage is
where value != label — **43 option sites across 34 files** keyed by an id:

| Surface | File |
| --- | --- |
| Move-up target class | `features/show-map/ShowMapMoveUpDialog.tsx:100` |
| Reports selector | `pages/secretary/ReportsPage/ReportControlsBar.tsx:228` (4) |
| Incident log | `features/show-workbench/IncidentLogCard.tsx:190` (4) |
| Waitlist show picker | `pages/secretary/WaitlistManagementPage/ShowClassSelection.tsx:66` (2) |
| Check-in report trial | `pages/secretary/CheckInReportPage.tsx:258` |
| Volunteer scheduling trial | `pages/secretary/VolunteerSchedulingPage/index.tsx:190` |
| Class judge (4 more surfaces) | `SimpleClassSelector`, `SimpleEditForm`, `ClassEditForm`, `ClassEditPanel` |
| Club pickers | `ShowEditBasicInfoTab`, `ManageUserRolesDialog`, `BulkRoleDialog` |
| …plus 20 more | see the scan in the Phase 1 commit |

**Fixed (2026-08-29) in the WRAPPER, not at the call sites.** The first pass patched
`ClassManagementRow` alone and filed the other 33 files as a sweep. That framing was
wrong: 43 hand-written `items` props would fix 43 sites and leave the 44th to
reintroduce the bug — the "fix the class, not the instance" case.

The shared `Select` wrapper now derives `items` by walking the `SelectItem` children it
is already handed (through arrays, fragments and `SelectGroup`, since call sites nest
them in `.map()` and conditionals). All 179 sites are fixed with no call-site change,
and a new dropdown is correct by default.

Two deliberate limits:

- **An explicit `items` always wins.** A caller whose options are rendered by a nested
  component is invisible to the walk and must pass them; `ClassManagementRow` also keeps
  its override for a better label ("Assigned judge (unavailable)").
- **A UUID-shaped value with no matching option is masked** as "Unavailable" rather than
  printed. A selected row can legitimately be absent from the options — a judge filtered
  out of a qualified list, or a list that has not loaded. Non-id values are left alone,
  because there the value IS the label ("Novice", "Withdrawn").

The "should the wrapper fail loudly when given a value with no items" question is now
moot: it supplies the items itself.


### F35 — P3 — NEW — A local time that is exactly UTC midnight resolves one day late

Surfaced while fixing F6, and **pre-existing** rather than introduced by it.

`toLocalDateOnly` (`utils/date-format.ts`) short-circuits any ISO string ending
`T00:00:00Z` to its literal date part. That is deliberate and correct for its stated
case: a `DATE` column round-trips as UTC midnight, and local getters would misread it
as the previous day west of UTC. But a genuine *local* timestamp that happens to land
on UTC midnight is indistinguishable from that — 5:00 PM PDT, 7:00 PM EST — so it
resolves to the next calendar day.

Concretely, a show ending 5:00 PM Pacific serialises to `2026-08-29T00:00:00.000Z` and
reads as Aug 29 rather than Aug 28, which suppresses the "End date must be on or after
start date" rule for that combination.

Not a regression: the previous `slice(0, 10)` returned the same wrong date for the same
input (verified before changing it), so F6's fix is a strict improvement that merely
made this visible. Pinned by a test in `showCreationWizardValidation.test.ts` marked
KNOWN LIMITATION rather than folded silently into an unrelated assertion.

The real fix is for the wizard to carry date-only values instead of ISO datetimes, so
the ambiguity never arises — that is a data-shape change across the picker and the
show payload, not a one-line edit, so it is left open.


## Verification walk — 2026-08-29, against deployed staging

Second pass, run against `myk9-platform-myk9show.vercel.app` at `390197483` (the F30
merge), not localhost — so this exercises the deployed artifact after PRs #1853,
#1858, #1860 and #1861. No console errors and no 4xx/5xx on any screen visited.

### Confirmed fixed in the browser

| Finding | Evidence |
| --- | --- |
| F1 / F16 | Entry Management renders 515 registrations; reads `view_authenticated_entry_results?select=id` (gated view, counted by column not `*`) |
| F19 | Queue chips carry `aria-pressed` — "Needs review" `true`, the rest `false` — inside a `role=group` labelled "Registration queues". Exceptions sub-tabs correct too |
| F28 / F34 | Per-class judge selectors read **"Test Judge"**, not a UUID |
| F27 | Direct nav to `/scoring/classes/:id/entries` renders "Exterior Excellent"; "Class not found" absent |
| F32 | Volunteers empty state reads "…choose Tools → Volunteers on its Show Desk"; the sidebar claim is gone |
| F17 | Help link resolves to `help.myk9show.com/guides/secretary-guide` |
| F14 | Secretary register shows no "entries are closed" blocker |
| F20 | Capacity cards carry the **JUDGE** label; entry counts pluralize |
| Task 20 | The needs-review queue lists 3 registrations with "Review registration" as the next action. The old "Blocked by F30" was the orphaned *audit* show, not the feature |

### Confirmed still broken

- **F29a, re-opened.** No Move up anywhere on Show Desk — not on the show, not on a
  focused class. Traced to root cause; see the F29 section above.
- **F18.** 50 entries labelled "Paid online", 0 "Paid by check".

### New observations for the guide

- **`/secretary/waitlist` and `/secretary/check-in` both redirect to the dashboard.**
  They are retired routes; the guide must not document them. The waitlist lives at
  Entry Management → Exceptions → Waitlist, and check-in sheets are a **Reports**
  entry ("Check-in Sheet"), not a page of their own.
- **Judge-day capacity displays over-subscription**: "130 / 125 entries" and
  "127 / 125". Consistent with the known state — the capacity model displays, and
  enforcement was never built — but it is what a secretary sees.
- Show Desk → Tools carries Volunteers, People, Add late entry, Needs closeout and
  Ringside, so tasks 16–19 are reachable from one place.


## What works well

- **Show creation wizard defaults.** Host club auto-selected when only one is
  available; Show Secretary pre-filled to the signed-in user; trial pre-named
  ("Friday Trial 1"), pre-typed (Scent Work), and pre-dated; entry close defaulted
  to 11:59 PM; a live "N items remaining" counter; clear per-field validation.
- **Post-creation access codes.** The success screen issues Admin/Judge/Steward/
  Exhibitor passcodes with copy-link, **Print slip**, and regenerate. This satisfies
  the "prepare passcodes for ringside staff" responsibility that
  `secretary-responsibility-coverage.md` still lists as unproven.
- **Class catalog.** Full AKC Scent Work set (6 elements × levels), search, per-element
  and global select-all.
- **Class detail page.** Shows the judge, and its readiness rows deep-link into
  Entry Management with trial/class/attention filters pre-applied — the
  "fast path is a deep link, not a second implementation" principle, done right.
- **Edit Show panel.** Tabbed Basic Info / Personnel / Judges / Fees / Experience,
  with Save disabled until something actually changes.
- **AKC registration guard.** The Classes step disables any class a dog is not
  eligible for, states why ("Add this dog's AKC registration before selecting this
  class"), and offers an inline **Add required registration** button — a blocker that
  explains itself and carries its own fix.
- **Secretary payment capture.** The Payment step has a dedicated
  "Secretary Payment (Already Received)" method with date/receipt/notes fields and a
  Group/Club option, plus an explicit AKC entry-agreement confirmation.
  (What it collects is not saved — see F16.)
- **Show Desk Tools panel.** People lookup, emergency trial packet, incident log,
  schedule-slip script, access codes, volunteers, tasks, and closeout in one sheet.
- **Duplicate-entry prevention.** Re-entering a dog already in a class shows it as
  "Already entered" (checked and disabled) with an alert pointing at Entry Management
  for changes or withdrawals, rather than silently allowing a second entry.
- **Exceptions tab.** Move-ups, Pulls/scratches, and Waitlist grouped as one
  "exceptions" concern rather than scattered across separate pages, with Pull
  Management explicitly framed as reconciling the refund alongside the pull.
- **Results readiness panel.** `/shows/:id/results-control` states what blocks closeout
  in plain terms ("1 unscored entry, 2 unreleased classes, Judge signatures: verify
  paper reports before sending") rather than a generic progress bar, and offers three
  named release presets (Immediately / After Class / After Review) with their
  consequences spelled out.
- **Paper scoring flow.** Selecting Q reveals exactly the fields that result needs,
  the time input is digit-masked so no separator can be typed wrong, and placement is
  computed on save.
- **Registry submission gate.** Submit Results refuses to send when data is missing and
  says exactly what is missing ("514 entries are missing AKC registration numbers"),
  while still allowing a draft XML download. This is the same invariant the new
  entry-time registration rule enforces — the app already blocked it at filing time,
  after the dogs had taken their spots.
- **Sync-failure recovery.** A write the server refuses raises a persistent toast
  naming the entry, with Retry and Discard actions, and the mutation survives in
  IndexedDB either way. This is the half of offline-first that is usually missing.
- **Status-change guard.** Moving a scored entry back to Pending raises a named
  consequence — "This entry has a recorded result. Changing it to Pending removes it
  from results until re-scored" — with Cancel / Change status, rather than a generic
  confirmation.
- **Honest empty states.** The workbench refuses to render a false zero entry count
  and says so explicitly — the correct behaviour, even though here it is masking F1.

## Task status

| # | Task | Status |
| --- | --- | --- |
| 1 | Create a show, trial, and classes | **Verified** — completed end to end three times (draft and published); Host Club persists correctly. The audit show's NULL `club_id` (F30) was not caused by creation |
| 2 | Edit a show / reassign a judge | **Verified** — added a second judge via Edit Show → Judges, reassigned Container Novice A to them; `judge_assignments` updated, other class untouched |
| 3 | Process a mail-in entry | **FIXED (F14)** — Entry Management's own "Add mail-in entry" now works after close. Entry created, confirmed, and now correctly priced after the F15 fix; check reference still discarded (F16) |
| 4 | Email exhibitors | **Possible, badly signposted** — composer is in the header Message Center panel, not the Messages page (F22), and does not inherit show context (F23) |
| 13 | Waitlist | **Verified present** — Entry Management → Exceptions → Waitlist shows judge-day capacity and "View Wait List" per judge-day; no waitlisted entries to promote on this show |
| 14 | Payments / refunds | **Partial** — Pull Management ("reconcile refunds in one place") loads with Pending/Pulled queues; payment channel is mislabelled (F18) and check references are not stored (F16) |
| 5 | Set run order | **FIXED (F29b phase 2a, #1866)** — Show Desk → focus a class → Run order → Armband ↑ / ↓ / Random. Manual drag-and-drop hand-ordering is still not built (phase 2b) |
| 8 | Process a move-up | **FIXED (F29b phase 1, #1865)** — Show Desk → focus a class → Entries → Move up; browser-verified, 66 controls on a 66-entry class and the dialog opens with the right entry |
| 15 | Scratches / pulls / no-shows | **Verified present** — Entry Management → Exceptions → Pulls / scratches: "Review pull requests and reconcile refunds in one place", Pending/Pulled queues with search |
| 16 | Late / walk-in entries | **Verified** — see Task 3; Show Desk → Tools → Late entry completes end to end |
| 6 | Print check-in sheets | **Verified** — 33-page PDF, US Letter, "Check-in & Running Order", columns Gate Order / Armband / Call Name / Breed / Reg # / Handler / Pull-Move-Note. The Reg # column is blank for every dog (see F21) |
| 7 | Print scoresheets | **Verified** — 106-page "AKC Scent Work Scoresheet": per-dog armband/breed/handler, Q/NQ/EX/ABS, Place, the full AKC fault taxonomy and MM/SS/TT time fields |
| 10 | Print preliminary results | **Verified** (after the F25 fix) — "AKC Container Preliminary Results" with element, level, trial, date and judge |
| 12 | Registry reports | **Verified present** (after the F25 fix) — Trial Secretary Report and AKC Judge's Report render their real AKC instruction text; Show Catalog, Result Catalog and Financial Report also render. Content not yet checked line-by-line against the official forms |
| 9 | Enter results from paper scoresheets | **Verified** — `/scoring/classes/:id/entries`: Q/NQ/ABS/EX, prefill, Search Time (digit-masked, `4520` → `0:45.20`), faults stepper, Save / Save & Next. Persisted `qualified`, 45.2s, 0 faults, and computed placement 1. Blocked on a cold store by F27 |
| 12 (submit) | Submit results to the registry | **Verified** — `/shows/:id/submit-results`: organization selector, Download draft XML, Mark as submitted, closeout guidance, submission history. **Send to AKC is correctly disabled** with "514 entries are missing AKC registration numbers" |
| 17 | Volunteer scheduling | **Verified via Show Desk → Tools** — Add Volunteer and per-class assign slots by trial. Direct navigation misdirects (F32) |
| 18 | Ringside access codes | **Verified** — Admin/Judge/Steward/Exhibitor codes with copy, copy-link, Print slip, Regenerate |
| 19 | Close out the show | **Verified** — closeout panel reconciles attendance & fees (entries, day-of, at-show collected, waived, pulled/no-show, refund review) and incidents (all/reportable/urgent), e.g. "2 pulled entries have $60.00 marked refunded" |
| 11 | High in Trial / High in Class | **Gap (F26)** — no report exists; the only implementation is orphaned |
| 20 | Approve / accept online entries | **WORKS** — re-verified 2026-08-29; the block was the orphaned audit show, not the feature — every entry write on the audit show is refused because the show has no club, so accept could not be exercised end to end. The refusal is surfaced correctly (F31) |

Tasks 20 (approve/accept online entries) and 13 (waitlist) were added to the canonical
list at the owner's request on 2026-08-28. Accept/reject is the secretary's
highest-frequency decision and was previously implicit inside "Entry Management"
rather than named as a task of its own.
