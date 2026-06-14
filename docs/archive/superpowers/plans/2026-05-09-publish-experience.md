# Publish Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a truthful `Publish to Exhibitors` workflow where one saved Experience configuration controls the exhibitor-facing premium, landing page, confirmation email, and entry form.

**Architecture:** Add a persisted published-experience snapshot on `shows` so draft edits and live exhibitor outputs are separated. The edit panel saves draft values; a publish toggle plus `Save Changes` creates/refreshes the published snapshot and regenerates the premium PDF. Public landing, confirmation email, and entry-form rendering read from the published snapshot when available.

**Tech Stack:** TypeScript, React, Vitest, Supabase migrations, Supabase Edge Functions, React PDF.

**Implementation status (2026-05-09):** Tasks 1-6 implemented with TDD. Focused tests and `pnpm typecheck` pass. Browser smoke is blocked locally because the sandbox cannot bind the Vite dev server port and the escalated retry was rejected by the environment approval review.

---

## File Structure

- Modify: `supabase/migrations/196_show_experience_publication.sql`
  - Adds published experience columns to `shows`.
- Modify: `apps/myk9show/src/types/show-types.ts`
  - Adds typed draft/published experience fields to `Show` and `ShowInput`.
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts`
  - Maps the new columns to/from Supabase.
- Create: `apps/myk9show/src/features/experience/experienceSnapshot.ts`
  - Builds and reads the shared experience snapshot.
- Create: `apps/myk9show/src/features/experience/publishExperience.tsx`
  - Publishes all currently supported exhibitor outputs.
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts`
  - Adds `publishExperience` to form data.
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts`
  - Converts draft show data without accidentally writing publish-only columns.
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPremiumTab.tsx`
  - Adds a `Publish to Exhibitors` checkbox and removes the standalone premium publish button from the normal flow.
- Modify: `apps/myk9show/src/features/premium/PremiumContentEditor.tsx`
  - Keeps preview/download/regenerate, exposes final premium data to the parent, and stops owning the main publish button.
- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
  - On save, persists draft changes, then calls `publishExperience` if the checkbox is checked.
- Modify: `apps/myk9show/src/features/heritage/landing/useHeritageLandingData.ts`
  - Reads published experience content for public visitors.
- Modify: `supabase/functions/send-confirmation-email/index.ts`
  - Reads published experience style/content for confirmation emails.
- Modify: `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`
  - Reads published experience style/content for the official entry form.
- Tests:
  - `apps/myk9show/src/features/experience/__tests__/experienceSnapshot.test.ts`
  - `apps/myk9show/src/features/experience/__tests__/publishExperience.test.tsx`
  - `apps/myk9show/src/components/panels/edit/__tests__/ShowEditPremiumTab.test.tsx`
  - `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`
  - `apps/myk9show/src/features/heritage/landing/__tests__/useHeritageLandingData.test.ts`
  - `apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx`

## Data Model

Add these columns to `shows`:

```sql
ALTER TABLE public.shows
  ADD COLUMN IF NOT EXISTS experience_is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS experience_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS experience_published_style text,
  ADD COLUMN IF NOT EXISTS experience_published_content jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.shows
  DROP CONSTRAINT IF EXISTS shows_experience_published_style_check,
  ADD CONSTRAINT shows_experience_published_style_check
  CHECK (
    experience_published_style IS NULL OR
    experience_published_style IN (
      'monogram',
      'banner',
      'headline',
      'magazine',
      'poster',
      'gazette',
      'fieldGuide',
      'heritage'
    )
  );
```

Snapshot shape:

```typescript
export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: {
    showHours: string;
    trialInformation: string;
  };
  supplemental: {
    vetClinic: { name: string; address: string; phone: string } | null;
    accommodations: Array<{ name: string; address: string; phone: string }>;
    hospitalityNotes: string | null;
    awardsDescription: string | null;
    additionalNotes: string | null;
  };
  outputs: {
    premiumUrl: string | null;
  };
}
```

## Task 1: Migration and Types

**Files:**

- Create: `supabase/migrations/196_show_experience_publication.sql`
- Modify: `apps/myk9show/src/types/show-types.ts`
- Modify: `apps/myk9show/src/services/mappers/showMappers.ts`

- [ ] **Step 1: Add failing mapper test**

Create or extend `apps/myk9show/src/test/mappers/showMappers.test.ts`:

