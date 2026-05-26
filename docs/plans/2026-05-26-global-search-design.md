# Global Search — Design (v1)

**Status:** Design validated; ready for implementation planning.
**Date:** 2026-05-26
**Origin:** Brainstorm session — "global search alongside AskQ"

## Context

Power users in tools like SolarWinds and LogicMonitor expect a single global search affordance to jump to any record — a person, a dog, a show, an armband. myK9Show already has a Cmd-K Command Palette ([CommandPalette.tsx](../../apps/myk9show/src/components/common/CommandPalette.tsx)) that handles dogs, people, shows, and clubs from in-memory Zustand stores. It does not search entries (armbands) or classes, does not hit the backend, and does not connect to AskQ — so secretaries cannot find platform-wide records they need to enter into their shows, and users have no unified entry point that bridges record-lookup with AI-powered Q&A.

This design evolves the existing palette into the unified global search surface. AskQ stays exactly as it is today; the palette becomes a launcher into AskQ via a single bottom-of-results row. The work is scoped to myK9Show, which is the future unified app once the myK9Q unification plan lands.

## Architecture overview

**One surface, one shortcut, two engines.**

- Cmd/Ctrl+K opens the existing palette. Header search input and mobile search icon continue to open it. No new shortcuts, no new pages.
- Search data source moves from client Zustand stores to a server-side Postgres RPC: `search_global(query, scope_show_id, result_limit)`.
- Six record types covered: **dogs, people, shows, clubs, entries, classes**. Entries unlock armband search; classes give secretaries direct access to their primary in-show navigation entity.
- Context-aware scoping. When the URL contains `:showId`, that show's results rank first; a *"Search across all shows →"* divider broadens to global. Outside a show, global from the start.
- AskQ row. Below all record results, separated by a thin divider, a single muted row reads *"Ask AskQ: '{query}' →"*. Always present for non-empty queries. Click → close palette, open AskQ panel with query and current `showId` pre-filled via `useAskQPanelStore`. No backend changes to AskQ.

## UX behavior

**Dropdown layout (top to bottom):**

1. **Recent searches** — empty query only. Last 5 queries via existing `useRecentSearches` hook.
2. **Navigation** — empty query only. Existing palette entries (Dogs, People, Shows, Clubs, etc.).
3. **Show-scoped results** — query non-empty AND URL has `:showId`. Sectioned by type: Entries (armband matches first), Classes, Dogs, People, Shows, Clubs. Section headers qualify with the show name.
4. **Broaden divider** — *"Search across all shows →"*. Re-runs without `scope_show_id`.
5. **Global results** — same sectioned layout without the show qualifier.
6. **AskQ row** — always present for non-empty queries. Thin divider, muted text, AI badge.
7. **Offline badge** — palette footer, when in fallback mode: *"Showing cached results — you're offline."*

**Result item rendering.** Type icon, primary label, dim secondary line. Examples:
- Dog: 🐕 **Buddy** — Golden Retriever · Owned by Sarah Smith
- Entry: 🎯 **Armband 47** — Buddy (Sarah Smith) · Open A · Saturday 9:00am
- Class: 📋 **Open A Novice** — Saturday · Judge: J. Garcia · 12 entries

