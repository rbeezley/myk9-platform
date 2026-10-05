# Domain Glossary

Canonical terms for the myK9 platform domain. Use these names exactly in code,
documentation, and architecture discussions — not synonyms.

**On screen, use the words in this file.** Where a term below lists _Avoid_
words, they must not appear in user-visible text. A few database and code names
predate this vocabulary and stay as they are (listed under "Internal names").

## Core Entities

**Entry**
One dog entered in one class at one trial. An Entry has a status
(pending, accepted, wait-listed, scratched, absent) and belongs to exactly
one Show via its Trial and Class. The unit of ringside work.

The canonical seam for every Entry `entry_status` change is
`services/database/entries/lifecycle.ts`. Every status transition has a
named function (`scratchEntry`, `scratchEntryDayOf`, `requestScratch`,
`approveScratchRequest`, `denyScratchRequest`, `markEntryMoved`,
`rollbackEntryMove`, `denyMoveUpRequest`, `restoreEntryStatus`,
`acceptEntry`, `rejectEntry`, `waitlistEntry`) that:

- Writes the status field + any side-effect fields the transition implies
  (e.g., `check_in_status='pulled'` for day-of scratch).
- Emits an `auditService.log` entry recording the from/to status and the
  domain action.

Direct `entry_status:` writes outside `lifecycle.ts` are a convention
violation. Day-of-operations files (`day-of-operations/scratch.ts`,
`move-up.ts`, `entries.ts`) retain their orchestration role
(eligibility queries, capacity checks, secretary workflows) but compose
lifecycle transitions rather than writing `entry_status` directly.
INSERTs that create new entries (walk-in entry, waitlist
promotion, the new row in a move-up's target class) are not transitions
and stay where they are.

Out of scope for this seam: the dual `EntryStatus` enum
(`@/types/entry-lifecycle` vs `@/types/show-registration-types`) and
refund accounting (`refund_status`, `refund_amount`,
`updateRefundStatus`). Both stay as-is.

The canonical query-invalidation contract for Entry mutations is
`entryInvalidationKeys(change: EntryChange)` in
`services/database/entries/invalidation.ts`. It accepts an optional
context (`showId`, `classId`, `dogId`) and returns the complete set of
React Query keys that must be invalidated after a write. All entry
mutation hooks (`useEntriesDatabase`, `useClassesDatabase`) call this
helper in their `onSettled` handlers — never hand-assemble key lists at
call sites.

The canonical module for secretary entry-management workflows is
`services/database/entries/management-actions.ts`. It exports three
pure orchestration functions with injected adapters (no React
dependency):

- `executeStatusChange` — optimistic update → lifecycle transition →
  armbandPatch or rollback on failure.
- `executeBulkStatusChange` — DB write → local state update →
  conditional full reload (ACCEPTED only, to pick up trigger-assigned
  armbands).
- `executeRemoveEntry` — snapshot → optimistic remove → soft-delete →
  rollback on failure; returns `{ removed: boolean }` so callers can
  gate toasts.

`useEntryManagementActions` is the thin React binding that supplies
these functions with React Query adapters and local `useState` setters.
New orchestration logic belongs in the module, not in the hook.

**Class**
One competition offering at one Trial, such as "Container Novice A" on
Saturday. Its identity is an Element, a Level and, where the sanctioning
organization splits the level, a Section. It also holds that Trial's settings:
entry limit, entry fee, assigned judge, run order, start time and status. The
same Element, Level and Section at two different Trials are two different
Classes. Classes belong to Trials, not directly to Shows.
_Avoid_: Division (as a synonym for Class), Event

**Class name**
A Class's display label, built from its Element, Level and Section, such as
"Container Novice A".

**Element**
The kind of search a Class tests, such as Container, Interior, Exterior,
Buried or Handler Discrimination. Which Levels an Element offers depends on the
sanctioning organization.

**Level**
The difficulty step within an Element, such as Novice, Advanced, Excellent or
Masters. Levels are ordered from easiest to hardest.

**Section**
The split of one Level into separate Classes, such as A and B in AKC Novice, or
"Level C" in ASCA. UKC calls the same thing a Division, so a UKC Trial shows
"Division" where an AKC Trial shows "Section". Stored in `classes.section`.
_Avoid_: Division, as a name for anything else (the code's `division` map groups
Elements for the future titles surface; it is not shown to users)

**Sanctioning organization**
The body whose rules a Trial runs under: AKC, UKC or ASCA. A Show never mixes
organizations. Stored as `trials.registry_id`.
_Avoid_: Registry, Sanctioning body (in user-visible text)

**Scheduled Start**
The originally published or configured start time for a Class. It remains
unchanged when show-day delays alter the current expectation.
_Avoid_: Original time, old time

**Revised Expected Start**
The secretary's current best estimate of when a delayed or rescheduled Class
will begin, recorded without replacing its Scheduled Start.
_Avoid_: New scheduled time, Actual Start

**Actual Start**
The timestamp recorded when a Class begins competition.
_Avoid_: Revised Expected Start, start estimate

**Actual Finish**
The timestamp recorded when a Class finishes competition.
_Avoid_: Score-entry completion, results release time

**Class Lifecycle Status**
The recorded operational state of a Class: Not started, In progress, Complete,
or Cancelled. Complete means judging has physically finished; it does not assert
that paper scores have been entered.
_Avoid_: Running as a status label, Stage

**Trial**
A single day or session of competition within a Show. A Show has one or more
Trials; each Trial has one or more Classes.

**Show**
The top-level event created and managed by a Club. A Show has a date range,
location, and one or more Trials. The unit of secretary work.

**Operational Area**
A named physical place used for competition activity at a Show. Sport-specific
interfaces may call it a Search Area, Ring, or Course, and one Class may use
more than one Operational Area.
_Avoid_: Ring as the universal term, Judge as a location proxy

**Paperwork Print**
A staff-confirmed record that a specific kind of Show, Trial, or Class
paperwork was physically printed, including who confirmed it and when. Opening
a report, generating a PDF, or launching the browser print dialog is not a
Paperwork Print.
_Avoid_: Print click, report view, PDF generation

**Report Scope**
The Show, Trial, or Class whose records a report includes. A report opened from
one of those contexts defaults to that context, while staff may deliberately
choose another supported Report Scope.
_Avoid_: Page scope, filter scope

**Dog**
A canine competitor. A Dog has an owner (Handler or Exhibitor), breed, titles,
health records, and, where it has one, a Registration with each sanctioning
organization. Dogs are shared across Shows.

**Registration**
A Dog's registry number with a sanctioning organization such as AKC, UKC or
ASCA. It identifies the Dog, not a Show submission. One Dog can have several
Registrations. Stored in `dog_registrations`.
_Avoid_: Registration for an Entry form, an Entry or a Payment

**Achievement**
A title, qualification, or recognition earned by a Dog from a sanctioning
organization (AKC, UKC, etc.). Records the organization, date earned,
certificate number, and notes. One Dog has many Achievements; an Achievement
belongs to exactly one Dog. Distinct from in-progress Entries — an Achievement
is a permanent record of a result already conferred.

**Handler**
The person who physically runs a dog in the ring. May be the dog's owner or
a designated agent. Tracked per Entry.

**Exhibitor**
A person who enters one or more dogs in a Show. May be the dog's owner,
co-owner, or agent. The billing and communication unit.

**Club**
The organizing body that hosts Shows. A Club has members, roles (secretary,
treasurer, show chair), and a history of Shows.

**Secretary**
The show or trial official accountable for running a specific Show end to end:
setup, entries, armbands, run orders, show-day changes, results, and closeout.
Distinct from Club Admin and Treasurer, even when the same person fills more
than one role.

**Armband**
The unique numbered identifier assigned to a Dog for an entire Show. The number
stays the same across all of that Dog's Entries and Show days, while a Handler
may handle multiple Dogs with different Armbands.

**Armband Label**
A printable daily label for an Armband assignment, produced once per
Dog/Armband for each included Show day. It identifies the Armband and may
include the Dog's call name, Handler, Trial date, or show-access information.
_Avoid_: Entry label, Result Label

**Result Label**
A printable label for one Entry's competition result, including its Class
context and available placement, time, or faults.
_Avoid_: Ribbon label, Armband Label

**Wait List**
An ordered list of Entries that did not make the initial entry limit for a
Class. Entries are promoted from the Wait List as space opens.

**Entry form**
One Exhibitor's submission for a Show: the Dogs and Classes they chose, turned
into persisted Entries, with the payment details, confirmation number and
Armband assignment. One Entry form can contain multiple Entries, and each Entry
may name a different Handler. The Entry form's person is the Exhibitor and must
not be presented as the Handler for every Entry. A mail-in paper entry form
becomes an Entry form when the Secretary keys it in.
_Avoid_: Registration, Enrollment, Submission, Order (in user-visible text)

**Pull**
An Exhibitor chooses not to compete, such as leaving early or changing their
mind, typically late or on the day. No refund is promised: the Club decides
whether to refund. Pull is the only word for this act; the stored states
`scratched` and `pulled` describe it.
_Avoid_: Scratch, Withdraw (they are different acts)

**Withdraw**
An Entry is withdrawn for one of exactly two reasons, In Season or Judge
Change, and is refunded under the premium's rules. Leaving a Wait List is also
a withdrawal. The reasons and cutoff come from each sanctioning organization's
rules (ASCA has no In Season withdrawal), not from app constants.
_Avoid_: Pull (a different act), Cancel

**Result**
The outcome of one Entry's run in a Class: qualification (Q, NQ, E, EX, DQ,
ABS), time, faults and, once the whole Class is scored, placement.

