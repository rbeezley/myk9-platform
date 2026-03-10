# Per-Show Branding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add club-level branding (logo, cover image, accent color) with per-show overrides so each show page feels like the club's own event.

**Architecture:** Database migration adds branding columns to clubs and shows tables. Pure utility functions handle branding resolution and palette generation. New UI components (ShowBrandedHero, AccentColorPicker, CoverImageUpload) consume branding data. Existing ShowCard and ClubHeader are updated to render branding when available, with graceful fallback to existing org-based gradients.

**Tech Stack:** Supabase (Postgres migration, Storage RLS), React, TypeScript, Tailwind CSS, Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-10-per-show-branding-design.md`

---

## Chunk 1: Data Layer

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/059_club_and_show_branding.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add branding columns to clubs
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE clubs ADD COLUMN IF NOT EXISTS accent_color TEXT;

-- Add branding override columns to shows (nullable = inherit from club)
ALTER TABLE shows ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE shows ADD COLUMN IF NOT EXISTS accent_color TEXT;

-- Storage RLS policies for club branding images.
-- Uses existing SECURITY DEFINER functions: is_club_admin(club_id), is_platform_admin().
-- Note: public SELECT already covered by migration 013 blanket policy on images bucket.

CREATE POLICY "Club admins can upload club branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'clubs'
  AND (
    (SELECT is_club_admin((storage.foldername(name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Club admins can update club branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'clubs'
  AND (
    (SELECT is_club_admin((storage.foldername(name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Club admins can delete club branding"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'clubs'
  AND (
    (SELECT is_club_admin((storage.foldername(name))[2]::uuid))
    OR (SELECT is_platform_admin())
  )
);

-- Storage RLS policies for show branding images.
-- Uses is_trial_secretary() scoped to the show's club_id.

CREATE POLICY "Secretaries can upload show branding"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'shows'
  AND (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = (storage.foldername(name))[2]::uuid
        AND (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can update show branding"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'shows'
  AND (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = (storage.foldername(name))[2]::uuid
        AND (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  )
);

CREATE POLICY "Secretaries can delete show branding"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'images'
  AND (storage.foldername(name))[1] = 'shows'
  AND (
    EXISTS (
      SELECT 1 FROM shows s
      WHERE s.id = (storage.foldername(name))[2]::uuid
        AND (SELECT is_trial_secretary(s.club_id))
    )
    OR (SELECT is_platform_admin())
  )
);
```

- [ ] **Step 2: Push migration to Supabase**

Run: `supabase db push`
Expected: Migration applied successfully.

- [ ] **Step 3: Regenerate Supabase types**

Run: `supabase gen types typescript --project-id sojmvhhwsjxmfistvzbe > packages/supabase/src/database.types.ts`
Then run: `pnpm typecheck`
Expected: Types regenerated, typecheck passes (new columns appear in Database types).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/059_club_and_show_branding.sql packages/supabase/src/database.types.ts
git commit -m "chore(db): add branding columns to clubs/shows and storage RLS policies"
```

---

### Task 2: Branding Utility — Types, Resolution, Palette

**Files:**

- Create: `apps/myk9show/src/lib/branding.ts`
- Create: `apps/myk9show/src/lib/__tests__/branding.test.ts`

- [ ] **Step 1: Write tests for `resolveShowBranding`**

```typescript
// apps/myk9show/src/lib/__tests__/branding.test.ts
import { describe, it, expect } from 'vitest';
import { resolveShowBranding, generatePalette, PRESET_COLORS } from '../branding';