```typescript
it('maps published experience columns from Supabase to Show', () => {
  const show = mapDatabaseToShow({
    ...baseDbShow,
    experience_is_published: true,
    experience_published_at: '2026-05-09T14:00:00.000Z',
    experience_published_style: 'heritage',
    experience_published_content: {
      narratives: {
        showHours: 'Doors open at 7:00 AM.',
        trialInformation: 'Running order will be posted before judging.',
      },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        hospitalityNotes: 'Coffee in the morning.',
        awardsDescription: null,
        additionalNotes: null,
      },
      outputs: { premiumUrl: 'https://example.com/premium.pdf' },
    },
  } as never);

  expect(show.experienceIsPublished).toBe(true);
  expect(show.experiencePublishedStyle).toBe('heritage');
  expect(show.experiencePublishedContent?.narratives.showHours).toBe('Doors open at 7:00 AM.');
});
```

- [ ] **Step 2: Run mapper test to verify it fails**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/mappers/showMappers.test.ts -t "published experience"
```

Expected: FAIL because the fields are not mapped yet.

- [ ] **Step 3: Add migration**

Create `supabase/migrations/196_show_experience_publication.sql` with the SQL from the Data Model section.

- [ ] **Step 4: Add TypeScript fields**

In `apps/myk9show/src/types/show-types.ts`, add:

```typescript
experienceIsPublished?: boolean;
experiencePublishedAt?: string | null;
experiencePublishedStyle?: string | null;
experiencePublishedContent?: ShowExperienceSnapshot | null;
```

Define or import `ShowExperienceSnapshot` from `@/features/experience/experienceSnapshot`.

- [ ] **Step 5: Map fields**

In `mapDatabaseToShow`, add:

```typescript
experienceIsPublished:
  ((dbShow as Record<string, unknown>).experience_is_published as boolean | null) ?? false,
experiencePublishedAt:
  ((dbShow as Record<string, unknown>).experience_published_at as string | null) ?? null,
experiencePublishedStyle:
  ((dbShow as Record<string, unknown>).experience_published_style as string | null) ?? null,
experiencePublishedContent:
  (((dbShow as Record<string, unknown>).experience_published_content as ShowExperienceSnapshot | null) ??
    null),
```

- [ ] **Step 6: Run test**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/mappers/showMappers.test.ts -t "published experience"
```

Expected: PASS.

## Task 2: Experience Snapshot Module

**Files:**

- Create: `apps/myk9show/src/features/experience/experienceSnapshot.ts`
- Create: `apps/myk9show/src/features/experience/__tests__/experienceSnapshot.test.ts`

- [ ] **Step 1: Add failing tests**

```typescript
import { describe, expect, it } from 'vitest';
import { buildExperienceSnapshot, getLiveExperienceSnapshot } from '../experienceSnapshot';

describe('experienceSnapshot', () => {
  it('builds a published snapshot from generated premium data and URL', () => {
    const snapshot = buildExperienceSnapshot({
      premium: {
        style: 'heritage',
        narratives: {
          showHours: 'Doors open at 7:00 AM.',
          trialInformation: 'Trial briefing at 8:00 AM.',
        },
        supplemental: {
          vetClinic: null,
          accommodations: [],
          hospitalityNotes: 'Coffee provided.',
          awardsDescription: null,
          additionalNotes: null,
        },
      },
      premiumUrl: 'https://example.com/premium.pdf',
      publishedAt: '2026-05-09T14:00:00.000Z',
    });

    expect(snapshot.style).toBe('heritage');
    expect(snapshot.outputs.premiumUrl).toBe('https://example.com/premium.pdf');
    expect(snapshot.narratives.showHours).toBe('Doors open at 7:00 AM.');
  });

  it('returns published snapshot only when the show is published', () => {
    const snapshot = {
      style: 'heritage' as const,
      generatedAt: '2026-05-09T14:00:00.000Z',
      narratives: { showHours: 'Hours', trialInformation: 'Info' },
      supplemental: {
        vetClinic: null,
        accommodations: [],
        hospitalityNotes: null,
        awardsDescription: null,
        additionalNotes: null,
      },
      outputs: { premiumUrl: null },
    };

    expect(
      getLiveExperienceSnapshot({
        experienceIsPublished: true,
        experiencePublishedContent: snapshot,
      })
    ).toBe(snapshot);

    expect(
      getLiveExperienceSnapshot({
        experienceIsPublished: false,
        experiencePublishedContent: snapshot,
      })
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/experience/__tests__/experienceSnapshot.test.ts
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement module**

```typescript
import type { ShowStyle } from '@/features/registries';
import type { GeneratedPremium, PremiumSupplemental } from '@/types/premium-types';

