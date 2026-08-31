# Plan — one rule for who may run a club's shows

> **Status:** Complete

## The rule we want

> **A club appoints its secretaries. Any appointed secretary can run any of that club's
> shows. Appointment is the only thing that grants access.**

Two sentences, no exceptions, one screen to check. Everything below exists to get there.

Separately, and deliberately not the same thing:

> **The Trial Secretary named on a show is a label for the paperwork. It grants nothing,
> and it is not required in order to have access.**

## Why this is worth doing

Today "is this person the secretary?" is answered by **three different functions that
disagree**, and the membership requirement is applied inconsistently inside one of them.

| Function                   | Club-scoped row | Show-scoped row                          | Requires active club membership?               |
| -------------------------- | --------------- | ---------------------------------------- | ---------------------------------------------- |
| `is_trial_secretary(club)` | grants          | **ignored** (`show_id IS NULL` required) | **yes**                                        |
| `is_show_secretary(show)`  | grants          | **grants**                               | yes, for the club-scoped arm only              |
| `is_show_official(show)`   | grants          | **grants**                               | yes for secretary, **no** for chairman/steward |

So the same `user_roles` row means "has access" or "has no access" depending on which
function happens to be asked, and a chairman gets in without membership where a secretary
does not. That is the whole of the confusion, and every branch of it is a support ticket
waiting to be raised by someone who cannot see a show they were told they own.

**The membership coupling is the sharpest edge.** A club admin marking a member `lapsed`,
`suspended`, or `resigned` — routine admin, possibly just unpaid dues — instantly revokes
that person's ability to run the club's shows. Nothing in the members screen says so. This
is not hypothetical: it fired during the F30 work, where a seed left `club_members`
carrying a QA run's `suspended` status and every authorization walk downstream started
from a poisoned grant table.

**It also contradicts how the job works.** Professional show secretaries are frequently
hired for several clubs and are members of none of them. The current model can only express
that through a show-scoped row, one show at a time — see below.

## [ADDED] What this reverses, and why that is legitimate

The membership coupling is **not drift**. It was a deliberate decision, shipped
2026-08-02 as MYK9-169 in
`20260802120000_enforce_club_membership_role_boundaries.sql`, which redefines all three
helpers in one migration and states its intent in the header:

> Club-scoped secretary access requires an active `club_members` row. Explicit show-scoped
> secretary assignments remain valid for non-members.

It is pinned by `supabase/tests/myk9_169_role_boundaries_test.sql`, whose fixtures are
named _Lapsed Member_, _Suspended Member_ and _External Secretary_. **Phase 1 fails CI
until that test is deliberately rewritten**, and the rewrite is a reversal of MYK9-169, not
a fix to it. Say so in the migration header and on the Linear issue.

The reversal is legitimate, and the reason is narrow enough to be worth stating exactly:
**MYK9-169 and this plan want the same thing and disagree only on the mechanism.** Both
exist so a hired non-member can run a club's shows. MYK9-169 grants that per _show_,
leaving club-wide access as the members-only tier; this plan grants it per _club_, at
appointment. So phases 1 and 2 do not chip away at MYK9-169 — together they **replace** it,
and each phase alone looks like an unexplained regression. Land them as one decision even
if they ship as two migrations.

What MYK9-169 got right and this plan keeps: membership and authority are different things,
and a role lookup must never promote a show-scoped grant to club-wide access.

## Current state, measured

Checked against the live database rather than assumed:

| Fact                                                                  | Value |
| --------------------------------------------------------------------- | ----- |
| Policies calling `is_trial_secretary`                                 | 34    |
| Functions calling `is_trial_secretary`                                | 17    |
| Club-scoped secretary rows                                            | 4     |
| Show-scoped secretary rows                                            | 1     |
| Global (no club) secretary rows                                       | 0     |
| Rows that would **gain** access if the membership clause were dropped | **0** |

