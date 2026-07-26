# Design: add-show-map-view

## Context

Find Shows ([BrowseShowsPage.tsx](../../../apps/myk9show/src/pages/BrowseShowsPage.tsx)) renders a filtered show list through three URL-synced view modes (`'cards' | 'table' | 'calendar'`) via a `renderShowsView()` switch consuming `enhancedShows` from `useBrowseShowsData` / `useBrowseShowsFilters`. `public.shows` already stores `venue_name`, `address`, `city`, `state`, `zip_code` (migration `002_shows_and_events.sql`) but no coordinates anywhere in the schema. Design approved in conversation 2026-07-26 (brainstorm doc: `docs/superpowers/specs/2026-07-26-show-map-view-design.md`, superseded by this file). Inspiration: wesmellbetter.com's Leaflet/OSM AKC trial map — which, as a scraper, cannot show entry state.

## Goals / Non-Goals

**Goals:**

- Map view mode on Find Shows with live entry-status pins and popups linking to show details.
- Coordinates captured at the moment of venue entry, human-confirmed via draggable pin.
- Zero recurring cost: Leaflet + OSM tiles + Nominatim, no API keys.

**Non-Goals:**

- AKC national-calendar ingestion; eligibility filtering; weekend scrubber; mobile bottom-sheet; marker clustering; server-side geocoding pipeline or backfill; Playwright coverage of tile rendering.

## Decisions

1. **Geocode in the wizard UI, not an edge function.** The browser calls Nominatim when the secretary enters the address; a draggable pin confirms/corrects it. Alternative (server trigger + background geocode) rejected: more moving parts, and nobody confirms accuracy. Nominatim policy compliance: single request per explicit user action (address blur / "Locate" button), identifying `User-Agent` impossible to set from browsers — rely on `Referer` which Nominatim accepts, and keep volume trivially low (write-time only).
2. **Map is a renderer, not a page.** Add `'map'` to the `ViewMode` union, `VIEW_MODES` array, and the `renderShowsView()` switch. All filtering stays in `useBrowseShowsFilters` untouched — consolidation rule satisfied.
3. **Status derivation is a pure function.** `deriveShowMarkerStatus(show)` → `'open' | 'closing-soon' | 'full' | 'waitlist' | 'closed'`, computed from the same capacity/deadline fields the cards already display. `closing-soon` = entries open AND (entry_close within 7 days OR ≥90% capacity). Pure so it is unit-testable without a map.
4. **Lazy-load the map chunk.** `React.lazy`/`Suspense` around the map view (same pattern as `ShowCalendar`) so Leaflet (~150KB) never loads for users who stay in cards/table.
5. **Offline/replication:** none. Find Shows is a public online browse surface, not a show-day core flow; the map reads the same show list the page already fetched, and `latitude`/`longitude` ride along existing show reads. No replication-layer changes; ringside packages untouched.
6. **Data access:** additive migration; explicit `GRANT SELECT (latitude, longitude)`-equivalent posture — since these are new columns on an existing anon-readable table, default column behavior applies, but verification happens against the applied DB (`pg_attribute.attacl`, embed probes) per MYK9-93, not by reading the migration.
7. **INTENT check:** exhibitor browse intent is "planning my season feels exciting, not like paperwork." A map with green "open" pins serves that; no `// INTENT:` annotated code is touched.

## Risks / Trade-offs

- [Nominatim inaccuracy or outage] → pin is draggable and optional; shows save without coordinates and simply skip the map view.
- [OSM tile server slowness/policy] → standard attribution + browser caching; if it ever matters, swap the tile URL (one constant) for a paid tile host.
- [Sparse map pre-launch looks empty] → accepted; map is an opt-in view mode, never the default.
- [react-leaflet SSR/StrictMode quirks] → app is client-rendered Vite SPA; guard against double-init by keying the map container.

## Migration Plan

1. Migration `NNN_add_show_coordinates.sql`: `ALTER TABLE public.shows ADD COLUMN latitude double precision, ADD COLUMN longitude double precision;` (no grant changes expected; verify ACLs post-push).
2. `migration-auditor` agent, then `db push` per the db-push skill; verify via `pg_attribute.attacl` query and an anon PostgREST probe selecting the new columns.
3. Ship UI; existing shows gain pins as secretaries confirm them in Show Settings. Rollback = drop columns (additive, nothing depends on them).