export interface ShowExperienceSnapshot {
  style: ShowStyle;
  generatedAt: string;
  narratives: GeneratedPremium['narratives'];
  supplemental: PremiumSupplemental;
  outputs: {
    premiumUrl: string | null;
  };
}

export function buildExperienceSnapshot({
  premium,
  premiumUrl,
  publishedAt,
}: {
  premium: Pick<GeneratedPremium, 'style' | 'narratives' | 'supplemental'>;
  premiumUrl: string | null;
  publishedAt: string;
}): ShowExperienceSnapshot {
  return {
    style: premium.style,
    generatedAt: publishedAt,
    narratives: premium.narratives,
    supplemental: premium.supplemental,
    outputs: { premiumUrl },
  };
}

export function getLiveExperienceSnapshot(show: {
  experienceIsPublished?: boolean;
  experiencePublishedContent?: ShowExperienceSnapshot | null;
}): ShowExperienceSnapshot | null {
  if (!show.experienceIsPublished) return null;
  return show.experiencePublishedContent ?? null;
}
```

- [ ] **Step 4: Run test**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/experience/__tests__/experienceSnapshot.test.ts
```

Expected: PASS.

## Task 3: Publish Experience Service

**Files:**

- Create: `apps/myk9show/src/features/experience/publishExperience.tsx`
- Create: `apps/myk9show/src/features/experience/__tests__/publishExperience.test.tsx`
- Modify: `apps/myk9show/src/features/premium/publishPremium.tsx`

- [ ] **Step 1: Add failing test**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { publishExperience } from '../publishExperience';

vi.mock('@/features/premium/publishPremium', () => ({
  publishPremium: vi.fn(async () => ({
    url: 'https://example.com/show.pdf',
    publishedAt: '2026-05-09T14:00:00.000Z',
  })),
}));

const update = vi.fn(() => ({
  eq: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ update })),
  },
}));