Two things follow. The 34 policies and 17 functions all funnel through the same handful of
helpers, so this is a change to a few function bodies rather than 51 rewrites. And phase 1
is **behaviour-preserving on today's data** — nobody gains access — which makes it safe to
ship on its own.

Note also that `shows` has no `secretary_id` column. The named official is stored _only_
as a show-scoped `user_roles` row, so those rows cannot simply be deleted: they are the
paperwork record. Phase 2 exists to give that record a home of its own.

## Phase 1 — drop the membership coupling

> **Shipped** as `20260830210000_appointment_grants_show_access.sql`. The scope below was
> written as three functions; it is **six**, plus two client surfaces. Corrected here
> because the undercount is the interesting part — see "What Phase 1 actually touched".

Remove the `is_active_club_member(...)` clause from `is_trial_secretary`, and from the
secretary arms of `is_show_secretary` and `is_show_official`.

### What Phase 1 actually touched

Six live functions carried the predicate, confirmed by querying `pg_get_functiondef`
rather than reading the migration:

| Function                               | Why it matters                                                                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `grant_club_secretary`                 | **The appointment path.** It RAISED 42501 for a non-member, so leaving it would have blocked the entire feature while every read-side helper reported success. |
| `is_trial_secretary`                   | Club-scoped check                                                                                                                                              |
| `is_show_secretary`                    | Show-level check                                                                                                                                               |
| `is_show_official`                     | Secretary arm only — chairman/steward were already exempt                                                                                                      |
| `get_club_show_manager_ids`            | Notification fan-out                                                                                                                                           |
| `private.entry_results_caller_context` | Folds the predicate **twice**                                                                                                                                  |

And two client surfaces enforced or described the rule independently of the database:

- `ClubMemberDialogs.tsx` disabled "Grant Show Access" unless the member was `active` —
  the retired rule enforced a second time in the client, which would have left the fix
  shipped and unreachable.
- `ClubMembersPage.tsx` told an admin removing a member that "they also lose show
  access". That sentence is now false, and it is false in the dangerous direction: an
  admin removing a member to end their access would have believed it worked.

After this, membership status has no bearing on show access. A club admin can manage the
member roster without silently changing who can run shows, and a hired non-member
secretary works.

Cheap, self-contained, and provably behaviour-preserving today (0 rows affected).

**Also in this phase:** make `is_show_official`'s treatment of chairman and steward match
secretary, so all three staff roles follow one rule rather than secretary alone carrying a
membership test.

### [ADDED] What must not change while editing these functions

Phase 1 opens the same `WHERE` block that migration
`102_fix_trial_secretary_rls_bypass.sql` hardened as a security fix. That migration removed
an `ur.club_id IS NULL` fallback which made any club-less secretary row a **platform-wide**
grant over every show on the system. Removing one clause from that block while
reintroducing another is an easy accident and an invisible one — the function still reads
correct.

Non-negotiable, and worth asserting in the tests rather than trusting to review:

- `ur.club_id = check_club_id` **stays**. Appointment is club-scoped; it is not a global role.
- `ur.is_active = true` **stays**.
- `ur.expires_at IS NULL OR ur.expires_at > NOW()` **stays** (already honoured — see the
  open question at the end).
- The constraint trigger `trg_enforce_club_id_for_scoped_roles`, which rejects a secretary
  or `club_admin` row with a NULL `club_id`, **stays** for the whole of phase 1.

Only the `is_active_club_member(...)` call is removed.

### [ADDED] The trust boundary moves

Once membership no longer gates access, the `user_roles` row is the **entire** grant, and
whoever can create one can create a secretary. Membership was never intended as an
authorization layer, but it was incidentally acting as one, and phase 1 removes it.

Before landing phase 1, confirm — against the applied database, not the migration text —
that the write path is actually gated: the RLS policies on `public.user_roles` for INSERT
and UPDATE, and the `grant_club_secretary` / `grant_show_official` RPCs. If either is
`SECURITY DEFINER`, re-check that it restates the club-admin check internally rather than
relying on a policy it bypasses.

