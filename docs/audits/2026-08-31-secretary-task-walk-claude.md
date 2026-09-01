# Secretary Task Walk — 2026-08-31

Functional walk of the secretary's task surface against deployed staging
(`myk9-platform-myk9show.vercel.app`), main at `5b3c67eef`. Audit only — no
source edits, no commits, no migrations, no deploys.

This asks a different question from `claude-role-ux-walk`: not *does it feel
right*, but *does the job work end to end*.

Findings numbered continuously from the prior walk
([2026-08-28](2026-08-28-secretary-task-walk.md), which ended at F35).

## Severity

| | Meaning |
| --- | --- |
| P1 | Blocks a secretary from completing a required task. |
| P2 | Task completable, but with real friction, a trap, or misleading information. |
| P3 | Polish, copy, accessibility, or developer-experience. |

## Coverage

| # | Task area | Walked | Notes |
| --- | --- | --- | --- |
| 1 | Show setup / wizard | **Full** | All four steps walked, a show created, verified in SQL, then deleted through the app's own affordance. Nothing left live. |
| 2 | Entries | **Partial** | Entry Management, queues, Exceptions (Move-ups / Pulls / Waitlist) walked read-only. Mail-in creation and check-in not walked — both create records. |
| 3 | Permissions | **Full** | Show Access tab, appoint a non-member, revoke, restore. Round-tripped and verified in SQL. |
| 4 | Reports | **Full** | All 36 registry reports opened on two shows (72 renders). |
| 5 | Money | **Partial** | Payment-channel labelling verified against DB. Refunds and receipts not re-walked. |
| 6 | Messages | **Full** | `/secretary/messages` and the show-scoped route. |
| 7 | Waitlist / classes | **Partial** | Exceptions → Waitlist reached; capacity cards not re-measured. |

A skipped area is a coverage gap, not a pass.

## Findings

### F36 — P1 — NEW — [MYK9-283](https://linear.app/myk9-platform/issue/MYK9-283) — The Check-in Sheet intermittently claims a class has no entries, and never takes it back

> **Resolved 2026-09-01.** Fixed in #1922, deployed, and re-verified against
> staging: 30 cold loads, 0 false zeros, plus the sibling `scoresheet` report and
> both trial and class scopes. The replica was proven cold rather than assumed —
> `entries` absent from `replicated_tables` before the load, 484 rows after.
> Two measurement traps found while verifying, both now recorded in the
> `secretary-task-walk` skill: re-navigating in ONE browser context leaves the
> replica warm from run 2 on, and a `buildPdf` report reads as blank in headless
> Chromium (measure the Blob via `URL.createObjectURL`, not the frame DOM).

On roughly **1 cold load in 6**, `/shows/:id/reports?report=check-in-sheet` renders

> No entries found for this selection

for a class that holds **63 live confirmed entries**, every one of them carrying
an armband and a run order. The claim does not resolve: polling the same page
for 30 seconds never retracts it. Only a reload clears it.

**Measured.** Six cold loads of the identical URL, each polled 15 × 2s:

```
run 1: sawEmptyAtAnyPoint=true   finalAfter30s=EMPTY
run 2..6: sawEmptyAtAnyPoint=false finalAfter30s=rendered

check-in-sheet: finalEmpty=1/6  finalRendered=5/6  transientEmptyThenRecovered=0
```

Target: show `dededede-0000-0000-0000-000000000010`, trial
`dededede-…-000000000021`, class `dec1a55e-…-000000000032` (Interior Advanced).
Database for that class: 64 confirmed (4 soft-deleted), 1 submitted, 1
completed, 1 pending-payment; 63 with a run order.

**Not a data problem.** Show Catalog, rendered from the same `entries` prop on
the same page, produced 32,916 characters on every load.

**Where it comes from.** `ReportPreview.tsx:433` gates on
`!isLoading && !hasEntries && !report?.rendersWithoutEntries`. The component
already carries a documented defence against exactly this shape — the
`dataState` prop, whose own comment says:

> `unavailable` is the state where the app never got to ask. Without it the
> empty-entry branch below reports "No entries found for this selection" — a
> claim about the class — when the truth is a claim about the network.

That reasoning is right and the guard is not covering this path: something
reaches `isLoading === false` with `entries` not yet populated, and the empty
branch states it as fact.

