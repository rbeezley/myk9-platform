# Plan — one rule for who may run a club's shows

> **Status:** Active

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
hired for several clubs and are members of none of them. The current model cannot express
that at all.

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

Remove the `is_active_club_member(...)` clause from `is_trial_secretary`, and from the
secretary arms of `is_show_secretary` and `is_show_official`.

After this, membership status has no bearing on show access. A club admin can manage the
member roster without silently changing who can run shows, and a hired non-member
secretary works.

Cheap, self-contained, and provably behaviour-preserving today (0 rows affected).

**Also in this phase:** make `is_show_official`'s treatment of chairman and steward match
secretary, so all three staff roles follow one rule rather than secretary alone carrying a
membership test.

## Phase 2 — separate the label from the permission

Give the named official its own home so a `user_roles` row always means "has access".

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

## Phase 3 — make it visible

A **Show secretaries** list on the club page: who is appointed, with add and remove,
managed by the club admin.

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

> Behavioural SQL tests have never run locally here — there is no container runtime on this
> machine — so CI is their first execution. Check every FK and NOT NULL against live schema
> before pushing; two rounds of review were spent on exactly that during F24.

## Migration notes

- Pick the timestamp against `origin/main`, not the branch.
- Copy each function from its **latest** definition, not the file whose name looks
  canonical — `is_trial_secretary` has been redefined more than once, and rebuilding from
  an older copy silently reverts whatever the newer one added.
- `supabase db push` is a gated shared-system write; confirm before running it.

## Open question for the owner

Should an appointment be able to **expire**? `user_roles.expires_at` already exists and is
honoured. A club that engages a secretary for one season could set an end date rather than
remembering to remove them. It is a genuine convenience and also a new way to be locked
out on show day, so it is worth a deliberate yes or no rather than inheriting the column by
accident.
