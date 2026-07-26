# Show Map View — Design

**Date:** 2026-07-26
**Status:** Approved

## Purpose

Add a map view of upcoming shows to the public Browse Shows page, styled after wesmellbetter.com's AKC trial map but better: pins encode live entry state (open / closing soon / full / waitlist) and open into an actionable show card with an entry link. Only shows hosted on myK9Show appear; ingesting the national AKC event calendar was considered and explicitly deferred (post-launch growth experiment).

## Decisions made

| Decision | Choice | Why |
| --- | --- | --- |
| Map library | Leaflet + react-leaflet, OpenStreetMap tiles | Free, no API key, same stack wesmellbetter uses; the moat is our data, not the widget |
| Geocoder | Nominatim (OSM), called from the browser at show create/edit | No key/cost; low write-time volume; secretary confirms/drag-corrects the pin so best-effort accuracy is acceptable |
| Where geocoding runs | In the wizard UI (Approach A), not an edge function | Human confirms the pin at the moment they know the venue; no server pipeline, secrets, or background jobs |
| Where the map lives | Fourth `ViewMode` on `BrowseShowsPage` (`'cards' \| 'table' \| 'calendar' \| 'map'`) | Consolidation rule: another renderer of the already-filtered show list, not a new page |
| AKC data ingestion | Deferred | We only monetize hosted shows; ingestion is an acquisition play for after launch |

## Data

One migration adds nullable `latitude` / `longitude` (`double precision`) to `public.shows`.

- Anon must be able to SELECT both columns (public browse surface). Per the MYK9-93 lesson, verify against the applied database via `pg_attribute.attacl` / `pg_class.relacl`, not the migration text.
- No new tables, no triggers, no backfill job — existing shows get coordinates when a secretary opens Show Settings and confirms the pin (or never, in which case they simply don't appear in map view).

## Components

### `VenuePinMap` (new, reusable)

Small Leaflet map with a single draggable marker.

- Used in the show-creation wizard venue step and in Show Settings.
- On address entry, calls Nominatim (browser-side, proper `User-Agent`/referer per usage policy), drops a preview pin; secretary drags to correct.
- Nominatim miss → secretary can place the pin manually. Skipped entirely → lat/lng stay null; no validation blocker.

### Map view mode on `BrowseShowsPage`

- Add `'map'` to the `ViewMode` union; URL-synced via the existing `?view=` param and `parseViewMode`.
- Renders the same filtered show list the other three views consume — filter chips, tabs, and search keep working with zero new filter logic.
- Shows without coordinates are omitted from the map view; the other three views still show them. A small "N shows not mappable" note appears when any are omitted.

### Marker status

Pure function `deriveShowMarkerStatus(show) → 'open' | 'closing-soon' | 'full' | 'waitlist' | 'closed'` derived from the same entry-capacity/deadline data the cards already display. "Closing soon" = entries open AND (entry_close within 7 days OR ≥90% of capacity filled). Marker color encodes the status; a small legend renders on the map.

### Popup card

Compact show card in the marker popup: show name, dates, venue/city, entry fee, entry status, link to the show details page (which owns registration). No registration logic duplicated into the popup.

## Dependencies

`leaflet`, `react-leaflet`, `@types/leaflet` in `apps/myk9show`. OSM tile server with required attribution control. No API keys.

## Error handling

- Nominatim failure or timeout → non-blocking toast in the wizard; pin can be placed manually.
- Tile-load failures degrade to Leaflet's default gray tiles; the pins and popups still work.
- Map view with zero located shows → empty state pointing back to cards view.

## Testing

- Unit: `deriveShowMarkerStatus` (all five states + boundary around closing-soon threshold), Nominatim response mapping (mocked fetch), `parseViewMode` accepting `'map'`.
- Component (custom `testUtils` render): map view renders one marker per located show and omits unlocated ones; popup links to the right show.
- No Playwright coverage — external tile loads are flaky in CI by design.

## Out of scope (deferred)

Eligibility-based filtering ("shows my dog can enter"), weekend/date scrubber, mobile bottom-sheet layout, marker clustering (matters past a few thousand pins), AKC national-calendar ingestion.
