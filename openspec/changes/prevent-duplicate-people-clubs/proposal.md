## Why

Duplicate people and club rows can split secretary assignments, show ownership, entry ownership, judge credentials, contact history, and support diagnostics across multiple records. Tightening these identities supports fall 2026 launch readiness by making the core directory harder to corrupt during show setup and mail-in entry work.

The dog registry-identity prevention work already established the right shape: normalize exact identity keys in the database, return or reuse authorized existing rows during creation, and surface likely matches inside existing creation flows. People and clubs now need the same consolidation-minded treatment without adding a duplicate-management page.

## What Changes

- Add normalized, database-enforced exact identity keys for live clubs, starting with club name and optional website/email-domain support where safe.
- Add a duplicate-aware club creation path that returns an authorized existing club when a normalized exact identity already exists instead of inserting another row.
- Extend people duplicate handling beyond signup by centralizing person identity helpers and using the existing `people_email_unique` guard consistently across secretary/site-admin creation paths.
- Replace mock or per-surface duplicate checks with shared loaded-data candidate matching for people and clubs in existing creation surfaces.
- Keep recovery calm: exact duplicates are reused or blocked with plain user-facing copy; likely matches are suggested, not auto-merged.
- Non-goals:
  - No new duplicate-people page, duplicate-clubs page, merge center, or cleanup dashboard.
  - No broad historical merge tooling in this slice.
  - No fuzzy database constraint on names alone for people.
  - No external registry, government, or sanctioning-body lookup.

This does not duplicate an existing surface. The failure happens inside existing create flows before the user knows there is a row to link to, so a link to another page is not enough; the work should tighten the current club creation, person creation, and exhibitor creation surfaces.

## Capabilities

### New Capabilities

- `core-identity-deduplication`: Exact duplicate prevention and likely-match reuse for live people and club creation workflows.

### Modified Capabilities

- None.

## Impact

- Supabase migrations for club identity normalization, duplicate inventory checks, unique constraints, and duplicate-aware create RPC behavior.
- Existing people creation paths, including site-admin/secretary person creation, show-wizard official creation, and exhibitor quick-create.
- Existing club creation paths, including the show wizard host-club inline create and club creation panel.
- Shared TypeScript identity helpers and plain duplicate error translation.
- Focused unit tests for normalization, duplicate candidate scoring, duplicate-aware create handling, and user-facing duplicate messages.