describe('resolveShowBranding', () => {
  const club = { logo: 'club-logo.png', coverImage: 'club-cover.png', accentColor: '#2563eb' };

  it('returns show overrides when present', () => {
    const show = {
      logoUrl: 'show-logo.png',
      coverImageUrl: 'show-cover.png',
      accentColor: '#dc2626',
    };
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'show-logo.png',
      coverImage: 'show-cover.png',
      accentColor: '#dc2626',
    });
  });

  it('falls back to club values when show fields are null', () => {
    const show = { logoUrl: null, coverImageUrl: null, accentColor: null };
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'club-logo.png',
      coverImage: 'club-cover.png',
      accentColor: '#2563eb',
    });
  });

  it('falls back to club values when show fields are undefined', () => {
    const show = {};
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'club-logo.png',
      coverImage: 'club-cover.png',
      accentColor: '#2563eb',
    });
  });

  it('returns all null when both show and club have no branding', () => {
    const show = {};
    const emptyClub = {};
    const result = resolveShowBranding(show, emptyClub);
    expect(result).toEqual({
      logo: null,
      coverImage: null,
      accentColor: null,
    });
  });

  it('handles partial overrides (show overrides only accent color)', () => {
    const show = { accentColor: '#16a34a' };
    const result = resolveShowBranding(show, club);
    expect(result).toEqual({
      logo: 'club-logo.png',
      coverImage: 'club-cover.png',
      accentColor: '#16a34a',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/lib/__tests__/branding.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write tests for `generatePalette`**

Add to the same test file:

```typescript
describe('generatePalette', () => {
  it('returns all palette values for a valid hex color', () => {
    const palette = generatePalette('#2563eb');
    expect(palette).toHaveProperty('primary', '#2563eb');
    expect(palette).toHaveProperty('primaryLight');
    expect(palette).toHaveProperty('primaryDark');
    expect(palette).toHaveProperty('primaryMuted');
    expect(palette).toHaveProperty('onPrimary');
  });

  it('generates lighter shade for primaryLight', () => {
    const palette = generatePalette('#2563eb');
    // primaryLight should be lighter (higher luminance)
    expect(palette.primaryLight).not.toBe(palette.primary);
    expect(palette.primaryLight).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('generates darker shade for primaryDark', () => {
    const palette = generatePalette('#2563eb');
    expect(palette.primaryDark).not.toBe(palette.primary);
    expect(palette.primaryDark).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('generates muted version with alpha', () => {
    const palette = generatePalette('#2563eb');
    // primaryMuted is an rgba string with 0.2 opacity
    expect(palette.primaryMuted).toMatch(/^rgba\(/);
    expect(palette.primaryMuted).toContain('0.2');
  });

  it('returns white onPrimary for dark colors', () => {
    const palette = generatePalette('#1e3a5f'); // dark blue
    expect(palette.onPrimary).toBe('#ffffff');
  });

  it('returns dark onPrimary for light colors', () => {
    const palette = generatePalette('#fbbf24'); // bright yellow
    expect(palette.onPrimary).toBe('#1a1a2e');
  });
});

describe('PRESET_COLORS', () => {
  it('has exactly 10 colors', () => {
    expect(PRESET_COLORS).toHaveLength(10);
  });

  it('each color has a name and valid hex', () => {
    for (const color of PRESET_COLORS) {
      expect(color).toHaveProperty('name');
      expect(color).toHaveProperty('hex');
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
```

- [ ] **Step 4: Implement `branding.ts`**

```typescript
// apps/myk9show/src/lib/branding.ts

export interface ShowBranding {
  logo: string | null;
  coverImage: string | null;
  accentColor: string | null;
}

export interface BrandPalette {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryMuted: string;
  onPrimary: string;
}

export interface PresetColor {
  name: string;
  hex: string;
}

export const PRESET_COLORS: PresetColor[] = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Cyan', hex: '#0891b2' },
  { name: 'Gold', hex: '#ca8a04' },
  { name: 'Pink', hex: '#be185d' },
  { name: 'Indigo', hex: '#4f46e5' },
  { name: 'Emerald', hex: '#059669' },
];

interface ShowBrandingInput {
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  accentColor?: string | null;
}

interface ClubBrandingInput {
  logo?: string | null;
  coverImage?: string | null;
  accentColor?: string | null;
}

export function resolveShowBranding(
  show: ShowBrandingInput,
  club: ClubBrandingInput
): ShowBranding {
  return {
    logo: show.logoUrl ?? club.logo ?? null,
    coverImage: show.coverImageUrl ?? club.coverImage ?? null,
    accentColor: show.accentColor ?? club.accentColor ?? null,
  };
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;

  const hue2rgb = (p: number, q: number, t: number): number => {
    const tNorm = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  if (s === 0) {
    const val = Math.round(l * 255);
    return `#${val.toString(16).padStart(2, '0').repeat(3)}`;
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** WCAG relative luminance */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function generatePalette(hex: string): BrandPalette {
  const [h, s, l] = hexToHsl(hex);
  const [r, g, b] = hexToRgb(hex);

  const lum = relativeLuminance(r, g, b);
  // WCAG AA contrast ratio >= 4.5:1 against onPrimary
  const onPrimary = lum > 0.179 ? '#1a1a2e' : '#ffffff';

  return {
    primary: hex,
    primaryLight: hslToHex(h, s, Math.min(1, l + 0.15)),
    primaryDark: hslToHex(h, s, Math.max(0, l - 0.15)),
    primaryMuted: `rgba(${r}, ${g}, ${b}, 0.2)`,
    onPrimary,
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/lib/__tests__/branding.test.ts`
Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/lib/branding.ts apps/myk9show/src/lib/__tests__/branding.test.ts
git commit -m "feat(branding): add resolveShowBranding, generatePalette, and PRESET_COLORS"
```

---

### Task 3: Update TypeScript Types and Mappers

**Files:**

- Modify: `apps/myk9show/src/types/club-types.ts` (Club interface, ~line 9)
- Modify: `apps/myk9show/src/types/show-types.ts` (Show interface, ~line 56)
- Modify: `apps/myk9show/src/services/mappers/clubMappers.ts` (mapDatabaseToClub ~line 70, mapClubInputToInsert ~line 9, mapClubToUpdate ~line 153)
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts` (mapDatabaseToShow ~line 68, mapShowInputToInsert ~line 9, mapShowInputToUpdate ~line 39)

- [ ] **Step 1: Add branding fields to Club interface**

In `apps/myk9show/src/types/club-types.ts`, add after the `logo: string;` line (~line 18):

```typescript
coverImage: string;
accentColor: string;
```

- [ ] **Step 2: Add branding fields to Show interface**

In `apps/myk9show/src/types/show-types.ts`, add after the `clubEmail: string;` line (~line 78):

```typescript
logoUrl: string;
coverImageUrl: string;
accentColor: string;
```

- [ ] **Step 3: Update club mapper — mapDatabaseToClub**

In `apps/myk9show/src/services/mappers/clubMappers.ts`, in the `mapDatabaseToClub` function, add the new fields to the returned object (alongside the existing `logo: dbClub.logo_url || ''` line):

```typescript
    coverImage: dbClub.cover_image_url || '',
    accentColor: dbClub.accent_color || '',
```

- [ ] **Step 4: Update club mapper — mapClubInputToInsert**

In `mapClubInputToInsert`, add alongside the existing `logo_url` mapping:

```typescript
    cover_image_url: input.coverImage || null,
    accent_color: input.accentColor || null,
```

- [ ] **Step 5: Update club mapper — mapClubToUpdate**

In `mapClubToUpdate`, add alongside the existing `logo_url` mapping:

```typescript
    cover_image_url: club.coverImage || null,
    accent_color: club.accentColor || null,
```

- [ ] **Step 6: Update show mapper — mapDatabaseToShow**

In `apps/myk9show/src/services/mappers/showMappers.ts`, in `mapDatabaseToShow`, add the new fields to the returned object:

```typescript
    logoUrl: dbShow.logo_url || '',
    coverImageUrl: dbShow.cover_image_url || '',
    accentColor: dbShow.accent_color || '',
```

- [ ] **Step 7: Update show mapper — mapShowInputToInsert**

In `mapShowInputToInsert`, add:

```typescript
    logo_url: input.logoUrl || null,
    cover_image_url: input.coverImageUrl || null,
    accent_color: input.accentColor || null,
```

- [ ] **Step 8: Update show mapper — mapShowInputToUpdate**

In `mapShowInputToUpdate`, add (conditionally, following existing pattern):

```typescript
    ...(input.logoUrl !== undefined && { logo_url: input.logoUrl || null }),
    ...(input.coverImageUrl !== undefined && { cover_image_url: input.coverImageUrl || null }),
    ...(input.accentColor !== undefined && { accent_color: input.accentColor || null }),
```

- [ ] **Step 9: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS. Any type errors from existing code expecting the old interfaces should be caught here — fix by adding default values (`''`) where the new fields are constructed.

- [ ] **Step 10: Run existing tests**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: All existing tests pass. If mapper tests fail, update test fixtures to include the new fields.

- [ ] **Step 11: Commit**

```bash
git add apps/myk9show/src/types/club-types.ts apps/myk9show/src/types/show-types.ts apps/myk9show/src/services/mappers/clubMappers.ts apps/myk9show/src/services/mappers/showMappers.ts
git commit -m "feat(branding): add branding fields to Club/Show types and mappers"
```

---

### Task 4: Upload Functions

**Files:**

- Modify: `apps/myk9show/src/services/imageUploadService.ts`
- Create: `apps/myk9show/src/services/__tests__/imageUploadService.branding.test.ts`

- [ ] **Step 1: Write tests for branding upload functions**

```typescript
// apps/myk9show/src/services/__tests__/imageUploadService.branding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase
vi.mock('@myk9/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(),
        getPublicUrl: vi.fn(),
      })),
    },
  },
}));

