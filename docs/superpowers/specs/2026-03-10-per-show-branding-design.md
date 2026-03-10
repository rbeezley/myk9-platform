# Per-Show Branding Design

**Date:** 2026-03-10
**Status:** Approved

Allow clubs to customize their show pages with logo, cover image, and accent color so the page feels like their event.

## Decisions

1. Club-level branding with per-show overrides
2. Single accent color with auto-generated palette (HSL derivation)
3. Cover + floating logo hero layout (GitHub/Twitter profile pattern)
4. Inline cover upload on detail pages, color picker in club edit form
5. 10 preset color swatches (no custom hex)
6. Cover image replaces gradient on ShowCards; gradient fallback when absent

## Data Model

### Database Migration

**Clubs table** (new columns):

- `cover_image_url TEXT` — Supabase Storage URL
- `accent_color TEXT` — hex from preset swatches (e.g., `#2563eb`)

(`logo_url` already exists.)

**Shows table** (new columns, all nullable — null = inherit from club):

- `logo_url TEXT` — override club logo
- `cover_image_url TEXT` — override club cover
- `accent_color TEXT` — override club accent color

### TypeScript Types

DB-to-TS mapping follows existing convention (e.g., `logo_url` → `logo`):

- `Club` gains: `coverImage: string` (from `cover_image_url`), `accentColor: string` (from `accent_color`)
- `Show` gains: `logoUrl: string` (from `logo_url`), `coverImageUrl: string` (from `cover_image_url`), `accentColor: string` (from `accent_color`)

Existing `Club.logo` (mapped from `clubs.logo_url`) is unchanged and used in resolution logic.

### Resolution Logic

Pure function `resolveShowBranding(show, club)` returns `{ logo, coverImage, accentColor }`:

```
logo = show.logoUrl ?? club.logo ?? null
coverImage = show.coverImageUrl ?? club.coverImage ?? null
accentColor = show.accentColor ?? club.accentColor ?? null
```

When `accentColor` is null, fall back to existing org-based gradient. When `coverImage` is null, fall back to existing `ShowPlaceholder` gradient + paw prints.

### Palette Generation

`generatePalette(hexColor)` uses HSL manipulation:

- `primary` — input color
- `primaryLight` — +15% lightness (hover states, backgrounds)
- `primaryDark` — -15% lightness (active states)
- `primaryMuted` — 20% opacity (subtle backgrounds)
- `onPrimary` — white or dark text based on WCAG contrast ratio

## Image Upload & Storage

### Storage Structure

Existing `images` Supabase bucket:

```
images/
  clubs/{clubId}/logo.webp        (existing)
  clubs/{clubId}/cover.webp       (new)
  shows/{showId}/logo.webp        (new, override)
  shows/{showId}/cover.webp       (new, override)
```

### Upload Functions

Added to `imageUploadService.ts` following existing patterns:

- `uploadClubCover(clubId, file)`
- `uploadShowCover(showId, file)`
- `uploadShowLogo(showId, file)`

### Constraints

- Max 5MB (same as existing uploads)
- Allowed types: JPEG, PNG, WebP
- Recommended aspect ratio ~3:1 (banner), no hard crop
- `cacheControl: 3600` (existing setting)

### Storage RLS Policies

The existing bucket policies only allow `profiles/{userId}` and `dogs/{userId}` paths. The migration must add new policies:

- **INSERT/UPDATE on `clubs/{clubId}/*`** — gated on `CLUB_ADMIN` role scoped to that club, or `platform_admin`
- **INSERT/UPDATE on `shows/{showId}/*`** — gated on `SECRETARY` role scoped to the show's club, or `platform_admin`
- **SELECT on `clubs/*` and `shows/*`** — public (branding images are not sensitive)
- **DELETE** — same as INSERT (allows replacing images)

### Upload Path Pattern

The existing `imageUploadService.ts` uses timestamped paths (`{folder}/{userId}/{timestamp}-{name}.ext`). For branding assets, use **fixed paths with upsert** instead (`clubs/{clubId}/cover.webp`). This overwrites the previous image on re-upload — no accumulation, no cleanup needed. New upload functions bypass `generateFilePath()` and construct paths directly.

### Data Migration

No backfill needed. All new columns default to `NULL`. Existing clubs/shows render identically — null triggers the existing org-based gradient fallback.

## UI Components

### ShowBrandedHero (new)

Replaces plain header on `ShowDetailsEnhanced/index.tsx`:

- Cover image or gradient fallback (~180px)
- Club logo floats at cover/info boundary (64px rounded square)
- 3px accent color bar at top edge
- Status badge top-right on cover
- Show title, location, date, club name below
- No cover: org-based gradient + paw prints
- No logo: initials badge (existing pattern)

### ShowCard Updates

Minimal changes to existing `ShowCard.tsx`:

