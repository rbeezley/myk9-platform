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

## Data Access Modules

Each entity has one authoritative data access module under
`apps/myk9show/src/services/database/<entity>/`. Callers import only from
that module's `index.ts` — never from `supabaseClient` or replication tables
directly.

Replicated entities (cached in IndexedDB for offline reads): Entry, Class,
Trial, Dog, Show, Armband.

PostgREST-only entities (online reads): Club, Handler, Exhibitor, Volunteer,
WaitList, Secretary tasks, Visibility settings, Achievement.

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
