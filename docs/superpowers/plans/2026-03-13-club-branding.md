# Club Branding End-to-End Wiring — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire existing club branding infrastructure into a cohesive end-to-end experience — club admin sets branding, it flows through to show cards, detail pages, and OG images.

**Architecture:** No new migrations or packages. Add a Branding tab to ClubDetails, add club→show branding fallback in show queries/mappers, pass branding props through to all show-rendering components. Existing components (AccentColorPicker, ShowBrandedHero, CoverImageUpload, imageUploadService) are composed, not rebuilt.

**Tech Stack:** React, TypeScript, Zustand, Supabase (PostgREST joins), Tailwind CSS, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-club-branding-design.md`

---

## Chunk 1: Show Query Branding Fallback

### Task 1: Add club branding join to show queries

**Files:**

- Modify: `apps/myk9show/src/services/database/queries/showQueries.ts`

- [ ] **Step 1: Update `getAllShows` query to include club branding columns**

In `showQueries.ts`, the `getAllShows` function currently selects:

```
club:clubs(id, name)
```

Change to:

```
club:clubs(id, name, logo_url, cover_image_url, accent_color)
```

- [ ] **Step 2: Update all other show queries that use club join**

There are 7 other functions in `showQueries.ts` that select `club:clubs(id, name)`. Add `logo_url, cover_image_url, accent_color` to each:

- `getShowById` (line 60)
- `getUpcomingShows` (line 129)
- `getShowsByDateRange` (line 173)
- `getShowsByClub` (line 217)
- `createShow` (line 261)
- `updateShow` (line 301)
- `getShowsWithEntryCounts` (line 549)

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS (the join returns extra columns; the mapper will handle them in Task 2)

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/services/database/queries/showQueries.ts
git commit -m "feat(branding): add club branding columns to show queries"
```

### Task 2: Add club branding fallback in show mapper

**Files:**

- Modify: `apps/myk9show/src/services/mappers/showMappers.ts`
- Test: `apps/myk9show/src/test/mappers/showMappers.test.ts` (create if not exists)

- [ ] **Step 1: Write failing test for branding fallback**

Create or update the show mappers test file. Test that when a show has no branding but its club does, the mapper uses the club's values:

```typescript
describe('branding fallback', () => {
  it('falls back to club branding when show branding is null', () => {
    const dbShow = {
      // ... minimal required fields ...
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      club: {
        id: 'club-1',
        name: 'Test Club',
        logo_url: 'club-logo.webp',
        cover_image_url: 'club-cover.webp',
        accent_color: '#2563eb',
      },
    };
    const result = mapDatabaseToShow(dbShow);
    expect(result.logoUrl).toBe('club-logo.webp');
    expect(result.coverImageUrl).toBe('club-cover.webp');
    expect(result.accentColor).toBe('#2563eb');
  });

  it('prefers show branding over club branding', () => {
    const dbShow = {
      // ... minimal required fields ...
      logo_url: 'show-logo.webp',
      cover_image_url: 'show-cover.webp',
      accent_color: '#dc2626',
      club: {
        id: 'club-1',
        name: 'Test Club',
        logo_url: 'club-logo.webp',
        cover_image_url: 'club-cover.webp',
        accent_color: '#2563eb',
      },
    };
    const result = mapDatabaseToShow(dbShow);
    expect(result.logoUrl).toBe('show-logo.webp');
    expect(result.coverImageUrl).toBe('show-cover.webp');
    expect(result.accentColor).toBe('#dc2626');
  });

  it('returns empty strings when neither show nor club have branding', () => {
    const dbShow = {
      // ... minimal required fields ...
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      club: {
        id: 'club-1',
        name: 'Test Club',
        logo_url: null,
        cover_image_url: null,
        accent_color: null,
      },
    };
    const result = mapDatabaseToShow(dbShow);
    expect(result.logoUrl).toBe('');
    expect(result.coverImageUrl).toBe('');
    expect(result.accentColor).toBe('');
  });

  // [ADDED] Test for null club join — graceful fallback
  it('returns empty strings when club join is null', () => {
    const dbShow = {
      // ... minimal required fields ...
      logo_url: null,
      cover_image_url: null,
      accent_color: null,
      club: null,
    };
    const result = mapDatabaseToShow(dbShow);
    expect(result.logoUrl).toBe('');
    expect(result.coverImageUrl).toBe('');
    expect(result.accentColor).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm test src/test/mappers/showMappers.test.ts`