- If `coverImageUrl` present, render as card background instead of gradient placeholder
- If absent, keep existing `ShowPlaceholder` org gradients unchanged
- Add 3px accent color bar at card top edge
- No club logo on cards (too small, would clutter)

### ClubHeader Updates

Cover image area added above existing logo + name:

- Cover image or gradient banner
- Logo floats at boundary (same pattern as show hero)
- Hover overlay: camera icon + "Change Cover" (club admins only)
- 3px accent color bar at top

### AccentColorPicker (new)

Added as field in club edit form:

- 10 curated preset swatches in a grid
- Selected state: ring highlight + checkmark
- Live preview strip showing gradient output
- Preset colors chosen for dark theme compatibility

### Cover Image Upload

Inline on detail pages:

- Hover overlay on cover area with camera icon + "Change Cover"
- New `CoverImageUpload` component (not reusing `ImageUpload` — that's avatar-shaped). Renders as a full-width overlay on the cover area with file input.
- Club admins see it on club pages
- Secretaries see it on show pages (for per-show overrides)
- **Replace flow:** uploading a new cover overwrites the previous (fixed path upsert). URL stays the same; browser cache busted via `?t={timestamp}` query param.
- **Remove flow:** "Remove Cover" option in overlay menu. Deletes from Storage, sets `cover_image_url = NULL` in DB, falls back to gradient.

### AccentColorPicker — Reset Option

The swatch grid includes a "None" option (circle with slash icon) as the first item. Selecting it clears `accent_color` to NULL, reverting to the org-based gradient.

## Edge Cases

- **Inheritance is dynamic.** Shows with null branding fields always resolve from the current club values at render time. Changing a club's accent color immediately affects all its shows that don't have overrides. No "lock-in at publish" behavior.
- **Square/portrait cover uploads** render with `object-cover` CSS, cropping to the 3:1 banner aspect ratio. No client-side enforcement — the crop is visual only.
- **List page performance.** Cover images on ShowCards load via native `<img>` with `loading="lazy"`. No Supabase image transforms in v1 — defer thumbnails to a follow-up if performance is an issue.
- **Multiple ShowCard variants.** Only the main `components/shows/ShowCard.tsx` is updated. The club-specific and dog-detail ShowCards are minimal variants that don't display covers.

## Authorization

- **Club cover/color editing:** `CLUB_ADMIN` role scoped to the club, or `platform_admin`. Checked client-side (hide upload overlay) and server-side (Storage RLS).
- **Show branding overrides:** `SECRETARY` role scoped to the show's club, or `platform_admin`. Same dual check.

## File Placement

| Module                | Location                                                  |
| --------------------- | --------------------------------------------------------- |
| `resolveShowBranding` | `apps/myk9show/src/lib/branding.ts`                       |
| `generatePalette`     | `apps/myk9show/src/lib/branding.ts`                       |
| `PRESET_COLORS`       | `apps/myk9show/src/lib/branding.ts`                       |
| `AccentColorPicker`   | `apps/myk9show/src/components/ui/accent-color-picker.tsx` |
| `CoverImageUpload`    | `apps/myk9show/src/components/ui/cover-image-upload.tsx`  |
| `ShowBrandedHero`     | `apps/myk9show/src/components/shows/ShowBrandedHero.tsx`  |

## Branding Flow Map

| Surface             | Logo     | Cover             | Accent Color        |
| ------------------- | -------- | ----------------- | ------------------- |
| Show detail hero    | Floating | Background        | Top bar + palette   |
| ShowCard (browse)   | No       | Replaces gradient | Top bar             |
| Club detail header  | Floating | Background        | Top bar             |
| Show wizard         | No       | No                | Inherits on publish |
| Secretary dashboard | No       | No                | No                  |

**Out of scope:** myK9Q, print templates, exhibitor/judge dashboards.

## Preset Color Swatches

10 colors guaranteed to look good on the dark theme:

| Name    | Hex       |
| ------- | --------- |
| Blue    | `#2563eb` |
| Red     | `#dc2626` |
| Green   | `#16a34a` |
| Purple  | `#9333ea` |
| Orange  | `#ea580c` |
| Cyan    | `#0891b2` |
| Gold    | `#ca8a04` |
| Pink    | `#be185d` |
| Indigo  | `#4f46e5` |
| Emerald | `#059669` |

## Testing

- **`resolveShowBranding`** — show overrides club, null fallback, all-null returns nulls
- **`generatePalette`** — HSL derivation, contrast detection for `onPrimary`
- **`AccentColorPicker`** — swatch selection, selected state, preview update
- **`ShowBrandedHero`** — cover image vs gradient fallback, floating logo vs initials, accent bar
- **`ShowCard` updates** — cover replaces gradient, accent bar, fallback to org gradient
- **Upload functions** — correct Storage paths

No E2E tests — visual branding validated by eye.