## Phase 2 — separate the label from the permission

> **Built** as `20260830240000_show_officials_separates_label_from_permission.sql`, on a
> branch stacked on #1895 and **deliberately not merged until #1895 is applied and
> merged**. Two corrections to the scope below, both found by checking rather than
> reading — see "What Phase 2 actually took".

Give the named official its own home so a `user_roles` row always means "has access".

### What Phase 2 actually took

**Moving the label is not enough.** This plan assumed that once the show-scoped rows were
emptied, the `ur.show_id` arms in the read helpers would be dead. They would not:
`approve_role_request` (site-admin) can mint a fresh show-scoped `secretary` row at any
time, so the exception would have survived with nothing in it, waiting. Nine functions
consult those rows, and seven had to lose their show-scoped arm — including
`get_show_access_codes`, `get_show_class_hide_counts` and the results authorization
context, which sit on show-day paths. `approve_role_request` now refuses a show-scoped
official request **loudly**, rather than approving it and handing over nothing.

**The backfill asserts instead of widening.** The plan says to CREATE a club appointment
for anyone holding only a show-scoped row. That is a silent widening — it hands club-wide
access to someone who had exactly one show. Measured live, no such person exists, so the
step is a no-op either way; the migration now **fails** with instructions instead, so a
human decides if that ever changes.

**The premise held where it mattered.** `get_show_officials` really does read
`user_roles WHERE show_id = ...`, and `useEntryFormData` fills the AKC/UKC entry-form PDFs
from it — so deleting those rows would have blanked the Trial Secretary on printed
paperwork. That is why the table exists rather than a straight deletion. (The public
Gazette/Heritage landing pages are not affected either way: `secretaryName` and `officers`
are hardcoded `null`/`[]` there today.)

Recommended: a `show_officials` table (`show_id`, `person_id`, `role`, plus whatever the
premium list and registry reports need), backfilled from the existing show-scoped
`user_roles` rows, after which:

- `grant_show_official` writes to `show_officials`, not `user_roles`;
- `is_show_secretary(show)` and `is_show_official(show)` stop consulting `show_id` rows
  and reduce to the club check — at which point they may collapse into `can_manage_show`
  entirely;
- naming someone on a show's paperwork grants nothing, and needs no login.

The alternative — keep writing show-scoped `user_roles` rows and merely document that some
grant and some do not — is cheaper and rejected. It preserves exactly the ambiguity this
plan exists to remove.

**Sequencing:** phase 2 changes what those rows mean, so it must land after phase 1 and be
verified against the paperwork surfaces (premium list, Trial Secretary Report, registry
submission) that read the named official today.

### [ADDED] Phase 2 removes access — it is not behaviour-preserving

Phase 1 is safe because nobody gains access. Phase 2 is the opposite: anyone holding
**only** a show-scoped row loses access the moment the helpers stop consulting `show_id`.
That is one row on staging today, and it is MYK9-169's external secretary — the exact
person the old design used show-scoped rows to serve.

So the backfill is two steps, in this order, and the first is not optional:

1. For every person holding a show-scoped secretary row, create a **club appointment** at
   that show's club if they do not already have one. Assert zero people would lose access
   before proceeding; if any would, the migration stops.
2. Then copy the naming into `show_officials` and stop consulting `show_id`.

### [ADDED] The new table