Expected: FAIL (mapper doesn't read club branding yet)

- [ ] **Step 3: Update mapper to apply club branding fallback**

In `showMappers.ts`, find the `mapDatabaseToShow` function (line 78). Change lines 205-207 from:

```typescript
logoUrl: dbShow.logo_url || '',
coverImageUrl: dbShow.cover_image_url || '',
accentColor: dbShow.accent_color || '',
```

To:

```typescript
logoUrl: dbShow.logo_url || (dbShow.club as Record<string, unknown>)?.logo_url as string || '',
coverImageUrl: dbShow.cover_image_url || (dbShow.club as Record<string, unknown>)?.cover_image_url as string || '',
accentColor: dbShow.accent_color || (dbShow.club as Record<string, unknown>)?.accent_color as string || '',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm test src/test/mappers/showMappers.test.ts`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/services/mappers/showMappers.ts apps/myk9show/src/test/mappers/showMappers.test.ts
git commit -m "feat(branding): add club branding fallback in show mapper"
```

---

## Chunk 2: Wire Branding Through to Show Views

### Task 3: Pass branding props in Home.tsx UpcomingShows mapper

**Files:**

- Modify: `apps/myk9show/src/pages/Home.tsx`

- [ ] **Step 1: Add branding fields to the show mapping**

In `Home.tsx`, the `mappedShows` useMemo (around line 27) maps `dbShows` to the UpcomingShows `Show` interface. Add the missing branding fields:

```typescript
coverImageUrl: show.coverImageUrl || undefined,
accentColor: show.accentColor || null,
```

Add these after `status: show.status,` (line 43).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/pages/Home.tsx
git commit -m "feat(branding): pass branding props to UpcomingShows on landing page"
```

### Task 4: Add accent color branding to ShowsGridView

**Files:**

- Modify: `apps/myk9show/src/components/shows/browse/ShowsGridView.tsx`

- [ ] **Step 1: Add accent color border to grid cards**

`ShowsGridView` renders its own card markup. Find the card container div for each show and add an accent color top-bar. Add a 3px accent bar div as the first child inside each card:

```tsx
{
  show.accentColor && (
    <div className="h-[3px] rounded-t-lg" style={{ backgroundColor: show.accentColor }} />
  );
}
```

- [ ] **Step 2: Run typecheck and verify visually**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/browse/ShowsGridView.tsx
git commit -m "feat(branding): add accent color bar to browse grid cards"
```

### Task 5: Add accent color branding to ShowsListView

**Files:**

- Modify: `apps/myk9show/src/components/shows/browse/ShowsListView.tsx`

- [ ] **Step 1: Add accent color left-border to list rows**

`ShowsListView` renders list-style rows. Add a left-border to each row using the show's accent color:

```tsx
style={show.accentColor ? { borderLeft: `4px solid ${show.accentColor}` } : undefined}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/browse/ShowsListView.tsx
git commit -m "feat(branding): add accent color border to browse list rows"
```

### Task 6: Add accent color branding to landing UpcomingShowsSection

**Files:**

- Modify: `apps/myk9show/src/components/landing/UpcomingShowsSection.tsx`

- [ ] **Step 1: Add accent color left-border to section cards**

`UpcomingShowsSection` renders its own card markup (not ShowCard). Add an accent color left-border to each show card, same pattern as ShowsListView:

```tsx
style={show.accentColor ? { borderLeft: `4px solid ${show.accentColor}` } : undefined}
```

If the component's show interface doesn't include `accentColor`, check if it receives the full Show type or a subset. If a subset, add `accentColor?: string | null` to the local interface.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/landing/UpcomingShowsSection.tsx
git commit -m "feat(branding): add accent color to landing UpcomingShowsSection"
```

### Task 7: Add accent color branding to club detail show tabs

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/UpcomingShowsTab.tsx`
- Modify: `apps/myk9show/src/components/clubs/ClubDetails/PastShowsTab.tsx`

- [ ] **Step 1: Check if show tabs have access to branding data**

The club detail show tabs receive `ClubShow[]` which is derived from `Club['upcomingShows']`. Check if this type includes branding fields. If not, the `clubShows` computation in `useClubDetailsState.ts` needs to pass branding through from the show store data.

- [ ] **Step 2: Pass branding data through clubShows computation**

In `useClubDetailsState.ts`, the `clubShows` memo (around line 84) maps show store data to `ClubShow`. If `ClubShow` doesn't include branding fields, extend it in `types.ts` and populate the fields in the memo.

- [ ] **Step 3: Add accent color left-border to show cards in both tabs**

Same pattern as ShowsListView — add `style={{ borderLeft: show.accentColor ? '4px solid ' + show.accentColor : undefined }}` to the card container in each tab.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/UpcomingShowsTab.tsx apps/myk9show/src/components/clubs/ClubDetails/PastShowsTab.tsx apps/myk9show/src/components/clubs/ClubDetails/useClubDetailsState.ts apps/myk9show/src/components/clubs/ClubDetails/types.ts
git commit -m "feat(branding): add accent color to club detail show tabs"
```

### Task 8: Replace PublicShowView hero with ShowBrandedHero

**Files:**

- Modify: `apps/myk9show/src/components/shows/PublicShowView.tsx`

- [ ] **Step 1: Import ShowBrandedHero**

Add to imports:

```typescript
import { ShowBrandedHero } from './ShowBrandedHero';
```

- [ ] **Step 2: Replace the hero section**

Replace lines 94-136 (the `{/* Hero */}` section — from `<div className="relative border-b..."` through its closing `</div>`) with:

```tsx
{
  /* Branded Hero */
}
<ShowBrandedHero
  showName={show.name}
  location={show.location}
  startDate={show.startDate}
  endDate={show.endDate}
  clubName={show.clubName}
  organization={show.organization}
  status={show.status}
  logo={show.logoUrl || null}
  coverImage={show.coverImageUrl || null}
  accentColor={show.accentColor || null}
/>;
{
  /* Share + org badges (moved outside hero) */
}
<div className="max-w-3xl mx-auto px-6 pt-4 flex justify-between items-center">
  <div className="flex items-center gap-2.5">
    {show.organization && (
      <span className="text-xs font-semibold tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary">
        {show.organization}
      </span>
    )}
  </div>
  <ShareButton shareData={shareData} />
</div>;
```

Note: `ShowBrandedHero` already renders show name, dates, location, club name, status, logo, cover, and accent color. The share button and org badge move outside since `ShowBrandedHero` doesn't include them.

- [ ] **Step 3: Remove unused imports**

Remove `getInitials` import if it was only used in the old hero section. Keep `Calendar`, `MapPin` only if used elsewhere in the component.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Run existing tests**

Run: `cd apps/myk9show && pnpm test PublicShowView`
Expected: PASS (or update mocks if needed)

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/shows/PublicShowView.tsx
git commit -m "feat(branding): use ShowBrandedHero in PublicShowView"
```

---

## Chunk 3: Branding Tab on Club Profile

### Task 9: Add 'branding' to ClubTab type

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/types.ts`

- [ ] **Step 1: Extend ClubTab union**

Change line 8 from:

```typescript
export type ClubTab = 'upcoming' | 'past' | 'about' | 'members';
```

To:

```typescript
export type ClubTab = 'upcoming' | 'past' | 'about' | 'members' | 'branding';
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/types.ts
git commit -m "feat(branding): add 'branding' to ClubTab type"
```

### Task 10: Add accent color save handler to useClubDetailsState

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/useClubDetailsState.ts`

- [ ] **Step 1: Add handleSaveAccentColor callback**

Add after the `handleCoverRemove` callback (around line 366):

```typescript
const handleSaveAccentColor = useCallback(
  async (accentColor: string | null) => {
    if (!selectedClub) return;
    try {
      await updateClub({ ...selectedClub, accentColor: accentColor ?? '' });
      notifications.success('Brand color updated');
    } catch (error) {
      logger.error(
        'Accent color save failed',
        'clubs',
        { clubId: selectedClub.id },
        error as Error
      );
      notifications.error('Failed to update brand color', {
        description: getErrorMessage(error),
      });
    }
  },
  [selectedClub, updateClub]
);
```

- [ ] **Step 2: Add to return object**

Add `handleSaveAccentColor` to the return object after `handleCoverRemove`.

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/useClubDetailsState.ts
git commit -m "feat(branding): add accent color save handler"
```

### Task 11: Create BrandingTab component

**Files:**

- Create: `apps/myk9show/src/components/clubs/ClubDetails/BrandingTab.tsx`
- Test: `apps/myk9show/src/test/components/clubs/BrandingTab.test.tsx`

- [ ] **Step 1: Write failing test for BrandingTab**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrandingTab } from '@/components/clubs/ClubDetails/BrandingTab';