**Result actions vary by relationship.** Each row receives an `in_scope` flag from the RPC:
- **In-scope** (record is in user's accessible scope): row click navigates to the record or opens the entry detail slide-over (for entries).
- **Out-of-scope** dogs and people: row click opens an *"Add to current show"* entry-creation flow pre-filled with the existing record. This is the secretary workflow — handler walks up at check-in, secretary searches for an existing platform-wide dog/person and creates an entry without producing duplicates. Exhibitors get the equivalent for out-of-scope shows (*"Enter this show"*).

**Entry result destination.** Clicking an entry/armband result opens a slide-over entry detail panel over the current page. Fast lookup without yanking the user out of context.

## Offline behavior

myK9Show is primarily an online web app; v1 does not target ringside use. The chosen pattern is **best-effort fallback to loaded stores**.

- Primary: RPC call (debounced 150ms keystroke, 2-character minimum).
- On RPC failure or timeout: filter the currently-loaded `dogStore`, `userStore`, `showStore` (today's behavior), render a *"Showing cached results — you're offline"* badge in the palette footer.
- Entries and classes are absent from the fallback (not in those stores). Armband search degrades; users see the badge and understand why.

**Phase 2 (post-unification):** Replicate the six searchable tables (or a denormalized view) to IndexedDB via `@myk9/replication`. Swap the fallback to a local-first query. Same RPC contract on the server, same render shape on the frontend.

## Backend — `search_global` RPC

**Signature:**

```sql
search_global(
  query         text,
  scope_show_id uuid default null,
  result_limit  int  default 8
) returns table (
  record_type text,        -- 'dog' | 'person' | 'show' | 'club' | 'entry' | 'class'
  record_id   uuid,
  display     text,
  subtitle    text,
  show_id     uuid,
  show_name   text,
  rank        real,
  match_field text,
  in_scope    boolean
)
```

`SECURITY INVOKER` (default). Existing RLS policies on the underlying tables apply unchanged.

**Internal logic per record type:** combine exact/prefix match (highest boost), trigram fuzzy match (`pg_trgm`), and full-text (`tsvector`) where relevant. `union all` across types, order by `rank desc` with a small type-boost for entries and classes when `scope_show_id` is set.

**Indexes required (one migration):**
- `pg_trgm` extension (verify already enabled).
- GIN trigram indexes on `dogs.call_name`, `dogs.registered_name`, `entries.armband` (cast text), `classes.class_name`, `shows.show_name`, `clubs.club_name`, `people.first_name`, `people.last_name`.
- Partial / B-tree index on `entries.armband` for fast exact lookup.

**Performance budget.** p95 < 200ms show-scoped, < 500ms global. Below those, materialized views are unnecessary.

**No client cache for v1.** Each debounced keystroke hits the RPC. Phase 2 can add a short-lived memo if needed.

## RLS, roles, and security

RLS is the entire security model. The RPC runs as the calling user. We do not add application-level role filtering — we rely on existing policies on the six tables. Wrong policies surface in the table, not in search.

**Role behavior (illustrative — derived from existing policies):**

- **Exhibitor:** own dogs, own entries, shows entered in or publicly related, public people data.
- **Judge:** assigned shows/classes, entries in those classes, dogs/people on those entries.
- **Secretary / club admin / trial chair:** club's shows, entries inside those shows, dogs/people involved, club roster.
- **Platform admin:** everything (existing admin policies).

**Dogs and people are platform-discoverable by basic identifying fields, scoped on sensitive fields.**

| Field | Platform-wide read | Scoped only |
|---|---|---|
| Dog call name, registered name, breed, owner display name | ✓ | |
| Dog DOB, microchip, registration number, medical notes | | ✓ |
| Person display name, public handler ID | ✓ | |
| Person address, phone, email, emergency contacts | | ✓ |

This is the right data-model shape regardless of search — secretaries cannot take entries without it. If existing `dogs.SELECT` and `people.SELECT` policies don't already split visible/protected columns, that's a **prerequisite migration** before search v1 ships.

**Input safety.**
- Debounce 150ms; min 2 chars; max 100 chars (trimmed, normalized server-side).
- Per-user rate limit: 60 RPC calls/minute.
- AskQ row sanitizes the query via the planned `sanitizeForPrompt` helper before passing to the panel.
- AskQ row passes only query + showId. No search results leak into AskQ context; AskQ runs its own context-builder.

**Logging.** Every RPC call logs query length, scope_show_id present, result counts per record_type, latency, user role. Zero-result queries log hashed query text. AskQ row click-through rate logged.

## Phasing

**Phase 0 — Prereqs.**
- Audit `dogs.SELECT`, `people.SELECT`, `shows.SELECT`, `clubs.SELECT`, `classes.SELECT`, `entries.SELECT` RLS policies. Document gaps.
- If dogs/people aren't platform-readable on basic identifying fields, ship that data-model migration first. Search v1 is blocked on it.

**Phase 1 — Search v1.** One PR, one migration, one feature flag (`global_search_v2`).
- Migration: `pg_trgm` extension (if needed), GIN trigram indexes, partial index on `entries.armband`, `search_global` RPC.
- Frontend: refactor `CommandPalette.tsx` to call the RPC; add show-scope detection via `useLocation()`; add AskQ row launcher; add offline fallback against existing stores; add `in_scope` affordance switch for dogs/people.
- Dark-launch via GrowthBook.

**Phase 2 — Replicated search (unification phase).** Replicate six searchable tables (or denormalized view) to IndexedDB. Swap offline fallback to local-first query. Same RPC contract, same render shape — no UI changes.

## Testing

- **Unit tests.** AskQ row appears for non-empty queries; hidden when empty. Show-scoped section headers render with `:showId` in URL. `in_scope=false` rows render the entry-create affordance.
- **RPC contract tests.** Per record type: known-good query returns expected `record_type`, `display`, `rank`. Trigram fuzz (e.g., "retriev" matches "Retriever"). Armband exact match outranks fuzzy dog-name matches.
- **RLS tests.** Per role (exhibitor / judge / secretary / club admin), same query returns the role-correct scope. Canary: exhibitor searching another exhibitor's dog returns zero protected-field rows.
- **Offline tests.** Mock RPC failure; assert fallback badge appears and store-filtered results render.
- **E2E (Playwright).**
  - Cmd+K → type "47" inside a show context → entry result → click → slide-over panel opens.
  - Cmd+K outside show → type "Buddy" → multiple dog hits → click out-of-scope dog → entry creation flow opens pre-filled.
  - Click AskQ row → AskQ panel opens with query + showId pre-filled.

## Success criteria

- p95 RPC latency: <200ms show-scoped, <500ms global.
- Zero RLS leakage in role tests (canary stays green).
- Secretary can find and enter a platform-wide dog/person not in their show in <3 keystrokes + 2 clicks.
- AskQ row click-through rate ≥5% within one month of release (validates the unified-entry hypothesis).

## Open items for implementation planning

- Existing `dogs.SELECT` / `people.SELECT` RLS shape — must inspect before sizing Phase 0.
- Specific Zustand store shapes for the offline fallback — verify all needed display fields are present in the loaded stores.
- Entry detail slide-over component — confirm whether one already exists or needs building.
- GrowthBook flag wiring — confirm flag-evaluation hook exists in myK9Show.
