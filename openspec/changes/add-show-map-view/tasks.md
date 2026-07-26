# Tasks: add-show-map-view

## 1. Database

- [ ] 1.1 Check remote migration state (`supabase migration list`) then add migration `NNN_add_show_coordinates.sql`: nullable `latitude` / `longitude` (double precision) on `public.shows`
- [ ] 1.2 Run the `migration-auditor` agent on the new migration
- [ ] 1.3 Push via db-push skill (confirm before push per Auto Mode rules); verify applied ACLs with the `pg_attribute.attacl` / `pg_class.relacl` queries and an anon PostgREST probe selecting `latitude,longitude`
- [ ] 1.4 Regenerate/refresh DB types and rebuild `pnpm --filter @myk9/supabase build` (stale-dist lesson)

## 2. Geocoding + VenuePinMap

- [ ] 2.1 Add `leaflet`, `react-leaflet`, `@types/leaflet` to `apps/myk9show`
- [ ] 2.2 Write `geocodeAddress` helper (Nominatim search, response → `{lat, lng} | null`) with unit tests (mocked fetch: hit, miss, error/timeout)
- [ ] 2.3 Build `VenuePinMap` component: OSM tiles, draggable single marker, `onChange(lat, lng)`, manual placement by map click when geocode misses, non-blocking failure notice
- [ ] 2.4 Embed `VenuePinMap` in the show-creation wizard venue step; persist pin position with the show (nullable — never blocks save)
- [ ] 2.5 Embed `VenuePinMap` in Show Settings so existing shows can gain coordinates; run colocated tests for both edited surfaces

## 3. Map view mode

- [ ] 3.1 Write `deriveShowMarkerStatus` pure function + unit tests covering all five states and the closing-soon boundaries (7-day window, 90% capacity)
- [ ] 3.2 Add `'map'` to `ViewMode` union / `VIEW_MODES` / `parseViewMode` test; extend `renderShowsView()` with a lazy-loaded `ShowsMapView` (Suspense, calendar pattern)
- [ ] 3.3 Build `ShowsMapView`: status-colored markers from `enhancedShows` with coordinates, legend, popup card (name, dates, venue/city, fee, status, details link), "N shows not mappable" note, zero-mappable empty state linking back to cards
- [ ] 3.4 Component tests (custom testUtils render): marker-per-located-show, omission note, empty state, popup link target

## 4. Verify + ship

- [ ] 4.1 `pnpm typecheck` and `cd apps/myk9show && pnpm test` green; run dev server and visually verify map view, wizard pin, Show Settings pin (screenshot proof)
- [ ] 4.2 `/simplify` then `/harden` on the changed code
- [ ] 4.3 Commit, open PR, CI green; `/review` + Codex review (user-visible behavior + migration ⇒ default ON); fix findings; merge from main repo dir per worktree rules
- [ ] 4.4 Archive change via `opsx:verify` → `opsx:archive` (brainstorm doc already replaced with a pointer at propose time)
