# Domain Glossary

Canonical terms for the myK9 platform domain. Use these names exactly in code,
documentation, and architecture discussions — not synonyms.

## Core Entities

**Entry**
One dog's registration into one class at one trial. An Entry has a status
(pending, accepted, wait-listed, scratched, absent) and belongs to exactly
one Show via its Trial and Class. The unit of ringside work.

**Class**
A competitive division within a Trial (e.g. "Novice A Agility"). Defines
the rules, judge assignment, run order, and entry limit. Classes belong to
Trials, not directly to Shows.

**Trial**
A single day or session of competition within a Show. A Show has one or more
Trials; each Trial has one or more Classes.

**Show**
The top-level event created and managed by a Club. A Show has a date range,
location, and one or more Trials. The unit of secretary work.

**Dog**
A registered canine competitor. A Dog has an owner (Handler or Exhibitor),
breed, titles, and health records. Dogs are shared across Shows.

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
The Club member responsible for managing entries, armbands, run orders, and
results for a Show. The primary user of the secretary dashboard.

**Armband**
The numbered identifier assigned to a Handler for a specific Show day. Used
for check-in and ring management.

**Wait List**
An ordered list of Entries that did not make the initial entry limit for a
Class. Entries are promoted from the Wait List as space opens.

**Show Registration**
The submission workflow that turns an Exhibitor's selected Dogs and Classes
into persisted Entries for a Show, including payment details, confirmation
number, and Armband assignment.

**Promo Code**
A discount token issued by a Club, scoped to a single Show or a single Trial.
Has a code string, discount type (`percentage` | `flat`), discount value,
optional usage limit, optional expiry, and a running usage count. Applied at
checkout during Show Registration to reduce entry fees. Trial-scoped codes
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
members (`club_members` — enrollment records with dues, voting eligibility,
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
  premium-template workflow, the search cluster, and the EditShowDialog.
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
  },
);
```

RBAC checks (site_admin, club_admin, etc.) live inside the handler, not
in the envelope. The envelope validates only the JWT and passes
`ctx.user` through.

Webhook functions (push-trigger-*, resend-webhook) pass `auth: 'none'`
and omit `origins` (server-to-server, no CORS).

Pilot migration (PR #259): send-notification, admin-delete-user, ask-myk9q,
push-trigger-scoring. `resend-webhook` does not fit the envelope (uses
GET/HEAD endpoint validation, raw-text HMAC verification, and plain-text
responses) and remains hand-rolled. Remaining 15 functions migrate in
a follow-up PR.

Following the `_shared/` no-barrel convention above, callers import
directly from `handler.ts`, `cors.ts`, and `responses.ts` — there is no
`_shared/http/index.ts`.
