# Archive Summary: add-show-map-view

**Archived:** 2026-07-26
**PR:** [#1484](https://github.com/rbeezley/myk9-platform/pull/1484) — merged 2026-07-26 (`5f46be46e`)
**Schema:** spec-driven

## Outcome

Shipped the Find Shows map view mode (Leaflet + OpenStreetMap, status-colored pins, popup show cards) and the secretary-side venue pin capture (Nominatim geocoding, draggable confirmation) in the show-creation wizard and Show Settings.

## Specs synced

Both capabilities were new — promoted verbatim to `openspec/specs/`:

- `show-map-view` — 4 requirements / 7 scenarios
- `venue-geolocation` — 3 requirements / 5 scenarios

## Migrations applied

| Migration                                                  | Purpose                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `20260726130000_add_show_coordinates`                      | Nullable `latitude`/`longitude` + range CHECKs on `public.shows`                                                             |
| `20260726140000_create_show_with_children_coordinates`     | First RPC extension — **built from a stale base**, see below                                                                 |
| `20260726150000_create_show_with_children_coordinates_fix` | Corrective: re-applied the true latest RPC body (registry_id, person_id judge assignments) with only the coordinate addition |

Live function verified post-push to contain `registry_id`, `person_id`, and `latitude`.

## Review findings worth remembering

- **Codex caught a stale-base RPC rebuild.** Regenerating `create_show_with_children` from the migration that _looked_ newest (`20260510143000`) silently reverted two later merged changes. Lesson recorded in `CLAUDE.md`: grep for **every** migration defining a function, not just the most recent by name.
- **Harden caught a silent data-loss path**: wizard transformers had lat/lng in their types but not their bodies, so edit-mode pin changes were dropped.
- **Leaflet world-copy wrap** can produce longitudes outside ±180 that the new CHECK rejects — normalized at every pin output.
- **Replication full-row updates** could null out a pin saved elsewhere; guarded like the `experience_*` fields.

## Known limitations (deliberate)

- `full` / `waitlist` marker colors are unreachable until live entry counts reach the browse pipeline. `deriveShowMarkerStatus` accepts an optional capacity argument so they activate without further marker-logic changes.
- No AKC national-calendar ingestion — deferred as a post-launch acquisition experiment.
- Deferred UX: eligibility filtering, weekend scrubber, mobile bottom-sheet, marker clustering.