// Mock AccentColorPicker
vi.mock('@/components/ui/accent-color-picker', () => ({
  AccentColorPicker: ({ value, onChange }: { value: string | null; onChange: (c: string | null) => void }) => (
    <div data-testid="accent-color-picker" onClick={() => onChange('#dc2626')}>
      {value ?? 'none'}
    </div>
  ),
}));

const mockClub = {
  id: 'club-1',
  name: 'Test Club',
  accentColor: '#2563eb',
  logo: '',
  coverImage: '',
};

describe('BrandingTab', () => {
  it('renders accent color picker with current value', () => {
    render(
      <BrandingTab
        club={mockClub as any}
        onSaveAccentColor={vi.fn()}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    expect(screen.getByTestId('accent-color-picker')).toBeInTheDocument();
  });

  it('shows Save/Discard when color changes', () => {
    render(
      <BrandingTab
        club={mockClub as any}
        onSaveAccentColor={vi.fn()}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    fireEvent.click(screen.getByTestId('accent-color-picker'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Discard')).toBeInTheDocument();
  });

  it('calls onSaveAccentColor when Save clicked', async () => {
    const onSave = vi.fn();
    render(
      <BrandingTab
        club={mockClub as any}
        onSaveAccentColor={onSave}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    fireEvent.click(screen.getByTestId('accent-color-picker'));
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('#dc2626');
  });

  it('reverts color on Discard', () => {
    render(
      <BrandingTab
        club={mockClub as any}
        onSaveAccentColor={vi.fn()}
        onEditPhoto={vi.fn()}
        onCoverUpload={vi.fn()}
        onCoverRemove={vi.fn()}
        isUploadingCover={false}
      />
    );
    fireEvent.click(screen.getByTestId('accent-color-picker'));
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Discard'));
    expect(screen.queryByText('Save')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && pnpm test src/test/components/clubs/BrandingTab.test.tsx`
Expected: FAIL (component doesn't exist)

- [ ] **Step 3: Implement BrandingTab**

Create `BrandingTab.tsx`:

```tsx
import { useState, useMemo } from 'react';
import { Camera, Palette, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccentColorPicker } from '@/components/ui/accent-color-picker';
import { CoverImageUpload } from '@/components/ui/cover-image-upload';
import { ShowCard } from '@/components/shows/ShowCard';
import { generatePalette } from '@/lib/branding';
import type { Club } from '@/types/club-types';

interface BrandingTabProps {
  club: Club;
  onSaveAccentColor: (color: string | null) => void;
  onEditPhoto: () => void;
  onCoverUpload: (file: File) => void;
  onCoverRemove: () => void;
  isUploadingCover: boolean;
}

export function BrandingTab({
  club,
  onSaveAccentColor,
  onEditPhoto,
  onCoverUpload,
  onCoverRemove,
  isUploadingCover,
}: BrandingTabProps) {
  const [draftColor, setDraftColor] = useState<string | null>(club.accentColor || null);
  const isDirty = draftColor !== (club.accentColor || null);

  const handleSave = () => {
    onSaveAccentColor(draftColor);
  };

  const handleDiscard = () => {
    setDraftColor(club.accentColor || null);
  };

  // Preview palette for the draft color
  const previewPalette = useMemo(
    () => (draftColor ? generatePalette(draftColor) : null),
    [draftColor]
  );

  return (
    <div className="space-y-8">
      {/* Accent Color */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Brand Color</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a color that represents your club. It appears on show cards, detail pages, and
          shared links.
        </p>
        <AccentColorPicker value={draftColor} onChange={setDraftColor} />
        {isDirty && (
          <div className="flex gap-3 mt-4">
            <Button onClick={handleSave}>Save</Button>
            <Button variant="outline" onClick={handleDiscard}>
              Discard
            </Button>
          </div>
        )}
      </section>

      {/* Logo */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Camera className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Club Logo</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Your logo appears on show cards and detail pages. Click to change.
        </p>
        <div
          className="inline-block cursor-pointer hover:opacity-80 transition-opacity"
          onClick={onEditPhoto}
        >
          {club.logo ? (
            <img
              src={club.logo}
              alt={club.name}
              className="w-20 h-20 rounded-xl border-2 border-border object-cover"
            />
          ) : (
            <div
              className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary/50 transition-colors"
              style={{ backgroundColor: previewPalette?.primaryDark ?? '#1e293b' }}
            >
              <Camera className="h-6 w-6" />
            </div>
          )}
        </div>
      </section>

      {/* Cover Image */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground">Cover Image</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          A banner image that appears at the top of your club's profile. You can also change it by
          hovering over the header above.
        </p>
        <CoverImageUpload
          editable
          hasCover={Boolean(club.coverImage)}
          isUploading={isUploadingCover}
          onUpload={onCoverUpload}
          onRemove={onCoverRemove}
        >
          <div className="h-32 w-full max-w-md rounded-lg overflow-hidden border border-border">
            {club.coverImage ? (
              <img src={club.coverImage} alt="Cover" className="h-full w-full object-cover" />
            ) : (
              <div
                className="h-full w-full"
                style={{
                  background: previewPalette
                    ? `linear-gradient(135deg, ${previewPalette.primaryDark}, ${previewPalette.primary}, ${previewPalette.primaryLight})`
                    : 'linear-gradient(135deg, #1e293b, #334155, #475569)',
                }}
              />
            )}
          </div>
        </CoverImageUpload>
      </section>

      {/* Live Preview */}
      <section>
        <h3 className="text-lg font-semibold text-foreground mb-4">Preview</h3>
        <p className="text-sm text-muted-foreground mb-4">
          How your club's shows will appear on browse pages:
        </p>
        <div className="max-w-[340px]">
          <ShowCard
            id="preview"
            title={`${club.name} Spring Trial`}
            date="Mar 15 - Mar 16, 2026"
            location="City, State"
            imageUrl=""
            coverImageUrl={club.coverImage || undefined}
            accentColor={draftColor}
            organization="AKC"
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && pnpm test src/test/components/clubs/BrandingTab.test.tsx`
Expected: PASS

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/BrandingTab.tsx apps/myk9show/src/test/components/clubs/BrandingTab.test.tsx
git commit -m "feat(branding): create BrandingTab component with tests"
```

### Task 12: Wire BrandingTab into ClubDetails

**Files:**

- Modify: `apps/myk9show/src/components/clubs/ClubDetails/index.tsx`
- Test: `apps/myk9show/src/test/components/clubs/ClubDetailsBranding.test.tsx` [ADDED]

- [ ] **Step 1: Import BrandingTab**

Add import:

```typescript
import { BrandingTab } from './BrandingTab';
```

- [ ] **Step 2: Add Branding tab trigger (admin-only)**

In the `TabsList`, after the Members tab trigger, add:

```tsx
{
  state.canEditBranding && <TabsTrigger value="branding">Branding</TabsTrigger>;
}
```

- [ ] **Step 3: Add Branding tab content**

After the Members `TabsContent`, add:

```tsx
{
  state.canEditBranding && (
    <TabsContent value="branding">
      <BrandingTab
        club={selectedClub}
        onSaveAccentColor={state.handleSaveAccentColor}
        onEditPhoto={state.handleEditPhoto}
        onCoverUpload={state.handleCoverUpload}
        onCoverRemove={state.handleCoverRemove}
        isUploadingCover={state.isUploadingCover}
      />
    </TabsContent>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: [ADDED] Write admin-only tab visibility test**

Create `ClubDetailsBranding.test.tsx` to verify the Branding tab is conditionally rendered based on `canEditBranding`. Mock `useClubDetailsState` to control the `canEditBranding` value:

```typescript
describe('Branding tab visibility', () => {
  it('shows Branding tab when canEditBranding is true', () => {
    // Mock useClubDetailsState to return canEditBranding: true
    // Render ClubDetails with a valid club
    // Expect: screen.getByText('Branding') to be in document
  });

  it('hides Branding tab when canEditBranding is false', () => {
    // Mock useClubDetailsState to return canEditBranding: false
    // Render ClubDetails with a valid club
    // Expect: screen.queryByText('Branding') to not be in document
  });
});
```

- [ ] **Step 6: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/clubs/ClubDetails/index.tsx apps/myk9show/src/test/components/clubs/ClubDetailsBranding.test.tsx
git commit -m "feat(branding): wire BrandingTab into ClubDetails (admin-only)"
```

---

## Chunk 4: Final Verification

### Task 13: End-to-end typecheck, lint, and test

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS with 0 errors

- [ ] **Step 2: Run full lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: Run myk9show tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests PASS

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 5: Manual smoke test**

Start dev server (`pnpm dev:show`) and verify:

1. Browse shows page — show cards display accent color bars
2. Click a show → PublicShowView uses ShowBrandedHero with club branding
3. Navigate to a club → Branding tab appears (if admin)
4. Pick an accent color → live preview updates → Save → header updates
5. Upload cover image → visible in header and Branding tab
6. Browse shows again → cards reflect the updated branding