**Why P1.** The check-in sheet is the sheet a secretary prints on show morning,
often on venue wifi, frequently on a cold store. A one-in-six chance of being
told a full class is empty — with no loading state, no retry affordance, and no
self-correction — is a false negative on the most operationally critical report
in the app. It is also the same family as F1 and F27 (cold store reports a false
zero) and as the standing `disabled/paused query renders a false zero` pattern.

**Suggested check when fixing:** whatever makes `isLoading` false before entries
land, the empty branch should require a *positive* "we asked and there are none"
signal rather than the absence of rows.

### F37 — P2 — NEW — [MYK9-284](https://linear.app/myk9-platform/issue/MYK9-284) — Revoking show access happens on one click, with no confirmation

`ClubShowAccessTab.tsx:265` wires the control straight through:

```tsx
onClick={() => onRevoke(manager.personId, manager.personName ?? 'this person')}
```

There is no `AlertDialog` and no confirm step anywhere in the file. One click
strips a person's ability to create and run **every one of that club's shows**.

This is out of step with the rest of the app, which is careful here: changing a
scored entry back to Pending names the consequence ("This entry has a recorded
result…") before doing it, and pulls are framed as reconciling a refund. Access
revocation is a larger action than either and asks for less.

**Disclosed:** this walk hit the consequence directly. My revoke script clicked
the target's own row correctly, then looked for a confirmation button; finding
none, its page-wide fallback selector matched a *second* row's Revoke and fired
it, deactivating the canonical `secretary@myk9t.com` appointment as well. That
was my selector bug, not an app defect — `onRevoke` is keyed to a single
`personId` and cannot revoke two. I restored the appointment through the app's
own Appoint flow and verified in SQL that the global secretary count returned to
its baseline of 4 active. It is recorded because the absence of a confirm step
is precisely what let a stray click be destructive instead of harmless, and
because a human clicking down a list is exposed to the same thing.

### F38 — P3 — NEW — Revoke leaves `user_roles.deactivated_at` NULL, though the audit trail itself is intact

**Downgraded after checking rather than assuming.** My first reading was that
revocation left no record. It does: `permission_audit_log` carries
`club_secretary_granted` / `club_secretary_revoked` rows naming the actor, the
`user_roles` row, the role, the club and the person. MYK9-211's work holds, and
the newer club-appointment path — which post-dates that issue — writes to the
same trail.

What remains is a small inconsistency on the row itself. Revoke sets
`is_active = false` and leaves `deactivated_at` NULL, while the person-soft-delete
path stamps both (`set is_active=false, deactivated_at=v_deleted_at`, pinned by
`softDeletePerson.source.test.ts`). Anything reading revocation time from the row
rather than from the audit log will see nothing — `getDeletedUserById`'s reads
already select `deactivated_at` for exactly this purpose. Cosmetic today,
a trap for the next reader.

### F39 — P3 — NEW — The scoresheet preview pane stays blank once it is scoped, and says nothing

`check-in-sheet` and `scoresheet` are the two reports that render through
`buildPdf` (the shared trial-packet renderer) rather than a React component.
Before a trial and class are chosen, the page explains itself:

> Download AKC Score Sheet PDF — Pick a trial and a class above to enable this.

After choosing them the hint disappears, the Download button enables, and the
preview area is simply empty. Nothing says preview is download-only for this
report. Low confidence that this is unintended; recorded so a human can decide.

### F40 — P3 — NEW — Three club-less shows from prior walks are still on staging

`ZZ Audit - Secretary Task Walk`, `ZZ Audit - Club Persistence Probe` and
`ZZ Audit - Publish Path Probe` all carry `club_id IS NULL`.

F30's mechanism is closed — `20260829120000_restrict_club_deletion_with_shows.sql`
changed the FK to `ON DELETE RESTRICT`, so no *new* orphan can be produced — but
that migration does not heal rows that were already orphaned. These three are
inert leftovers rather than a live defect; they are noted because they will keep
appearing in every future walk as shows nobody can be scoped to, and because
they make the orphan count look non-zero to anyone auditing F30.

### F41 — P2 — NEW — [MYK9-285](https://linear.app/myk9-platform/issue/MYK9-285) — The delete confirmation promises permanent, irreversible deletion; the app performs a recoverable soft delete

Deleting a show through **More show actions → Delete** raises:

> **Warning: This will permanently delete all related data.** Deleting this show
> will also permanently delete 3 related records. **This action cannot be undone.**

What actually happens is a soft delete. After confirming, every affected row
carried a `deleted_at` stamp and none were removed:

| Row | `deleted_at` |
| --- | --- |
| show `bcf76812…` | `2026-08-31 23:26:58.895026+00` |
| trial `838c641c…` | `2026-08-31 23:26:58.895026+00` |
| class `f232dbd7…` | `2026-08-31 23:26:58.895026+00` |
| class `733054f0…` | `2026-08-31 23:26:58.895026+00` |

The **cascade is correct** and the count is honest — one trial plus two classes
is exactly the "3 related records" it named, all stamped in the same
transaction. It is only the permanence claim that is wrong. The rows are
recoverable, and `/admin/data-lifecycle` exists precisely to purge them for real
("Permanently Delete Show?").

Two costs, in opposite directions. A secretary who mistypes a show name and
wants to start over is told the deletion is irreversible, so they will hesitate
or ask for help over something the app can undo. And anyone relying on "this was
permanently deleted" — a person asking for their name to be removed, say — is
being told something untrue.

Worth contrasting with F37: this dialog is a model of the pattern the Revoke
control lacks. It names the object, counts the collateral, and states the
consequence. It just states the wrong consequence.

### F42 — P3 — NEW — [MYK9-286](https://linear.app/myk9-platform/issue/MYK9-286) — `/shows/new` renders "We couldn't load this show"

The wizard lives at `/secretary/create-show/wizard`, reached from the dashboard's
**Add Show**. `/shows/new` — a URL a person might reasonably type or bookmark —
is shadowed by `/shows/:id`, so the app tries to load a show whose id is the
literal string `new`, takes six 400s and 17 console errors, and renders:

> We couldn't load this show. Please try again. Check your connection and try again.

The advice is wrong in both halves: nothing is wrong with the connection, and
retrying cannot help. A guard that recognises non-UUID ids, or a redirect to the
wizard, would cost little.

## Regression re-verification

Re-walked in the browser against deployed staging.

| Finding | Verdict | Evidence |
| --- | --- | --- |
| **MYK9-280** (entry form unreachable) | **Holds** | `akc-scent-work-entry-form` renders on both shows — 3,811 chars on the officials show, 301,281 on the demo show |
| **MYK9-282** (`Trial NaN`) | **Holds** | Zero occurrences of `NaN` across all 36 reports on both shows (72 renders) |
| **Phase 2/3 permission model** | **Holds** | Appointing a non-member works; the list labels them "Not a club member"; the dialog states "Club membership is not required"; revoke works; count 1 → 2 → 1 |
| **F29b** (run order / move up unreachable) | **Fixed** | Show Desk with a focused class exposes both "Run order" and "Move up". #1865/#1866 hold |
| **F18** ("Paid online" for every channel) | **Fixed** | The All-registrations queue reads plain **"Paid"** — 52 occurrences, 0 "Paid online". The false channel claim is gone |
| **F24** (other clubs' shows in the filter) | **Holds** | Communication History's show filter lists only Heartland's two shows |
| **F25** (stale PDF after switching report) | **Holds** | 36 reports opened in sequence; the picker's value matched the requested report on every one |
| **F26** (High in Trial missing) | **Holds** | `high-in-trial` renders on both shows |
| **F1** (Entry Management dead on a cold store) | **Holds** | 481 registrations render; queue chips populated |
| **F30** (club delete strips management) | **Mechanism closed** | FK is now `ON DELETE RESTRICT`; legacy orphans remain — see F40 |
| **MYK9-211** (grants/revocations write no audit events) | **Holds, and extends** | The club-appointment path added after that issue writes `club_secretary_granted` / `club_secretary_revoked` with actor, role, club and person |
| **Officials grant nothing** (Phase 2's governing rule) | **Holds at creation** | Naming Test Chairman and Test Secretary on a new show wrote 2 `show_officials` rows and **0** `user_roles` rows for that show |
| **Created shows keep their club** (F30's other half) | **Holds** | The new show persisted `club_id` = Heartland; the orphans in F40 were not reproduced |
| **F4 / F12** (judges must exist before class assignment) | **Now explained** | Step 3 states "This show has no judges yet, so classes cannot be assigned one here. Add a judge and a judge picker appears on every element", with an inline **Add a judge** |
| **F8** (chairman picker lists everyone) | **Unchanged** | The picker's results are still headed **ALL PEOPLE**, not scoped to the club |
| **F22** (Messages is history-only) | **Still open** | `/secretary/messages` is "Communication History" with Messages / Email delivery tabs and **no compose control** |
| **F23** (composer ignores show context) | **Unchanged** | Not testable from this surface while F22 stands |
| **F29a** (row actions on the public map) | **Unchanged by intent** | `ShowMapTab` is read-only by decision (#291); not a defect |

**Not reached this run:** F3, F4, F5, F6, F7, F8, F9, F12, F13, F14, F15, F16,
F17, F19, F20, F21, F27, F28, F31, F32, F33, F34, F35. F17/F19/F20/F27/F28/F32/F34
were browser-verified on 2026-08-29 and nothing since has touched them; the rest
need either record creation or the show wizard, both out of scope for an
audit-only pass.

## Corrections to my own measurement

Recorded because two of them would have shipped false findings.

- **The eleven download-only reports are not broken.** I first scored them
  FAIL because they produce no embedded document. They are correct: each states
  "…is a downloadable form", offers a Download button, and warns which fields
  still need filling ("Fill before submitting: Address, City, State, Postal
  Code"). Measuring for an iframe was the wrong test.
- **"Prints the named official" is not a reliable string match on the demo
  show.** Six reports there matched "Test Secretary" — but that show has zero
  `show_officials` rows, and the string is a *handler* name in the entry data.
  The claim is only answerable on show `75e078e9`, the one carrying officials,
  where exactly one report — the AKC Scent Work Entry Form — prints it.
- **The double revoke was mine, not the app's.** See F37.

## Open question worth a human answer

On the show that has officials, only the **entry form** prints the named Trial
Secretary. The Trial Secretary Report, Trial Chairman Report, Trial Secretary
Certification and AKC Judge's Report all render, and none of them contains the
name. Whether those forms are supposed to carry it, or the registry body signs
them, is a rulebook question rather than a code question — so it is raised here
rather than filed.

## State left behind

Restored to baseline. Global active-secretary count is 4, matching the count
recorded before the walk started. `secretary@myk9t.com`'s club-scoped
appointment for Heartland is active again (same `user_roles` row `709e84eb…`
reactivated, no duplicate created). One inert row remains — `1c21b300…`,
`exhibitor2@myk9t.com`, `is_active = false` — the ordinary residue of a revoke,
identical in shape to what any revoke leaves.

One show was created to walk task area 1 — `ZZ Walk 0831 - teardown me`,
`bcf76812…` — and deleted through the app's own **More show actions → Delete**.
It is soft-deleted along with its trial and two classes (see F41); no live show
remains. Its two `show_officials` rows persist, which is correct: that table has
no `deleted_at` and its FK to `shows` is `ON DELETE CASCADE`, so those rows clear
on a hard purge rather than a soft delete.

No source edits, commits, migrations or deploys.

## Filed

| Finding | Issue | Priority | Status |
| --- | --- | --- | --- |
| F36 | [MYK9-283](https://linear.app/myk9-platform/issue/MYK9-283) — Check-in Sheet reports a false zero on a cold load and never retracts it | High | **Done** (#1922, verified 2026-09-01) |
| F37 | [MYK9-284](https://linear.app/myk9-platform/issue/MYK9-284) — Revoking show access takes effect on one click, with no confirmation | Medium | Open |
| F41 | [MYK9-285](https://linear.app/myk9-platform/issue/MYK9-285) — Delete-show confirmation promises permanent, irreversible deletion; the app soft-deletes | Medium | **Done** (#1922) |
| F42 | [MYK9-286](https://linear.app/myk9-platform/issue/MYK9-286) — `/shows/new` renders "We couldn't load this show" instead of the create wizard | Low | Open |

F38, F39 and F40 were not filed — all P3, and F39 may be intended behaviour.
Every issue above was checked for duplicates with `includeArchived: true`;
nothing matched.
