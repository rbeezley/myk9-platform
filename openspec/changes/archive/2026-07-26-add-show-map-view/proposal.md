# Proposal: add-show-map-view

## Why

Exhibitors plan their season geographically — "what can I enter within driving distance?" — but Find Shows only offers cards, table, and calendar views. Third-party sites (e.g. wesmellbetter.com's AKC trial map) prove the demand, yet as scraped mirrors they can only show static pins. As the system of record, myK9Show can put live entry state (open / closing soon / full / waitlist) on each pin and link straight into registration — a differentiator that supports fall 2026 launch by making the public browse surface a stronger exhibitor draw.

## What Changes

- Add nullable `latitude` / `longitude` columns to `public.shows` (one migration; anon-readable — the browse surface is public).
- New reusable `VenuePinMap` component: Nominatim-geocoded, draggable confirmation pin in the show-creation wizard venue step and Show Settings.
- Add `'map'` as a fourth view mode on `BrowseShowsPage` (Leaflet + OpenStreetMap tiles), rendering the already-filtered show list as status-colored markers with a popup card linking to show details.
- New pure function `deriveShowMarkerStatus` for marker coloring, unit-tested.
- New dependencies in `apps/myk9show`: `leaflet`, `react-leaflet`, `@types/leaflet`. No API keys.

**Duplication check:** This does not duplicate an existing surface — it is a fourth renderer of the same filtered list already powering cards/table/calendar on the one existing Find Shows page. No new page or route. The popup links to the existing show details page rather than re-implementing registration.

## Non-Goals

- No ingestion of the national AKC event calendar (deferred post-launch growth experiment; we only monetize hosted shows).
- No eligibility-based filtering ("shows my dog can enter"), weekend/date scrubber, mobile bottom-sheet layout, or marker clustering.
- No server-side geocoding pipeline, background jobs, or backfill — coordinates appear as secretaries confirm pins.
- No E2E/Playwright coverage of the map (external tile loads are CI-flaky by design).

## Capabilities

### New Capabilities

- `show-map-view`: Map view mode on Find Shows — status-colored markers from the filtered show list, popup show cards, omission handling for shows without coordinates.
- `venue-geolocation`: Show coordinates lifecycle — lat/lng storage, browser-side Nominatim geocoding, secretary pin confirmation/correction in wizard and Show Settings, graceful null handling.

### Modified Capabilities

(none — `find-shows-filtering` requirements are unchanged; the map consumes the filtered list as-is)

## Impact

- **DB:** one additive migration on `public.shows`; column ACLs must be verified against the applied database (MYK9-93 lesson).
- **Code:** `BrowseShowsPage.tsx` (view-mode union + render switch), show-creation wizard venue step, Show Settings, new `VenuePinMap` + map-view components, new marker-status util.
- **Deps:** `leaflet` / `react-leaflet` added to `apps/myk9show` only.
- **Design source:** approved brainstorm spec at `docs/superpowers/specs/2026-07-26-show-map-view-design.md` (superseded by this change's `design.md`).