import { supabase } from '@myk9/supabase';
import { uploadClubCover, uploadShowCover, uploadShowLogo } from '../imageUploadService';

describe('branding upload functions', () => {
  const mockUpload = vi.fn();
  const mockGetPublicUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.storage.from).mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
    } as any);
  });

  describe('uploadClubCover', () => {
    it('uploads to clubs/{clubId}/cover path with upsert', async () => {
      mockUpload.mockResolvedValue({ data: { path: 'clubs/abc/cover.webp' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://example.com/clubs/abc/cover.webp' },
      });

      const file = new File(['img'], 'photo.png', { type: 'image/png' });
      const result = await uploadClubCover('abc', file);

      expect(supabase.storage.from).toHaveBeenCalledWith('images');
      expect(mockUpload).toHaveBeenCalledWith(
        'clubs/abc/cover.webp',
        file,
        expect.objectContaining({ upsert: true })
      );
      expect(result.success).toBe(true);
      expect(result.url).toContain('clubs/abc/cover.webp');
    });

    it('rejects files over 5MB', async () => {
      const file = new File([new ArrayBuffer(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
      const result = await uploadClubCover('abc', file);
      expect(result.success).toBe(false);
      expect(result.error).toContain('5MB');
    });

    it('rejects non-image files', async () => {
      const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
      const result = await uploadClubCover('abc', file);
      expect(result.success).toBe(false);
      expect(result.error).toContain('image');
    });
  });

  describe('uploadShowCover', () => {
    it('uploads to shows/{showId}/cover path with upsert', async () => {
      mockUpload.mockResolvedValue({ data: { path: 'shows/xyz/cover.webp' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://example.com/shows/xyz/cover.webp' },
      });

      const file = new File(['img'], 'banner.jpg', { type: 'image/jpeg' });
      const result = await uploadShowCover('xyz', file);

      expect(mockUpload).toHaveBeenCalledWith(
        'shows/xyz/cover.webp',
        file,
        expect.objectContaining({ upsert: true })
      );
      expect(result.success).toBe(true);
    });
  });

  describe('uploadShowLogo', () => {
    it('uploads to shows/{showId}/logo path with upsert', async () => {
      mockUpload.mockResolvedValue({ data: { path: 'shows/xyz/logo.webp' }, error: null });
      mockGetPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://example.com/shows/xyz/logo.webp' },
      });

      const file = new File(['img'], 'logo.png', { type: 'image/png' });
      const result = await uploadShowLogo('xyz', file);

      expect(mockUpload).toHaveBeenCalledWith(
        'shows/xyz/logo.webp',
        file,
        expect.objectContaining({ upsert: true })
      );
      expect(result.success).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/services/__tests__/imageUploadService.branding.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Add branding upload functions to imageUploadService.ts**

Add to the end of `apps/myk9show/src/services/imageUploadService.ts`, before any default export:

```typescript
async function uploadBrandingImage(
  folder: string,
  entityId: string,
  fileName: string,
  file: File
): Promise<UploadResult> {
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'File size must be under 5MB' };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, error: 'File must be an image (JPEG, PNG, WebP)' };
  }

  const filePath = `${folder}/${entityId}/${fileName}`;

  const { error } = await supabase.storage.from(BUCKET_NAME).upload(filePath, file, {
    cacheControl: '3600',
    upsert: true,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  // Cache bust: append timestamp so browsers refetch after re-upload
  const url = `${urlData.publicUrl}?t=${Date.now()}`;
  return { success: true, url };
}

export async function uploadClubCover(clubId: string, file: File): Promise<UploadResult> {
  return uploadBrandingImage('clubs', clubId, 'cover.webp', file);
}

export async function uploadShowCover(showId: string, file: File): Promise<UploadResult> {
  return uploadBrandingImage('shows', showId, 'cover.webp', file);
}

export async function uploadShowLogo(showId: string, file: File): Promise<UploadResult> {
  return uploadBrandingImage('shows', showId, 'logo.webp', file);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/services/__tests__/imageUploadService.branding.test.ts`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/services/imageUploadService.ts apps/myk9show/src/services/__tests__/imageUploadService.branding.test.ts
git commit -m "feat(branding): add uploadClubCover, uploadShowCover, uploadShowLogo functions"
```

---

## Chunk 2: UI Components

### Task 5: AccentColorPicker Component

**Files:**

- Create: `apps/myk9show/src/components/ui/accent-color-picker.tsx`
- Create: `apps/myk9show/src/components/ui/__tests__/accent-color-picker.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// apps/myk9show/src/components/ui/__tests__/accent-color-picker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccentColorPicker } from '../accent-color-picker';

describe('AccentColorPicker', () => {
  it('renders all 10 preset swatches plus None option', () => {
    render(<AccentColorPicker value={null} onChange={vi.fn()} />);
    // 10 presets + 1 "None" = 11 buttons
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(11);
  });

  it('marks the selected color as checked', () => {
    render(<AccentColorPicker value="#2563eb" onChange={vi.fn()} />);
    const selected = screen.getByRole('radio', { name: /blue/i });
    expect(selected).toHaveAttribute('aria-checked', 'true');
  });

  it('marks None as checked when value is null', () => {
    render(<AccentColorPicker value={null} onChange={vi.fn()} />);
    const none = screen.getByRole('radio', { name: /none/i });
    expect(none).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with hex when a swatch is clicked', async () => {
    const onChange = vi.fn();
    render(<AccentColorPicker value={null} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /red/i }));
    expect(onChange).toHaveBeenCalledWith('#dc2626');
  });

  it('calls onChange with null when None is clicked', async () => {
    const onChange = vi.fn();
    render(<AccentColorPicker value="#2563eb" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /none/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('renders a preview strip when a color is selected', () => {
    render(<AccentColorPicker value="#2563eb" onChange={vi.fn()} />);
    expect(screen.getByTestId('color-preview')).toBeInTheDocument();
  });

  it('does not render preview strip when None is selected', () => {
    render(<AccentColorPicker value={null} onChange={vi.fn()} />);
    expect(screen.queryByTestId('color-preview')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/ui/__tests__/accent-color-picker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AccentColorPicker**

```tsx
// apps/myk9show/src/components/ui/accent-color-picker.tsx
import { Ban, Check } from 'lucide-react';
import { PRESET_COLORS, generatePalette } from '../../lib/branding';

interface AccentColorPickerProps {
  value: string | null;
  onChange: (color: string | null) => void;
}

export function AccentColorPicker({ value, onChange }: AccentColorPickerProps) {
  const palette = value ? generatePalette(value) : null;

  return (
    <div>
      <label className="mb-3 block text-sm font-semibold uppercase tracking-wider text-slate-400">
        Brand Color
      </label>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Brand color">
        {/* None option */}
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          aria-label="None"
          onClick={() => onChange(null)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all ${
            value === null
              ? 'border-slate-400 ring-2 ring-slate-400/30'
              : 'border-transparent hover:border-slate-600'
          }`}
          style={{ background: '#1a1a2e' }}
        >
          <Ban className="h-4 w-4 text-slate-500" />
        </button>

        {/* Preset swatches */}
        {PRESET_COLORS.map(color => (
          <button
            key={color.hex}
            type="button"
            role="radio"
            aria-checked={value === color.hex}
            aria-label={color.name}
            onClick={() => onChange(color.hex)}
            className={`relative h-9 w-9 rounded-lg border-2 transition-all ${
              value === color.hex
                ? 'border-white/60 ring-2 ring-white/20'
                : 'border-transparent hover:border-white/30'
            }`}
            style={{ backgroundColor: color.hex }}
          >
            {value === color.hex && (
              <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-md" />
            )}
          </button>
        ))}
      </div>

      {/* Live preview strip */}
      {palette && (
        <div className="mt-4 border-t border-white/5 pt-4" data-testid="color-preview">
          <label className="mb-2 block text-xs text-slate-500">PREVIEW</label>
          <div
            className="h-12 rounded-lg"
            style={{
              background: `linear-gradient(135deg, ${palette.primaryDark}, ${palette.primary}, ${palette.primaryLight})`,
              borderTop: `3px solid ${palette.primary}`,
            }}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/ui/__tests__/accent-color-picker.test.tsx`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/ui/accent-color-picker.tsx apps/myk9show/src/components/ui/__tests__/accent-color-picker.test.tsx
git commit -m "feat(branding): add AccentColorPicker component with preset swatches"
```

---

### Task 6: CoverImageUpload Component

**Files:**

- Create: `apps/myk9show/src/components/ui/cover-image-upload.tsx`
- Create: `apps/myk9show/src/components/ui/__tests__/cover-image-upload.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// apps/myk9show/src/components/ui/__tests__/cover-image-upload.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverImageUpload } from '../cover-image-upload';

describe('CoverImageUpload', () => {
  it('renders children (the cover area) as-is when not editable', () => {
    render(
      <CoverImageUpload editable={false} onUpload={vi.fn()} onRemove={vi.fn()}>
        <div data-testid="cover-content">Cover</div>
      </CoverImageUpload>,
    );
    expect(screen.getByTestId('cover-content')).toBeInTheDocument();
    expect(screen.queryByText(/change cover/i)).not.toBeInTheDocument();
  });

  it('shows hover overlay with "Change Cover" when editable', async () => {
    render(
      <CoverImageUpload editable onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>,
    );
    // Overlay is visible on hover via CSS (group-hover), but the button should be in the DOM
    expect(screen.getByLabelText(/change cover/i)).toBeInTheDocument();
  });

  it('shows "Remove Cover" option when hasCover is true', () => {
    render(
      <CoverImageUpload editable hasCover onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>,
    );
    expect(screen.getByLabelText(/remove cover/i)).toBeInTheDocument();
  });

  it('does not show "Remove Cover" when hasCover is false', () => {
    render(
      <CoverImageUpload editable hasCover={false} onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>,
    );
    expect(screen.queryByLabelText(/remove cover/i)).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    render(
      <CoverImageUpload editable hasCover onUpload={vi.fn()} onRemove={onRemove}>
        <div>Cover</div>
      </CoverImageUpload>,
    );
    await userEvent.click(screen.getByLabelText(/remove cover/i));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows uploading state', () => {
    render(
      <CoverImageUpload editable isUploading onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>,
    );
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/ui/__tests__/cover-image-upload.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement CoverImageUpload**

```tsx
// apps/myk9show/src/components/ui/cover-image-upload.tsx
import { useRef, type ReactNode } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';

interface CoverImageUploadProps {
  children: ReactNode;
  editable: boolean;
  hasCover?: boolean;
  isUploading?: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function CoverImageUpload({
  children,
  editable,
  hasCover = false,
  isUploading = false,
  onUpload,
  onRemove,
}: CoverImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      return;
    }

    onUpload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }

  if (!editable) {
    return <>{children}</>;
  }

  return (
    <div className="group relative">
      {children}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />

      {/* Hover overlay */}
      <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-t-xl bg-black/0 opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
        {isUploading ? (
          <div className="flex items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </div>
        ) : (
          <>
            <button
              type="button"
              aria-label="Change cover"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg bg-black/60 px-4 py-2 text-sm text-white transition-colors hover:bg-black/80"
            >
              <Camera className="h-4 w-4" />
              Change Cover
            </button>

            {hasCover && (
              <button
                type="button"
                aria-label="Remove cover"
                onClick={onRemove}
                className="flex items-center gap-2 rounded-lg bg-red-600/80 px-4 py-2 text-sm text-white transition-colors hover:bg-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/ui/__tests__/cover-image-upload.test.tsx`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/ui/cover-image-upload.tsx apps/myk9show/src/components/ui/__tests__/cover-image-upload.test.tsx
git commit -m "feat(branding): add CoverImageUpload component with upload/remove overlay"
```

---

### Task 7: ShowBrandedHero Component

**Files:**

- Create: `apps/myk9show/src/components/shows/ShowBrandedHero.tsx`
- Create: `apps/myk9show/src/components/shows/__tests__/ShowBrandedHero.test.tsx`

- [ ] **Step 1: Write tests**

```typescript
// apps/myk9show/src/components/shows/__tests__/ShowBrandedHero.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ShowBrandedHero } from '../ShowBrandedHero';

// Mock navigation
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

const baseProps = {
  showName: 'Bluegrass Classic 2026',
  location: 'Louisville, KY',
  startDate: '2026-03-15',
  endDate: '2026-03-17',
  clubName: 'Kennel Club of Louisville',
  organization: 'AKC',
  status: 'accepting_entries',
};

describe('ShowBrandedHero', () => {
  it('renders show name and details', () => {
    render(<ShowBrandedHero {...baseProps} />);
    expect(screen.getByText('Bluegrass Classic 2026')).toBeInTheDocument();
    expect(screen.getByText(/Louisville, KY/)).toBeInTheDocument();
    expect(screen.getByText(/Kennel Club of Louisville/)).toBeInTheDocument();
  });

  it('renders cover image when provided', () => {
    render(<ShowBrandedHero {...baseProps} coverImage="https://example.com/cover.webp" />);
    const img = screen.getByRole('img', { name: /cover/i });
    expect(img).toHaveAttribute('src', 'https://example.com/cover.webp');
  });

  it('renders gradient fallback when no cover image', () => {
    render(<ShowBrandedHero {...baseProps} />);
    expect(screen.queryByRole('img', { name: /cover/i })).not.toBeInTheDocument();
    // Should have a gradient div with data-testid
    expect(screen.getByTestId('gradient-placeholder')).toBeInTheDocument();
  });

  it('renders club logo when provided', () => {
    render(<ShowBrandedHero {...baseProps} logo="https://example.com/logo.webp" />);
    const logo = screen.getByRole('img', { name: /club logo/i });
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.webp');
  });

  it('renders initials badge when no logo', () => {
    render(<ShowBrandedHero {...baseProps} />);
    // "KC" initials from "Kennel Club of Louisville"
    expect(screen.getByText('KC')).toBeInTheDocument();
  });

  it('renders accent color bar when provided', () => {
    render(<ShowBrandedHero {...baseProps} accentColor="#dc2626" />);
    const bar = screen.getByTestId('accent-bar');
    expect(bar).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('renders status badge', () => {
    render(<ShowBrandedHero {...baseProps} status="accepting_entries" />);
    expect(screen.getByText(/accepting entries/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/ShowBrandedHero.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ShowBrandedHero**

```tsx
// apps/myk9show/src/components/shows/ShowBrandedHero.tsx
import { Calendar, MapPin, Building2 } from 'lucide-react';
import { getShowPlaceholder } from './show-card-placeholders';
import { generatePalette } from '../../lib/branding';

interface ShowBrandedHeroProps {
  showName: string;
  location: string;
  startDate: string;
  endDate: string;
  clubName: string;
  organization?: string;
  status?: string;
  logo?: string | null;
  coverImage?: string | null;
  accentColor?: string | null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(w => w.length > 0 && w[0] === w[0].toUpperCase())
    .slice(0, 2)
    .map(w => w[0])
    .join('');
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = startDate.toLocaleDateString('en-US', opts);
  if (start === end) return `${startStr}, ${startDate.getFullYear()}`;
  const endStr = endDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr}–${endStr}`;
}

function statusLabel(status?: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    published: 'Published',
    accepting_entries: 'Accepting Entries',
    closed: 'Entries Closed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status ?? ''] ?? status ?? '';
}

function statusColorClass(status?: string): string {
  switch (status) {
    case 'accepting_entries':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'published':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'draft':
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    case 'cancelled':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'completed':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

export function ShowBrandedHero({
  showName,
  location,
  startDate,
  endDate,
  clubName,
  organization,
  status,
  logo,
  coverImage,
  accentColor,
}: ShowBrandedHeroProps) {
  const palette = accentColor ? generatePalette(accentColor) : null;
  const placeholder = getShowPlaceholder(organization, showName);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Accent color bar */}
      {palette && (
        <div
          data-testid="accent-bar"
          className="absolute left-0 right-0 top-0 z-10 h-[3px]"
          style={{ backgroundColor: palette.primary }}
        />
      )}

      {/* Cover area */}
      <div className="relative h-[180px] overflow-hidden">
        {coverImage ? (
          <img src={coverImage} alt="Show cover" className="h-full w-full object-cover" />
        ) : (
          <div
            data-testid="gradient-placeholder"
            className={`h-full w-full bg-gradient-to-br ${placeholder.gradient} ${placeholder.pattern}`}
          />
        )}
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Status badge */}
        {status && (
          <div className="absolute right-4 top-4">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColorClass(status)}`}
            >
              {statusLabel(status)}
            </span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="relative bg-[#1a1a2e] px-6 pb-5 pt-10">
        {/* Floating logo */}
        <div className="absolute -top-8 left-6">
          {logo ? (
            <img
              src={logo}
              alt="Club logo"
              className="h-16 w-16 rounded-xl border-[3px] border-[#1a1a2e] object-cover shadow-lg"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl border-[3px] border-[#1a1a2e] shadow-lg"
              style={{
                backgroundColor: palette?.primaryDark ?? '#1e293b',
              }}
            >
              <span
                className="text-lg font-bold"
                style={{ color: palette?.onPrimary ?? '#94a3b8' }}
              >
                {getInitials(clubName)}
              </span>
            </div>
          )}
        </div>

        {/* Show details */}
        <h1 className="text-xl font-bold text-white">{showName}</h1>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {location}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateRange(startDate, endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {clubName}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/shows/__tests__/ShowBrandedHero.test.tsx`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowBrandedHero.tsx apps/myk9show/src/components/shows/__tests__/ShowBrandedHero.test.tsx
git commit -m "feat(branding): add ShowBrandedHero component with cover/logo/accent support"
```

---

## Chunk 3: Integration

### Task 8: Wire ShowBrandedHero into ShowDetailsEnhanced

**Files:**

- Modify: `apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced/index.tsx` (~line 203, hero prop)
- Modify: `apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced/ShowHeader.tsx`

- [ ] **Step 1: Read current ShowHeader and ShowDetailsEnhanced**

Read both files fully to understand the current hero prop integration point and what data is available in the component scope.

- [ ] **Step 2: Update ShowHeader to use ShowBrandedHero**

Replace the current header layout in `ShowHeader.tsx` with `ShowBrandedHero`. Keep the existing breadcrumb and action buttons, but swap the gradient box + info layout for the new branded hero. The branded hero renders inside the existing ShowHeader component so the `hero` prop plumbing in ShowDetailsEnhanced doesn't need to change.

Key integration points:

- `showData` already has `clubName`, `organization`, `startDate`, `endDate`, `location`, `status`
- New fields: `showData.logoUrl`, `showData.coverImageUrl`, `showData.accentColor`
- Need to resolve branding: call `resolveShowBranding(showData, club)`. The club data may need to be fetched — check if a club query is already available in the component tree. If not, use the show-level fields only (show fields already fall through to club via `resolveShowBranding`).
- Keep the breadcrumb above the hero and action buttons below/beside it.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced/ShowHeader.tsx apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced/index.tsx
git commit -m "feat(branding): wire ShowBrandedHero into show detail page header"
```

---

### Task 9: Update ShowCard to Display Cover Image and Accent Bar

**Files:**

- Modify: `apps/myk9show/src/components/shows/ShowCard.tsx` (~lines 10-25 props, ~lines 107-125 placeholder)

- [ ] **Step 1: Add branding props to ShowCardProps**

In `ShowCard.tsx`, add to the `ShowCardProps` interface:

```typescript
  coverImageUrl?: string;
  accentColor?: string | null;
```

- [ ] **Step 2: Update the card image area**

In the ShowCard component body, modify the image rendering section:

- If `coverImageUrl` is provided, render an `<img>` with `object-cover` and `loading="lazy"` instead of `<ShowPlaceholder>` [ADDED: lazy loading per spec edge case for list page performance]
- If not, keep existing `<ShowPlaceholder>` rendering unchanged
- Add a 3px accent color bar at the top of the image area when `accentColor` is present

- [ ] **Step 3: Pass branding props from parent components**

Search for all places that render `<ShowCard>` and pass through the new `coverImageUrl` and `accentColor` props from the show data. Key files to check:

- `apps/myk9show/src/components/shows/browse/ShowsGridView.tsx`
- `apps/myk9show/src/components/shows/browse/ShowsListView.tsx`
- `apps/myk9show/src/components/shows/UpcomingShows.tsx` (landing page Upcoming Shows section)

Map from show data: `show.coverImageUrl` → `coverImageUrl`, `show.accentColor` → `accentColor`. For resolved branding (club fallback), the shows should already have resolved values from the mapper, or pass raw values and let the card handle display.

- [ ] **Step 4: Run typecheck and existing ShowCard tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS. Update any ShowCard test fixtures if they fail due to new optional props.

- [ ] **Step 5: [ADDED] Write ShowCard branding unit tests**

Add tests to the existing ShowCard test file (or create `apps/myk9show/src/components/shows/__tests__/ShowCard.branding.test.tsx`):

```typescript
describe('ShowCard branding', () => {
  it('renders cover image with lazy loading when coverImageUrl provided', () => {
    render(<ShowCard {...baseProps} coverImageUrl="https://example.com/cover.webp" />);
    const img = screen.getByRole('img', { name: /cover/i });
    expect(img).toHaveAttribute('src', 'https://example.com/cover.webp');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('renders gradient placeholder when no coverImageUrl', () => {
    render(<ShowCard {...baseProps} />);
    expect(screen.queryByRole('img', { name: /cover/i })).not.toBeInTheDocument();
  });

  it('renders accent color bar when accentColor provided', () => {
    render(<ShowCard {...baseProps} accentColor="#dc2626" />);
    const bar = screen.getByTestId('accent-bar');
    expect(bar).toHaveStyle({ backgroundColor: '#dc2626' });
  });

  it('does not render accent bar when accentColor is null', () => {
    render(<ShowCard {...baseProps} accentColor={null} />);
    expect(screen.queryByTestId('accent-bar')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowCard.tsx apps/myk9show/src/components/shows/__tests__/
git commit -m "feat(branding): show cover image and accent bar on ShowCard"
```

---

### Task 10: Update ClubHeader with Cover Image and Accent Bar

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/ClubHeader.tsx`

- [ ] **Step 1: Read current ClubHeader**

Read the full component to understand the current layout and identify where the cover image area, floating logo, and accent bar should be inserted.

- [ ] **Step 2: Add cover image area above existing content**

Restructure `ClubHeader` to add:

- A cover image/gradient banner area (~140px) at the top of the card
- Move the existing logo to float at the cover/info boundary (same pattern as ShowBrandedHero)
- Add 3px accent color bar at the very top
- Add `CoverImageUpload` wrapper around the cover area for authorized users

The existing 3-dot menu, club info (name, location, badges), and action buttons stay in the info area below the cover.

Check authorization: the component receives an `onEditPhoto` handler — use a similar pattern for cover upload. The parent component should pass `canEditBranding` or similar based on RBAC role checks.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/ClubHeader.tsx
git commit -m "feat(branding): add cover image and accent bar to ClubHeader"
```

---

### Task 11: Add AccentColorPicker to Club Edit Form

**Files:**

- Modify: The club edit form component (find via: `apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx` or similar)

- [ ] **Step 1: Find and read the club edit form**

Search for the club edit form/panel. It should be in `apps/myk9show/src/components/panels/edit/` or `apps/myk9show/src/components/clubs/`.

- [ ] **Step 2: Add AccentColorPicker field**

Add the `AccentColorPicker` as a new form field in the club edit form, after the existing fields (e.g., after website or description). Wire it to read/write the `accentColor` field on the club form state.

```tsx
import { AccentColorPicker } from '../../ui/accent-color-picker';

// In the form JSX, add:
<AccentColorPicker
  value={formData.accentColor || null}
  onChange={color => setFormData(prev => ({ ...prev, accentColor: color ?? '' }))}
/>;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/
git commit -m "feat(branding): add AccentColorPicker to club edit form"
```

---

### Task 12: Wire Cover Image Upload on Club Detail Page

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/index.tsx` (or the parent that renders ClubHeader)

- [ ] **Step 1: Read the club details page to find upload wiring point**

Read `apps/myk9show/src/components/clubs/ClubDetails/index.tsx` to see how `onEditPhoto` is currently handled. The cover upload follows the same pattern.

- [ ] **Step 2: Add cover upload handler**

Add an `onCoverUpload` handler that:

1. Sets `isUploading` state to true (passed to CoverImageUpload for spinner)
2. Calls `uploadClubCover(club.id, file)` from `imageUploadService`
3. On success, updates the club store with the new `cover_image_url` and shows success toast
4. [ADDED] On failure, shows error toast with `result.error` message
5. Sets `isUploading` to false
6. Pass the handler, `isUploading`, and authorization flag down to `ClubHeader`

Add an `onCoverRemove` handler that:

1. Calls `supabase.storage.from('images').remove(['clubs/{clubId}/cover.webp'])`
2. Updates the club store to clear `cover_image_url`
3. [ADDED] Shows success toast on remove, error toast on failure

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/
git commit -m "feat(branding): wire cover image upload/remove on club detail page"
```

---

### Task 13: Wire Cover/Logo Upload on Show Detail Page (Secretary Override)

**Files:**

- Modify: `apps/myk9show/src/components/shows/ShowDetails/ShowDetailsEnhanced/ShowHeader.tsx` (or parent component)

The spec says: "Secretaries see it on show pages (for per-show overrides)." This task wires `CoverImageUpload` on the show detail page so secretaries can set show-level branding overrides.

- [ ] **Step 1: Read ShowHeader and ShowDetailsEnhanced to find the wiring point**

Identify where the `ShowBrandedHero` was integrated in Task 8. The `CoverImageUpload` wrapper goes around the hero's cover area.

- [ ] **Step 2: Add cover upload handler for shows**

Add an `onShowCoverUpload` handler that:

1. Sets `isUploading` state to true
2. Calls `uploadShowCover(show.id, file)` from `imageUploadService`
3. On success, updates the show data (invalidate React Query cache or update store) and shows success toast
4. [ADDED] On failure, shows error toast with `result.error` message
5. Sets `isUploading` to false
6. Wrap the hero cover area with `<CoverImageUpload editable={isSecretary || isPlatformAdmin} isUploading={isUploading}>`

Add an `onShowCoverRemove` handler that:

1. Calls `supabase.storage.from('images').remove([`shows/${show.id}/cover.webp`])`
2. Updates show to clear `cover_image_url`
3. [ADDED] Shows success toast on remove, error toast on failure

Check authorization: use existing RBAC context to determine if the user has `SECRETARY` or `platform_admin` role for this show's club.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/shows/ShowDetails/
git commit -m "feat(branding): wire cover image upload on show detail page for secretaries"
```

---

### Task 14: Final Quality Check

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: 0 errors.

- [ ] **Step 3: Run full test suite**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: All tests pass (existing + new).

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: Build succeeds for all packages and apps.

- [ ] **Step 5: Verify visually in dev server**

Run: `pnpm dev:show`
Check:

1. Browse shows page — ShowCards with accent color bars
2. Show detail page — branded hero with floating logo
3. Club detail page — cover image area with upload overlay
4. Club edit form — AccentColorPicker with 10 swatches + None

- [ ] **Step 6: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "fix(branding): address typecheck/lint issues from integration"
```
