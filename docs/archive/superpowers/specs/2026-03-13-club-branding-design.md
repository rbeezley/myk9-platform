# Club Branding — End-to-End Wiring

**Date:** 2026-03-13
**Status:** Approved design

## Summary

Wire the existing club branding infrastructure (migration 059, upload service, AccentColorPicker, ShowBrandedHero, palette generation) into a cohesive end-to-end experience. A club admin sets branding on the club profile page → it flows through to show cards, show detail pages (public and secretary), and OG images.

## Context

Migration 059 added `logo_url`, `cover_image_url`, and `accent_color` columns to both `clubs` and `shows` tables. Supporting components exist (AccentColorPicker, CoverImageUpload, ShowBrandedHero, imageUploadService, branding utilities) but are not fully connected. The club header already supports inline cover and logo editing. Show queries don't fall back to club branding. ShowCard callers don't pass branding props. PublicShowView and ShowDetailsMain don't use ShowBrandedHero.

## Design

### 1. Branding Tab on Club Profile

Add a "Branding" tab to `ClubDetails`, visible only when `canEditBranding` is true (platform admin or club admin). Sits alongside existing tabs (Shows, Members, About).

**Contents:**

- **Accent Color** — existing `AccentColorPicker` component with preset swatches and live preview gradient
- **Logo** — current logo display with upload/remove buttons (reuses existing `onEditPhoto` handler from `useClubDetailsState`)
- **Cover Image** — current cover thumbnail with upload/remove (reuses existing cover upload handlers)
- **Live Preview** — miniature `ShowCard` rendered with current branding selections so admin sees how their club's shows appear on browse pages
- **Save / Discard buttons** — form tracks dirty state; Save persists to DB via club store; Discard reverts to last-saved values

The header's existing inline editing (hover cover to upload, click logo to change) continues to work unchanged. The Branding tab is an organized view of all branding controls, not a replacement for inline editing.

**Files to modify:**

- `apps/myk9show/src/components/clubs/ClubDetails/index.tsx` — add Branding tab (admin-only)
- New: `apps/myk9show/src/components/clubs/ClubDetails/BrandingTab.tsx` — tab content component
- `apps/myk9show/src/components/clubs/ClubDetails/useClubDetailsState.ts` — add accent color save handler
- `apps/myk9show/src/components/clubs/ClubDetails/types.ts` — add `'branding'` to `ClubTab` union

### 2. Club Branding Fallback in Show Queries

When a show has no branding of its own, it inherits from its club.

**Query change:** Show queries that fetch lists add a join to the `clubs` table:

```sql
select('*, clubs(logo_url, cover_image_url, accent_color)')
```

**Mapper change:** The show mapper applies a fallback chain:

- `show.logo_url ?? club.logo_url` → `logoUrl`
- `show.cover_image_url ?? club.cover_image_url` → `coverImageUrl`
- `show.accent_color ?? club.accent_color` → `accentColor`

This aligns with the pattern already used in the OG image generator (`api/og-show.ts` line 85).

No migration needed — columns and relationships already exist.

**Files to modify:**

- `apps/myk9show/src/services/database/queries/showQueries.ts` — add clubs join to list queries
- `apps/myk9show/src/services/mappers/showMappers.ts` — add club branding fallback in DB→UI mapper

### 3. Wire Branding to Show Views

Three categories of show-rendering code need branding wired through.

**3a. ShowCard users** — these files import and render `ShowCard`, which already accepts `coverImageUrl`, `accentColor`, and `organization` props. Pass them through from the Show object:

- `apps/myk9show/src/components/shows/UpcomingShows.tsx` — landing page upcoming shows

**3b. Inline card markup** — these files render their own card HTML rather than using `ShowCard`. Add branding visuals (accent color border/bar, cover image thumbnail where layout allows) using the show's branding data:

- `apps/myk9show/src/components/shows/browse/ShowsGridView.tsx` — browse page grid cards
- `apps/myk9show/src/components/shows/browse/ShowsListView.tsx` — browse page list rows
- `apps/myk9show/src/components/clubs/ClubDetails/UpcomingShowsTab.tsx` — club detail upcoming shows
- `apps/myk9show/src/components/clubs/ClubDetails/PastShowsTab.tsx` — club detail past shows
- `apps/myk9show/src/components/landing/UpcomingShowsSection.tsx` — landing page hero section

For these files, the minimum branding treatment is an accent color left-border or top-bar on each card (matching the pattern in `PublicShowView`). Cover images can be added where the card layout has room for a visual area.

**3c. Detail pages** — replace hand-rolled hero section with `ShowBrandedHero`:

- `apps/myk9show/src/components/shows/PublicShowView.tsx` — swap hero for `ShowBrandedHero` (props: `logo`, `coverImage`, `accentColor`, `showName`, `organization`)

Note: The secretary view (`ShowDetailsEnhanced/ShowHeader.tsx`) already uses `ShowBrandedHero` — no changes needed there.

### 4. Testing

- **Unit test: branding fallback** — verify show mapper falls back to club branding when show-level fields are null
- **Unit test: Branding tab visibility** — render ClubDetails with admin role, verify Branding tab and AccentColorPicker appear; render without admin, verify tab is hidden
- **Unit test: dirty state** — change color, verify Save/Discard buttons appear; save, verify they disappear; discard, verify values revert

No E2E tests — the touchpoints span too many pages for a dedicated E2E flow. Unit tests cover logic; manual verification covers visual coherence.

## Architecture Notes

- **No new migrations** — all DB schema is in place (migration 059)
- **No new packages** — all shared utilities exist in `apps/myk9show/src/lib/branding.ts`
- **Branding resolution order:** show-level → club-level → organization-based gradient placeholder
- **Permission model:** `canEditBranding` = `isPlatformAdmin || isClubAdmin` (already implemented in `useClubDetailsState`)
- **File upload paths:** `clubs/{clubId}/cover.webp`, `clubs/{clubId}/logo.webp` (already defined in `imageUploadService`)

## Out of Scope

- Show-level branding overrides (secretary customizes branding per-show) — future work
- Custom color input (hex field) — preset swatches only for now
- Cover image cropping — upload as-is, `object-cover` handles display