describe('publishExperience', () => {
  it('publishes premium and writes the published experience snapshot', async () => {
    await publishExperience({
      showId: 'show-1',
      premium: {
        org: 'AKC',
        style: 'heritage',
        templateId: null,
        show: {
          name: 'Bluegrass Classic',
          startDate: '2026-05-01',
          endDate: '2026-05-02',
          venue: 'Louisville',
          entryOpenDate: null,
          entryCloseDate: null,
          preEntryFee: 25,
          dayOfFee: 30,
          acceptChecks: false,
          acceptCash: false,
        },
        club: { name: 'Bluegrass KC', logoUrl: null },
        secretary: { name: null, email: null, phone: null, mailingAddress: null },
        officials: { chairman: null, steward: null },
        trials: [],
        supplemental: {
          vetClinic: null,
          accommodations: [],
          hospitalityNotes: 'Coffee provided.',
          awardsDescription: null,
          additionalNotes: null,
        },
        narratives: {
          showHours: 'Doors open at 7:00 AM.',
          trialInformation: 'Trial briefing at 8:00 AM.',
        },
      },
      inkSaver: false,
    });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        experience_is_published: true,
        experience_published_at: '2026-05-09T14:00:00.000Z',
        experience_published_style: 'heritage',
        experience_published_content: expect.objectContaining({
          style: 'heritage',
          outputs: { premiumUrl: 'https://example.com/show.pdf' },
        }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/experience/__tests__/publishExperience.test.tsx
```

Expected: FAIL because `publishExperience` does not exist.

- [ ] **Step 3: Implement service**

```typescript
import { publishPremium } from '@/features/premium/publishPremium';
import { supabase } from '@/services/database/supabaseClient';
import type { GeneratedPremium } from '@/types/premium-types';
import { buildExperienceSnapshot } from './experienceSnapshot';

export async function publishExperience({
  showId,
  premium,
  inkSaver,
}: {
  showId: string;
  premium: GeneratedPremium;
  inkSaver: boolean;
}): Promise<{ publishedAt: string; premiumUrl: string }> {
  const premiumResult = await publishPremium(showId, premium, { inkSaver });
  const snapshot = buildExperienceSnapshot({
    premium,
    premiumUrl: premiumResult.url,
    publishedAt: premiumResult.publishedAt,
  });

  const { error } = await supabase
    .from('shows')
    .update({
      experience_is_published: true,
      experience_published_at: premiumResult.publishedAt,
      experience_published_style: premium.style,
      experience_published_content: snapshot,
    } as unknown as Record<string, never>)
    .eq('id', showId);

  if (error) throw error;

  return { publishedAt: premiumResult.publishedAt, premiumUrl: premiumResult.url };
}
```

- [ ] **Step 4: Run test**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/experience/__tests__/publishExperience.test.tsx
```

Expected: PASS.

## Task 4: Experience Tab Publish Checkbox

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.types.ts`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPanel.helpers.ts`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditPremiumTab.tsx`
- Modify: `apps/myk9show/src/features/premium/PremiumContentEditor.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/__tests__/ShowEditPremiumTab.test.tsx`

- [ ] **Step 1: Add failing test**

In `ShowEditPremiumTab.test.tsx`:

```typescript
it('renders a Publish to Exhibitors checkbox for the full experience', () => {
  render(
    <ShowEditPremiumTab
      data={{ ...baseData, publishExperience: false }}
      clubId="c1"
      showOrg="AKC"
      isActive
      handleSelectChange={vi.fn(() => vi.fn())}
      handleCheckboxChange={vi.fn(() => vi.fn())}
    />
  );

  expect(screen.getByRole('checkbox', { name: /publish to exhibitors/i })).toBeInTheDocument();
  expect(screen.getByText(/premium list, landing page, entry form, and confirmation email/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/panels/edit/__tests__/ShowEditPremiumTab.test.tsx -t "Publish to Exhibitors"
```

Expected: FAIL because the checkbox is not rendered.

- [ ] **Step 3: Add form field**

In `ShowEditPanel.types.ts`:

```typescript
publishExperience?: boolean;
```

In `showToFormData`:

```typescript
publishExperience: show.experienceIsPublished ?? false,
```

In `formDataToShow`, do not include `publishExperience`; publishing is a side effect owned by `ShowDetailsPage`.

- [ ] **Step 4: Render checkbox**

Add `handleCheckboxChange` prop to `ShowEditPremiumTab` and render:

```tsx
<label className="flex items-start gap-3 rounded-md border p-3 cursor-pointer">
  <Checkbox
    checked={Boolean(data.publishExperience)}
    onCheckedChange={checked => handleCheckboxChange('publishExperience')(Boolean(checked))}
  />
  <span>
    <span className="block text-sm font-medium">Publish to Exhibitors</span>
    <span className="block text-xs text-muted-foreground">
      When you save, publish the premium list, landing page, entry form, and confirmation email
      from this Experience configuration.
    </span>
  </span>
</label>
```

- [ ] **Step 5: Pass checkbox handler**

In `ShowEditForm.tsx`, pass:

```tsx
handleCheckboxChange={handleCheckboxChange}
```

- [ ] **Step 6: Run test**

Run:

```bash
cd apps/myk9show && npx vitest run src/components/panels/edit/__tests__/ShowEditPremiumTab.test.tsx
```

Expected: PASS.

## Task 5: Save Flow Publishes Experience

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`
- Test: `apps/myk9show/src/test/pages/ShowDetailsPage.test.tsx`

- [ ] **Step 1: Add failing test**

Mock `publishExperience` and make `ShowEditPanel` call `onSave` with `publishExperience: true` and a generated premium payload.

```typescript
const publishExperienceMock = vi.fn();

vi.mock('@/features/experience/publishExperience', () => ({
  publishExperience: (args: unknown) => publishExperienceMock(args),
}));

vi.mock('@/components/panels/edit/ShowEditPanel', () => ({
  ShowEditPanel: ({ onSave }: { onSave: (data: Record<string, unknown>) => Promise<void> }) => (
    <button
      onClick={() =>
        onSave({
          name: 'Bluegrass Classic',
          status: 'draft',
          organization: 'AKC',
          clubId: 'club-1',
          startDate: '2026-03-22',
          endDate: '2026-03-23',
          assignedJudges: [],
          style: 'heritage',
          publishExperience: true,
          generatedPremium: makeGeneratedPremium('heritage'),
          inkSaver: false,
        })
      }
    >
      save mocked edit panel
    </button>
  ),
}));
```

Assert:

```typescript
await user.click(screen.getByRole('button', { name: /save mocked edit panel/i }));
expect(publishExperienceMock).toHaveBeenCalledWith(
  expect.objectContaining({
    showId: 'show-1',
    inkSaver: false,
  })
);
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "publishes experience"
```

Expected: FAIL because save does not call `publishExperience`.

- [ ] **Step 3: Implement save behavior**

In `ShowDetailsPage`, import:

```typescript
import { publishExperience } from '@/features/experience/publishExperience';
```

After `updateShowMutation.mutateAsync` and `persistShowJudgeAssignments`, add:

```typescript
if (showData.publishExperience && showData.generatedPremium) {
  await publishExperience({
    showId,
    premium: showData.generatedPremium,
    inkSaver: Boolean(showData.inkSaver),
  });
}
```

Keep the existing query invalidation after publishing so cards and public links refresh.

- [ ] **Step 4: Run test**

Run:

```bash
cd apps/myk9show && npx vitest run src/test/pages/ShowDetailsPage.test.tsx -t "publishes experience"
```

Expected: PASS.

## Task 6: Public Output Consumers Read Published Snapshot

**Files:**

- Modify: `apps/myk9show/src/features/heritage/landing/useHeritageLandingData.ts`
- Modify: `supabase/functions/send-confirmation-email/index.ts`
- Modify: `apps/myk9show/src/components/reports/AKCScentWorkEntryForm.tsx`
- Tests:
  - `apps/myk9show/src/features/heritage/landing/__tests__/useHeritageLandingData.test.ts`
  - `apps/myk9show/src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx`

- [ ] **Step 1: Landing page test**

Add a test that passes a show with `experienceIsPublished: true` and a snapshot with `hospitalityNotes`.

Expected: `useHeritageLandingData` returns `hospitalityNotes` from the snapshot.

- [ ] **Step 2: Entry form test**

Add a test that passes a show with a published snapshot and expects the form to render the published style marker or shared note once entry-form style support is added.

Initial supported assertion:

```typescript
expect(screen.getByText(/Official Entry Form/i)).toBeInTheDocument();
```

Then add a visible published content assertion when the component accepts `experienceSnapshot`.

- [ ] **Step 3: Confirmation email test**

Extract the Edge Function HTML builder into a testable helper or add a local Deno-compatible unit test. Assert that published `hospitalityNotes` appears in the `On the Day` section.

- [ ] **Step 4: Implement consumers**

Landing:

```typescript
const liveExperience = getLiveExperienceSnapshot(show);
const supplemental = liveExperience?.supplemental;

hospitalityNotes: supplemental?.hospitalityNotes ?? null,
awardsDescription: supplemental?.awardsDescription ?? null,
accommodations: supplemental?.accommodations ?? [],
```

Entry form:

```typescript
const liveExperience = getLiveExperienceSnapshot(showData.show);
```

Email Edge Function:

```typescript
const experience = show.experience_is_published
  ? show.experience_published_content
  : null;
```

Use the snapshot only for shared content; keep armbands, run rows, dog data, and payments live from entry data.

- [ ] **Step 5: Run consumer tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/heritage/landing/__tests__/useHeritageLandingData.test.ts src/components/reports/__tests__/AKCScentWorkEntryForm.test.tsx
```

Expected: PASS.

## Task 7: Verification

- [ ] **Step 1: Focused tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/experience/__tests__/experienceSnapshot.test.ts src/features/experience/__tests__/publishExperience.test.tsx src/components/panels/edit/__tests__/ShowEditPremiumTab.test.tsx src/test/pages/ShowDetailsPage.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Browser smoke**

Run:

```bash
cd apps/myk9show
node -e "import('@playwright/test').then(async ({ chromium }) => { const browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); }); await page.goto('http://localhost:5173/shows/1c9e1794-2513-4ace-96b6-563c2d2729cb', { waitUntil: 'networkidle', timeout: 30000 }); const body = await page.locator('body').innerText({ timeout: 5000 }); console.log(JSON.stringify({ hasBody: body.length > 0, errors }, null, 2)); await browser.close(); })"
```

Expected: `{ "hasBody": true, "errors": [] }`.

If Chromium hits macOS sandbox permissions, rerun with elevated command permissions.

## Scope Notes

- This plan makes the publish workflow truthful for all four touchpoints by giving them one shared published snapshot.
- The first implementation should not claim seven new non-Heritage visual renderers exist. For styles that do not yet have landing/email/entry-form renderers, consumers should read the same published content and use the current default layout until the style-specific renderer exists.
- Do not run `supabase db push` without explicit confirmation because it mutates the linked project.