**Payment**
Money an Exhibitor pays for an Entry form, and what the Exhibitor sees on
screen and on receipts. Card payments run through Stripe; cash and check
payments are recorded by the Secretary. Refunds are never automatic: only a
person's action may issue one.
_Avoid_: Order (in user-visible text; it is the internal Stripe name)

**Promo Code**
A discount token issued by a Club, scoped to a single Show or a single Trial.
Has a code string, discount type (`percentage` | `flat`), discount value,
optional usage limit, optional expiry, and a running usage count. Applied at
checkout on an Entry form to reduce entry fees. Trial-scoped codes
take priority over show-scoped codes when both match.

**Announcement**
A timed message posted by a Secretary or Club staff to the attendees of a
Show. Has a title, body, priority, optional expiry, and an `is_active` flag;
visible to Exhibitors and Handlers attending the Show. Per-user read state
lives in a sibling `show_announcement_reads` table so the unread badge is
per-viewer, not per-announcement. Announcements are show-scoped today; the
single-word entity name reserves room for the table to grow other scopes
without a rename.

**Health Record**
A record about a Dog's health — vaccinations, medications, allergies, vet
visits, OFA screenings (hip/elbow X-rays for breeding-eligible dogs), and
genetic screenings. Each sub-type lives in its own table but all are owned
by a Dog. Statistics, timeline, and search cross-cut the sub-tables and
share a single canonical module so callers can read "everything about this
dog's health" without coordinating across files.
The canonical synthesizing function is `getDogHealthOverview(dogId, options?)`
in `health-records/umbrella.ts`. It returns a `HealthOverview` bundle with
active state (medications, allergies, upcoming items), windowed recent
history (default last 12 months), one-time screenings, and roll-up
statistics. Per-sub-table reads remain available for editing single rows;
the umbrella is for synthesized "what about this dog's health" views.