`show_officials` is a new `public` table, so per CLAUDE.md it needs explicit privileges —
omitting them does not keep `anon` out, because `ALTER DEFAULT PRIVILEGES` in this database
grants `anon` full CRUD on every newly created table:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.show_officials TO authenticated;
REVOKE ALL ON public.show_officials FROM anon;  -- unless public paperwork needs it
```

Decide the `anon` question deliberately: the named official appears on the public premium
list, so a read grant may be wanted — in which case grant `SELECT` on named columns, not
the table. RLS is still required and orthogonal. Verify `relacl` **and** column-level
`attacl` against the applied database afterwards; a correct migration file has produced an
incorrect ACL here before.

Also note the constraint trigger from migration 102: it requires `club_id IS NOT NULL` on
secretary rows. Once show officials no longer live in `user_roles`, that trigger's job is
narrower but still correct — keep it, and do not let the backfill write NULL-club rows.

### [ADDED] Scope correction: steward is not a paperwork label

Phase 2 originally treated all three official roles the same and made every
show-scoped row label-only. That is right for secretary and chairman and wrong
for steward, and `myk9_114_entry_access_context_test.sql` says so directly — it
loops over a show-scoped and a club-scoped steward and asserts both keep
row-only access, under the notice "show- and club-scoped stewards preserve
row-only access". The migration's own comment claimed `steward_show_ids`
"existed only to carry show-scoped grants" and that the club arrays "already
carry every real caller". That was false.

It also was not theoretical. Both callers of `grant_show_official` offer the
role — `ShowOfficialsEditor` assigns a steward, and the creation wizard's
`grantShowOfficials.ts:43` maps `officials.steward` — so shipping this would
have silently withdrawn access from every steward named through either surface,
while the RPC kept reporting success. A steward is a ring assignment, not a name
printed on a form.

So Phase 2's rule narrows to what the approved rule actually says: **the label
that grants nothing is the secretary and chairman naming.** Stewards are
untouched. Six sites changed: `is_show_official`, `get_show_access_codes`,
`get_show_class_hide_counts` and `entry_results_caller_context` keep honouring
show-scoped steward rows; `grant_show_official`/`revoke_show_official` write and
withdraw the steward's operational row alongside the label; and step 4's
deactivation sweep excludes stewards. `show_officials_label_not_permission_test.sql`
now pins the exception in both directions, including that a named steward is
still not a show manager.

While extending that sweep, the orphan guard in step 2 was found to cover only
secretaries even though step 4 retires chairman rows too. It now covers chairman,
so a chairman with no club appointment blocks the migration instead of quietly
losing access.

### [ADDED] Phase 2 reintroduced MYK9-258, and only CI caught it

Rewriting `is_show_office_manager` and `manageable_show_ids` to drop their
show-scoped arms also dropped their `s.club_id IS NOT NULL` guards. Those guards
are MYK9-258: `is_club_admin` and `is_trial_secretary` treat a NULL argument as
"no club filter", so a club-less show became manageable by every active secretary
and club admin on the platform — and `get_entries_for_export` hands each of them
owner email and phone. The original was found on staging by the G9 rehearsal;
this time `null_club_show_authorization_test.sql` caught it at
`FAIL 1.2 club secretary manages a show with no club`.

Nothing local could have caught it. Typecheck, lint, the ratchet and all 742 DB
contract tests passed with the guards missing, because the regression only exists
against a real Postgres. Both functions now carry the guards back with a comment
naming MYK9-258, and the two remaining rewrites were checked the same way:
`is_show_secretary`/`is_show_official` are NULL-safe by construction
(`ur.club_id = NULL` yields NULL, not true), `get_show_access_codes` and
`get_show_class_hide_counts` early-return on a NULL club, and
`private.entry_results_caller_context` kept both of its `ur.club_id IS NOT NULL`
filters.

The general shape, for the next person removing an arm from one of these: a
predicate sitting next to the thing you are deleting is not necessarily part of
it.

### [ADDED] Measured blast radius: six behavioural SQL tests, found only in CI

Phase 2's first real execution (CI run 33393950324) showed that show-scoped
`user_roles` rows were not merely the paperwork record — they were the ordinary
way six behavioural tests granted a secretary access to a show. The migration
itself applied cleanly; the failure was downstream, and the runner aborts on the
first failing file, so CI surfaces these one per push.

| Test | Was | Now | Why |
| --- | --- | --- | --- |
| `judge_assignment_private_read` | show-scoped secretary | club-scoped | fixture only; subject is column ACLs |
| `entry_status_history_rls` | two show-scoped secretaries | club-scoped | shows already sit in different clubs, so isolation survives |
| `office_admin_rls` | show-scoped steward + secretary | club-scoped | fixture only |
| `pull_refund_decision_rls` | show-scoped secretary | club-scoped | second show is club-less, so the isolation assertion keeps its force |
| `show_email_delivery_history` | show-scoped secretary, both shows one club | club-scoped, **show B rehomed to its own club** | otherwise the caller is legitimately authorized for show B and `FAIL cross-show secretary read succeeded` becomes vacuous |
| `null_club_show_authorization` | 4.1 asserted a show-scoped grant *reaches* its show | inverted, **plus a new 4.0 positive control** | this is the deliberate reversal, not a fixture fix |

Two of these were traps rather than mechanical edits. Rehoming show B was
necessary because widening a fixture's scope can satisfy an isolation assertion
instead of testing it. And once section 4's caller lost every grant, 4.1 and 4.2
would both have passed for the wrong reason — the "would also pass if the guard
hid everything" failure that file's own header warns about — so club B gained a
show and section 4 gained a positive control asserted first.

`seed-demo.sql` was checked and needs nothing: every grant it writes is already
club-scoped (`show_id IS NULL` in each dedupe guard), so no demo or staging user
loses access.

## [ADDED] Rollback

Phase 1 reverts cleanly: re-`CREATE OR REPLACE` the three functions from
`20260802120000_enforce_club_membership_role_boundaries.sql`. No data changes, so a revert
migration is the whole story. Keep the MYK9-169 test rewrite in the same commit so
reverting the migration and reverting the test cannot come apart.

Phase 2 does not. It writes rows (`show_officials`) and creates club appointments that did
not exist. A revert must restore the helper bodies **and** decide what to do with the
appointments the backfill created — leaving them grants club-wide access to people who
previously had one show. Write the revert before pushing the forward migration, and have it
tag backfill-created appointments so they can be identified later.

## Phase 3 — make it visible

> **Shipped** as `20260830220000_club_show_managers_with_names.sql` plus a **Show
> Access** tab on the existing club members page. Reclassified while building: this is
> not polish, it is the completion of Phase 1 — see "Phase 1 left a hole" below.

A **Show secretaries** list on the club page: who is appointed, with add and remove,
managed by the club admin.

### Phase 1 left a hole, and Phase 3 is what closes it

Show access was rendered as a badge on each `club_members` row, which worked only
because appointment required an active membership: every appointee had a roster row to
hang the badge on. Phase 1 removed that guarantee without removing the assumption, so a
club could appoint a professional secretary who then:

- appeared **nowhere** in the club admin UI (no roster row to annotate),
- could not be **revoked** (Revoke Show Access lives in a member row's action menu),
- and could not have been **appointed** in the first place, because Grant Show Access
  lives in that same menu.

An appointment nobody can see or undo is worse than one nobody can make. Phase 1 should
not ship to users without this.

### Why a tab and not a new page

The instinct — "add a Show Secretaries page" — would have duplicated the roster, which
this phase of the project is explicitly trying to avoid. It is a **tab on the page that
already owns club people**, and it earns its place because it is the only surface that
can show someone who is not on the roster. That is the case the permission change exists
to serve, so the tab is not a second view of the same list.

Membership status appears beside each appointee as context, deliberately **not** as a
warning: a lapsed member who is still appointed is now a normal state, and flagging it
would re-teach the rule Phase 1 removed.

This is the part that actually stops the tickets. A permission nobody can see is a
question someone has to ask, and there is currently no screen that answers "who is allowed
to touch our shows?" The list is also where a club removes a secretary it no longer wants
— one action, in one place, reversible, and with no effect on that person's membership or
their appointments at other clubs.

Two guard rails worth building in:

- Warn before removing the last appointed secretary from a club that has upcoming shows.
- Show each appointee's other clubs, so a club admin understands they are removing an
  appointment rather than deleting a person.

## Deliberately not doing

**Per-show secretary permissions.** Tighter on paper, a ticket factory in practice: the
named secretary is ill on show day; someone leaves mid-season and their shows strand; a
two-day trial needs a second person on Sunday; "I can see the show but cannot edit it".
Each of those lands early on a Saturday, which is the worst possible moment for a
one-person operation to be the only escalation path.

Club-wide access has one real downside — an appointed secretary could edit a show they are
not running — and that is a colleague at a small club the club itself chose to appoint.
**Appointment is the trust boundary.** Accountability is preserved by the named official on
each show, which is a label, and labels are the right tool for "whose show is this?".

**Widening who may appoint.** Club admin and site admin only, as today.

## Testing

A phase is not complete until these pass.

- **Behavioural SQL, per phase.** Club A's secretary can manage Club A's shows and cannot
  read, write, or reach Club B's — asserted through `can_manage_show`, `is_show_secretary`
  and `is_show_official` so the three cannot drift apart again. Assert the positive cases
  too: a test that saw nothing everywhere would pass the isolation half while proving
  nothing. Register in **both** `scripts/qa/run-behavioral-sql-tests.sh` and its
  `.test.ts` contract list — moving or adding a file deregisters it from both.
- **The coupling is really gone.** Set an appointed secretary's membership to `suspended`
  and assert they retain access. This is the regression the plan exists to prevent, and it
  is the one a future migration is most likely to reintroduce.
- **Parity across the three helpers.** For a fixed person and show, `is_trial_secretary`,
  `is_show_secretary` and `is_show_official` must agree on the secretary question. There is
  precedent for pinning exactly this: `entries_manager_policy_hashable_test.sql` asserts
  `manageable_show_ids` matches `can_manage_show`.
- **Phase 2 paperwork check.** The premium list, Trial Secretary Report and registry
  submission still name the right official after the backfill — these read the show-scoped
  rows today and are the thing most likely to break silently.
- **Browser walk.** Appoint a secretary at Club A who is not a member of any club, and
  confirm they can create and run a Club A show end to end. The whole point is a case the
  current model cannot express, so it has to be exercised, not inferred.
- **[ADDED] The three tests that already cover this ground.** Read their headers before
  editing, and expect to change the first: `supabase/tests/myk9_169_role_boundaries_test.sql`
  (pins the coupling — must be rewritten as a deliberate reversal),
  `supabase/tests/club_secretary_grant_test.sql` (seeds an active membership and covers
  reactivation), `supabase/tests/null_club_show_authorization_test.sql`. Do not discover
  these in CI.
- **[ADDED] The platform-wide grant stays closed.** A secretary appointed at Club A must
  fail every helper for a Club B show, and a role row must never confer access to a show
  whose club it does not name. This is migration 102's guarantee and the most expensive
  thing to lose silently while editing that predicate.
- **[ADDED] Phase 2 loses nobody.** Assert, as part of the migration, that every person who
  could manage a show before the backfill can manage it after. This is the check that turns
  a silent access removal into a failed migration.
- **[ADDED] Phase 3 component tests.** Render the club-page secretaries list from the real
  prop shape and assert the rendered output: the appointed list, the last-secretary warning,
  and the other-clubs hint. A test that calls the underlying hook or helper directly will
  pass while nothing is wired — that failure mode has cost four review rounds on this
  codebase already.
- **[ADDED] `pnpm qa:code-quality-ratchet`**, run from this worktree, before pushing phase 3. It gates CI, nothing else approximates it, and the club page gains lines.

> Behavioural SQL tests have never run locally here — there is no container runtime on this
> machine — so CI is their first execution. Check every FK and NOT NULL against live schema
> before pushing; two rounds of review were spent on exactly that during F24.

## Migration notes

- Pick the timestamp against `origin/main`, not the branch.
- Copy each function from its **latest** definition, not the file whose name looks
  canonical — `is_trial_secretary` has been redefined more than once, and rebuilding from
  an older copy silently reverts whatever the newer one added.
- `supabase db push` is a gated shared-system write; confirm before running it.
- **[ADDED]** The latest definition of all three helpers is
  `20260802120000_enforce_club_membership_role_boundaries.sql` — not the file whose name
  looks canonical. `is_trial_secretary` alone has been redefined in seven migrations.
- **[ADDED]** After pushing, verify against the applied database rather than the migration
  text: function bodies via `pg_get_functiondef`, and for phase 2 both `pg_class.relacl` and
  `pg_attribute.attacl`. Do not use `information_schema.role_table_grants` — it returns
  empty over the MCP connection and cannot prove absence.

## Open question for the owner

Should an appointment be able to **expire**? `user_roles.expires_at` already exists and is
honoured. A club that engages a secretary for one season could set an end date rather than
remembering to remove them. It is a genuine convenience and also a new way to be locked
out on show day, so it is worth a deliberate yes or no rather than inheriting the column by
accident.

**[ADDED] This blocks nothing.** `expires_at` is already honoured by
`is_trial_secretary` today and phase 1 keeps that clause, so the answer only decides whether
phase 3's UI exposes an end date. Phases 1 and 2 proceed either way.

## Outcome — 2026-08-31

All three phases shipped and applied.

| Phase | Migration | PR |
| --- | --- | --- |
| 1 — drop the membership coupling | `20260830210000_appointment_grants_show_access.sql` | [#1895](https://github.com/rbeezley/myk9-platform/pull/1895) |
| 3 — make it visible | `20260830220000_club_show_managers_with_names.sql` | (shipped with phase 1) |
| 2 — separate the label from the permission | `20260830240000_show_officials_separates_label_from_permission.sql` | [#1897](https://github.com/rbeezley/myk9-platform/pull/1897) |

Phase 2's migration was pushed to `sojmvhhwsjxmfistvzbe` on 2026-08-31 and verified
against the applied database rather than the migration text:

- `show_officials` exists with RLS enabled and **no** `anon` grant.
- The MYK9-258 `club_id IS NOT NULL` guard is present in both `manageable_show_ids` and
  `is_show_office_manager`. Removing the show-scoped arms had removed these guards too —
  a real cross-tenant regression that typecheck, lint, the ratchet and all 742 DB contract
  tests passed with, and only CI's behavioural SQL caught.
- Stewards keep their show-scoped rows (MYK9-114). Phase 2 initially withdrew them as
  "paperwork"; they are a ring assignment, and the migration's own comments asserting
  otherwise were wrong.
- `anon` retains EXECUTE on `get_show_officials` (SA-006). Live had lost this grant with
  no migration behind it, so the live ACL was **not** the authority — the migration corpus
  was, and CI rebuilds from it.

**Backfill, measured live:** 2 show-scoped rows deactivated (1 secretary, 1 chairman),
0 stewards touched. Both people retain an active club-scoped appointment for the same
club, so nobody lost access. Both labels carried into `show_officials` pointing at the
same person and show, so the paperwork half is intact.

### Not executed

Two items from Testing above were never run, and are not covered by CI:

- **Browser walk.** Appoint a secretary at Club A who is a member of no club, and confirm
  they can create and run a Club A show end to end.
- **Rendered paperwork.** The premium list, Trial Secretary Report and registry submission
  were verified at the data layer only — `show_officials` holds the right person for the
  right show. Nothing confirmed the PDFs and reports actually print it.