**Pedigree**
A Dog's ancestor lineage tree. Stored as rows in `pedigree_ancestors`
keyed by `(dog_id, position)` — each row is one ancestor at a known
position in the family tree. The Pedigree is the collection; individual
rows are ancestors. Used for breeding records and breed-club registration
paperwork.

**Onboarding Request**
A request submitted by a Club asking to join the myK9 platform. Captures
the club name, organization (sanctioning body), contact details, and
optional first-show date and message. Status (`pending | contacted |
onboarded | declined`) tracks the workflow; admin staff move requests
through the states from the admin dashboard. Distinct from a User's
account-signup flow — this is per-Club platform onboarding.

**Premium Template**
A reusable show-program template owned by a Club. Holds the standard
vet-clinic details, hospitality notes, accommodations, awards copy, and
cover image style that the club reuses across Shows. A separate
`premium_generations` table records each per-Show generation event with
the field overrides and narrative edits applied that time — used by the
admin "recent generations" panel to seed defaults from a prior premium.
"Premium" in this context means the printable show prospectus, not a
billing tier.

**Manual Result**
A competition result entered manually by a Dog's owner — distinct from
in-system Show results, which are recorded automatically as part of the
Entry lifecycle. Used to log trial results from shows the platform didn't
run (e.g. AKC trials at non-myK9 events). A series of qualifying Manual
Results may aggregate into an Achievement once the sanctioning body's
title requirements are met.

**Club Membership**
The people affiliated with a Club, spanning three sub-concepts: regular
members (`club_members` — membership records with dues, voting eligibility,
membership type), elected officers (`club_officers` — president,
treasurer, etc. with term dates), and show managers (people granted the
SECRETARY RBAC role scoped to the club, allowing them to create and
manage that club's Shows). The same Person can hold any combination of
the three roles. Distinct from Club itself (the organization) — this
entity is about who's in it.

**Training Record**
A Dog's training log, spanning three sub-tables: journal entries
(`training_journal_entries` — per-session notes), goals
(`training_goals` — open-ended objectives), and training milestones
(`training_milestones` — dated achievements within the training journey).
Distinct from the User-platform `milestones/` canonical, which covers
account-level milestones like first signup or first show; training
milestones live per-Dog and represent learning checkpoints. Function
names are entity-prefixed (`getAllTrainingMilestones` not
`getAllMilestones`) so grep doesn't conflate the two domains.

## Internal names

These predate the vocabulary above. They stay as they are; do not rename them
for the sake of the glossary, and do not copy them into user-visible text.

| Glossary term            | Internal name                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry form               | `enrollments` table, `Enrollment*` components, `enrollmentId`, `groupEntriesByEnrollment`, `registration_confirmation_seq`, `entries.registration_id` |
| Payment (card)           | `stripe_orders`, `stripe_order_refunds`, `entry_payment_links`                                                                                        |
| Payment (cash, check)    | `show_payments`, `record_enrollment_payment()`                                                                                                        |
| Sanctioning organization | `registry_id`, `RegistryId`                                                                                                                           |
| Registration             | `dog_registrations`                                                                                                                                   |

## Data Access Modules

Each entity has one authoritative data access module under
`apps/myk9show/src/services/database/<entity>/`. Callers import only from
that module's `index.ts` — never from `supabaseClient` or replication tables
directly.

Replicated entities (cached in IndexedDB for offline reads): Entry, Class,
Trial, Dog, Show, Armband.

PostgREST-only entities (online reads): Club, Handler, Exhibitor, Volunteer,
WaitList, Secretary tasks, Visibility settings, Achievement, Promo Code,
Announcement.

**Replicated Table Sync**
The package-owned workflow that keeps a replicated entity's IndexedDB cache,
pending mutations, conflict policy, and Supabase rows in agreement. The
workflow preserves dirty local rows by default so ringside work is never
overwritten by a stale server snapshot. Table adapters may opt into field-level
merge for server-authoritative fields such as scoring and placement.

## Cross-entity notes

Judge roster and qualification reads live in `services/database/judges/reads.ts`
alongside Judge assignment persistence. Judges are a role applied to Users, but
Secretary workflows should import Judge-specific reads and writes from
`services/database/judges/`, not from the User module or legacy query files.

## Shared database helpers

Cross-cutting helpers that are used by multiple entity modules but aren't
tied to a single entity live under `services/database/_shared/`. The leading
underscore signals "infrastructure, not a domain entity" so the directory
sorts apart from entity folders. Today's contents:

- `maps.ts` — lookup-Map builders used by `reads.ts`/`search.ts` across
  entries, classes, trials, shows, and waitlists to avoid N+1 joins.
- `replication-fallback.ts` — the `withReplicationFallback` wrapper used by
  every replicated entity (entries, classes, trials, shows, dogs, armbands)
  to try the IndexedDB-backed replication store first and fall back to
  PostgREST on failure.
- `untyped-from.ts` — the `untypedFrom(table)` escape hatch for Supabase
  tables not yet in the generated Database type. Used by judges, the
  premium-template workflow, and the search cluster.
  Callers should switch back to typed `supabase.from(...)` once the table
  joins the generated types.

A helper earns a place in `_shared/` only when more than one entity module
imports it. Single-caller helpers belong inside the entity module that uses
them.

`_shared/` deliberately has no `index.ts` barrel — callers import directly
from the specific helper file (`from '../_shared/maps'`, not
`from '../_shared'`). This is intentional: an `_shared/` barrel would invite
the directory to become a junk drawer of unrelated helpers, and the
per-file imports make each helper's surface area visible at the call site.
Entity modules use a barrel because their multiple files form one cohesive
entity surface; `_shared/` is a collection of independent single-purpose
helpers, not a single concept.

## Edge function HTTP envelope

Edge functions at `supabase/functions/<name>/` use the shared envelope at
`supabase/functions/_shared/http/` for CORS, JWT auth, JSON body parsing,
and error response mapping. Functions declare their config inline:

```ts
import { handle } from '../_shared/http/handler.ts';
import { MYK9SHOW_ORIGINS } from '../_shared/http/cors.ts';
import { HttpError } from '../_shared/http/responses.ts';

handle<PayloadType>(
  { auth: 'jwt', origins: MYK9SHOW_ORIGINS },
  async ({ body, user, supabase }) => {
    // domain logic; throw HttpError for known errors
    return { success: true };
  }
);
```

RBAC checks (site_admin, club_admin, etc.) live inside the handler, not
in the envelope. The envelope validates only the JWT and passes
`ctx.user` through.

Webhook functions (push-trigger-*, resend-webhook) pass `auth: 'none'`
and omit `origins` (server-to-server, no CORS).

Pilot migration (PR #259): send-notification, admin-delete-user, ask-myk9q,
push-trigger-scoring. Batch 2 (PR #261) migrated the rest with two
exceptions: `resend-webhook` (GET/HEAD endpoint validation, raw-text
HMAC verification, plain-text responses) and `ask-myk9show` (returns
a streaming SSE response — the envelope JSON-wraps return values, so a
streaming Response cannot escape). Both remain hand-rolled.

Following the `_shared/` no-barrel convention above, callers import
directly from `handler.ts`, `cors.ts`, and `responses.ts` — there is no
`_shared/http/index.ts`.
