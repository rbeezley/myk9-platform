# Shareable Show Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shared show links display rich previews on social media and give users a one-tap share button.

**Architecture:** Vercel Edge Functions handle crawler detection and OG image generation. The existing SPA show page gets a redesigned public layout with day-by-day schedule summary. A shared utility extracts the navigator.share pattern for reuse.

**Tech Stack:** Vercel Edge Functions, `@vercel/og` (Satori), Supabase REST API, React, Tailwind CSS, vitest

**Spec:** `docs/superpowers/specs/2026-03-13-shareable-show-pages-design.md`

---

## File Structure

```
apps/myk9show/
├── api/
│   ├── og-show.ts                          # Edge Function: crawler detection + OG HTML / SPA pass-through
│   └── og-show-image.tsx                   # Edge Function: OG image generation (@vercel/og)
├── src/
│   ├── types/
│   │   └── show-types.ts                   # Modified: add trialType, element, competitionType fields
│   ├── utils/
│   │   ├── share.ts                        # New: shareOrCopy utility
│   │   ├── share.test.ts                   # New: tests for share utility
│   │   ├── schedule-summary.ts             # New: class summarization logic
│   │   └── schedule-summary.test.ts        # New: tests for summarization
│   ├── components/shows/
│   │   └── ShareButton.tsx                 # New: share button component
│   ├── components/exhibitor/
│   │   └── LiveResults.tsx                 # Modified: use shared share utility
│   ├── hooks/queries/
│   │   └── useScheduleSummary.ts           # New: hook to fetch + summarize schedule
│   └── pages/
│       └── ShowDetailsPage.tsx             # Modified: public landing page layout
├── vercel.json                             # Modified: add /shows/:id rewrite
└── package.json                            # Modified: add @vercel/og
```

---

## Chunk 1: Foundation — Types, Share Utility, and Schedule Summarization

### Task 1: Add missing fields to ShowTrial and Class types

**Files:**

- Modify: `apps/myk9show/src/types/show-types.ts`

- [ ] **Step 1: Add `trialType` to `ShowTrial` and `element`/`competitionType` to `Class`**

In `apps/myk9show/src/types/show-types.ts`, add the fields that exist in the database but are missing from the TypeScript interfaces:

```typescript
// ShowTrial — add after line 27 (status field):
  trialType?: string | undefined;

// Class — add after line 46 (level field):
  element?: string | undefined;
  competitionType?: string | undefined;
```

- [ ] **Step 2: Run typecheck to verify no breakage**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (new optional fields don't break existing code)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/types/show-types.ts
git commit -m "feat(types): add trialType, element, competitionType to show types"
```

---

### Task 2: Create the share utility with tests (TDD)

**Files:**

- Create: `apps/myk9show/src/utils/share.ts`
- Create: `apps/myk9show/src/utils/share.test.ts`

- [ ] **Step 1: Write failing tests for `shareOrCopy`**

Create `apps/myk9show/src/utils/share.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shareOrCopy } from './share';

const shareOptions = {
  title: 'Rocky Mountain Classic — June 14–15, 2026',
  text: 'AKC Dog Show in Denver, CO · Rocky Mountain Dog Club',
  url: 'https://example.com/shows/123',
};

describe('shareOrCopy', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', {
      value: shareMock,
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy(shareOptions);

    expect(shareMock).toHaveBeenCalledWith(shareOptions);
    expect(result).toBe('shared');
  });

  it('falls back to clipboard when navigator.share is unavailable', async () => {
    // Remove navigator.share
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy(shareOptions);

    expect(writeTextMock).toHaveBeenCalledWith(shareOptions.url);
    expect(result).toBe('copied');
  });

  it('falls back to clipboard when navigator.share throws AbortError', async () => {
    const abortError = new DOMException('Share canceled', 'AbortError');
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(abortError),
      writable: true,
      configurable: true,
    });

    // AbortError means user cancelled — should resolve without fallback
    const result = await shareOrCopy(shareOptions);
    expect(result).toBe('cancelled');
  });

  it('falls back to clipboard when navigator.share throws non-abort error', async () => {
    Object.defineProperty(navigator, 'share', {
      value: vi.fn().mockRejectedValue(new Error('Share failed')),
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy(shareOptions);

    expect(writeTextMock).toHaveBeenCalledWith(shareOptions.url);
    expect(result).toBe('copied');
  });

  it('copies clipboardText instead of url when provided', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      writable: true,
      configurable: true,
    });

    const result = await shareOrCopy({
      ...shareOptions,
      clipboardText: 'Results summary text here',
    });

    expect(writeTextMock).toHaveBeenCalledWith('Results summary text here');
    expect(result).toBe('copied');
  });

  it('throws when both share and clipboard fail', async () => {
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Clipboard failed')) },
      writable: true,
      configurable: true,
    });

    await expect(shareOrCopy(shareOptions)).rejects.toThrow('Clipboard failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/utils/share.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `shareOrCopy`**

Create `apps/myk9show/src/utils/share.ts`:

```typescript
export interface ShareOptions {
  title: string;
  text: string;
  url: string;
  /** If set, copy this instead of url on clipboard fallback (e.g., LiveResults copies results text). */
  clipboardText?: string;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled';

/**
 * Share content via native share sheet, or copy to clipboard as fallback.
 * Copies `clipboardText` if provided, otherwise copies `url`.
 */
export async function shareOrCopy(options: ShareOptions): Promise<ShareResult> {
  if (navigator.share) {
    try {
      const { clipboardText: _, ...shareData } = options;
      await navigator.share(shareData);
      return 'shared';
    } catch (err) {
      // User cancelled the share sheet
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
      // Other share error — fall through to clipboard
    }
  }

  await navigator.clipboard.writeText(options.clipboardText ?? options.url);
  return 'copied';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/utils/share.test.ts`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/share.ts apps/myk9show/src/utils/share.test.ts
git commit -m "feat(share): add shareOrCopy utility with navigator.share + clipboard fallback"
```

---

### Task 3: Create schedule summarization logic with tests (TDD)

This is the most complex pure logic in the feature. The function takes raw trial/class data and produces a grouped, summarized schedule.

**Files:**

- Create: `apps/myk9show/src/utils/schedule-summary.ts`
- Create: `apps/myk9show/src/utils/schedule-summary.test.ts`

- [ ] **Step 1: Write failing tests for `summarizeSchedule`**

Create `apps/myk9show/src/utils/schedule-summary.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { summarizeSchedule, type ScheduleClassRow } from './schedule-summary';

describe('summarizeSchedule', () => {
  it('groups classes by date and discipline', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Novice',
        name: 'Novice Buried',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Open',
        name: 'Open Buried',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Container',
        level: 'Novice',
        name: 'Novice Container',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Obedience',
        element: null,
        level: 'Novice',
        name: 'Novice Obedience',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Obedience',
        element: null,
        level: 'Open',
        name: 'Open Obedience',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result).toHaveLength(2);

    // Day 1: Scent Work
    expect(result[0].date).toBe('2026-06-13');
    expect(result[0].disciplines).toHaveLength(1);
    expect(result[0].disciplines[0].name).toBe('Scent Work');
    expect(result[0].disciplines[0].elements).toEqual(['Buried', 'Container']);
    expect(result[0].disciplines[0].levels).toEqual(['Novice', 'Open']); // progression order

    // Day 2: Obedience
    expect(result[1].date).toBe('2026-06-14');
    expect(result[1].disciplines).toHaveLength(1);
    expect(result[1].disciplines[0].name).toBe('Obedience');
    expect(result[1].disciplines[0].elements).toEqual([]);
    expect(result[1].disciplines[0].levels).toEqual(['Novice', 'Open']); // progression order
  });

  it('handles multi-discipline days', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-14',
        discipline: 'Scent Work',
        element: 'Interior',
        level: 'Master',
        name: 'Master Interior',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Obedience',
        element: null,
        level: 'Utility',
        name: 'Utility Obedience',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Rally',
        element: null,
        level: 'Novice',
        name: 'Novice Rally',
      },
      {
        trialDate: '2026-06-14',
        discipline: 'Rally',
        element: null,
        level: 'Master',
        name: 'Master Rally',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result).toHaveLength(1);
    expect(result[0].disciplines).toHaveLength(3);
    expect(result[0].disciplines.map(d => d.name)).toEqual(['Obedience', 'Rally', 'Scent Work']);
  });

  it('puts classes with null discipline into "Other" group', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: null,
        element: null,
        level: null,
        name: 'Special Exhibition',
      },
      {
        trialDate: '2026-06-13',
        discipline: null,
        element: null,
        level: null,
        name: 'Junior Showmanship',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result).toHaveLength(1);
    expect(result[0].disciplines).toHaveLength(1);
    expect(result[0].disciplines[0].name).toBe('Other');
    expect(result[0].disciplines[0].classNames).toEqual([
      'Junior Showmanship',
      'Special Exhibition',
    ]);
  });

  it('returns empty array for no input', () => {
    expect(summarizeSchedule([])).toEqual([]);
  });

  it('deduplicates elements and levels', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Novice',
        name: 'A',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Buried',
        level: 'Novice',
        name: 'B',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result[0].disciplines[0].elements).toEqual(['Buried']);
    expect(result[0].disciplines[0].levels).toEqual(['Novice']);
  });

  it('sorts dates chronologically', () => {
    const rows: ScheduleClassRow[] = [
      { trialDate: '2026-06-15', discipline: 'Rally', element: null, level: 'Novice', name: 'A' },
      { trialDate: '2026-06-13', discipline: 'Obedience', element: null, level: 'Open', name: 'B' },
      {
        trialDate: '2026-06-14',
        discipline: 'Scent Work',
        element: 'Interior',
        level: 'Master',
        name: 'C',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result.map(d => d.date)).toEqual(['2026-06-13', '2026-06-14', '2026-06-15']);
  });

  it('handles single-class days', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Scent Work',
        element: 'Detective',
        level: 'Master',
        name: 'Master Detective',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result).toHaveLength(1);
    expect(result[0].disciplines[0].elements).toEqual(['Detective']);
    expect(result[0].disciplines[0].levels).toEqual(['Master']);
  });

  it('sorts levels by progression order, not alphabetically', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Utility',
        name: 'A',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Novice',
        name: 'B',
      },
      { trialDate: '2026-06-13', discipline: 'Obedience', element: null, level: 'Open', name: 'C' },
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Master',
        name: 'D',
      },
    ];

    const result = summarizeSchedule(rows);

    // Should be progression order: Novice → Open → Utility → Master
    expect(result[0].disciplines[0].levels).toEqual(['Novice', 'Open', 'Utility', 'Master']);
  });

  it('skips null elements but keeps null levels', () => {
    const rows: ScheduleClassRow[] = [
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Novice',
        name: 'Novice Obedience',
      },
      {
        trialDate: '2026-06-13',
        discipline: 'Obedience',
        element: null,
        level: 'Open',
        name: 'Open Obedience',
      },
    ];

    const result = summarizeSchedule(rows);

    expect(result[0].disciplines[0].elements).toEqual([]);
    expect(result[0].disciplines[0].levels).toEqual(['Novice', 'Open']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/utils/schedule-summary.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `summarizeSchedule`**

Create `apps/myk9show/src/utils/schedule-summary.ts`:

```typescript
/**
 * Raw row from the schedule query (trials JOIN classes).
 */
export interface ScheduleClassRow {
  trialDate: string;
  discipline: string | null;
  element: string | null;
  level: string | null;
  name: string;
}

/**
 * A single discipline's summary for one day.
 */
export interface DisciplineSummary {
  name: string;
  elements: string[]; // distinct, sorted (empty if none)
  levels: string[]; // distinct, sorted
  classNames: string[]; // only populated for "Other" group
}

/**
 * One day's schedule.
 */
export interface DaySummary {
  date: string;
  disciplines: DisciplineSummary[];
}

/**
 * Progression order for levels — matches the order shown in show premiums.
 * Levels not in this list sort alphabetically after all known levels.
 */
const LEVEL_ORDER: Record<string, number> = {
  Novice: 0,
  Advanced: 1,
  Open: 2,
  Excellent: 3,
  Utility: 4,
  Master: 5,
};

function compareLevels(a: string, b: string): number {
  const aOrder = LEVEL_ORDER[a] ?? 100;
  const bOrder = LEVEL_ORDER[b] ?? 100;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.localeCompare(b);
}

/**
 * Groups trial/class rows into a day-by-day schedule summary.
 *
 * Groups by date → discipline, collecting distinct elements and levels.
 * Classes with null discipline go into an "Other" group showing class names verbatim.
 */
export function summarizeSchedule(rows: ScheduleClassRow[]): DaySummary[] {
  if (rows.length === 0) return [];

  // Group by date, then by discipline
  const byDate = new Map<
    string,
    Map<string, { elements: Set<string>; levels: Set<string>; classNames: Set<string> }>
  >();

  for (const row of rows) {
    const dateKey = row.trialDate;
    const disciplineKey = row.discipline ?? 'Other';

    if (!byDate.has(dateKey)) {
      byDate.set(dateKey, new Map());
    }
    const dateGroup = byDate.get(dateKey)!;

    if (!dateGroup.has(disciplineKey)) {
      dateGroup.set(disciplineKey, {
        elements: new Set(),
        levels: new Set(),
        classNames: new Set(),
      });
    }
    const disc = dateGroup.get(disciplineKey)!;

    if (row.element) disc.elements.add(row.element);
    if (row.level) disc.levels.add(row.level);
    disc.classNames.add(row.name);
  }

  // Convert to sorted output
  const dates = [...byDate.keys()].sort();

  return dates.map(date => {
    const disciplineMap = byDate.get(date)!;
    const disciplineNames = [...disciplineMap.keys()].sort();

    const disciplines: DisciplineSummary[] = disciplineNames.map(name => {
      const data = disciplineMap.get(name)!;
      return {
        name,
        elements: [...data.elements].sort(),
        levels: [...data.levels].sort(compareLevels),
        classNames: name === 'Other' ? [...data.classNames].sort() : [],
      };
    });

    return { date, disciplines };
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/utils/schedule-summary.test.ts`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/utils/schedule-summary.ts apps/myk9show/src/utils/schedule-summary.test.ts
git commit -m "feat(schedule): add schedule summarization logic with day/discipline grouping"
```

---

### Task 4: Migrate LiveResults.tsx to use shared share utility

**Files:**

- Modify: `apps/myk9show/src/components/exhibitor/LiveResults.tsx`

- [ ] **Step 1: Replace inline share logic with `shareOrCopy`**

In `LiveResults.tsx`, find the `handleShareResults` callback (around line 162). The current code manually checks `navigator.share`, catches AbortError, and falls back to clipboard. Replace with:

```typescript
import { shareOrCopy } from '../../utils/share';

const handleShareResults = useCallback(async () => {
  const text = buildResultsSummary();
  try {
    const result = await shareOrCopy({
      title: entries[0]?.className || 'Results',
      text,
      url: window.location.href,
      clipboardText: text, // Preserve existing behavior: copies results text, not URL
    });
    if (result === 'copied') {
      toast.success('Results copied to clipboard');
    }
  } catch {
    toast.error('Unable to share results');
  }
  logger.debug('Share results', 'components', {});
}, [entries, buildResultsSummary]);
```

Remove the old inline `navigator.share` / `navigator.clipboard` code.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/exhibitor/LiveResults.tsx
git commit -m "refactor(share): migrate LiveResults to shared shareOrCopy utility"
```

---

## Chunk 2: Vercel Edge Functions — OG Tags and OG Image

### Task 5: Install `@vercel/og` and update vercel.json

**Files:**

- Modify: `apps/myk9show/package.json`
- Modify: `apps/myk9show/vercel.json`

- [ ] **Step 1: Install `@vercel/og`**

Run: `cd apps/myk9show && pnpm add @vercel/og`

- [ ] **Step 2: Update `vercel.json` rewrites**

In `apps/myk9show/vercel.json`, add the `/shows/:id` rewrite **before** the existing catch-all. The existing rewrite block:

```json
"rewrites": [
  { "source": "/(.*)", "destination": "/index.html" }
]
```

becomes:

```json
"rewrites": [
  { "source": "/shows/:id", "destination": "/api/og-show?id=:id" },
  { "source": "/(.*)", "destination": "/index.html" }
]
```

Also update the CSP `connect-src` to ensure the Edge Functions can reach Supabase (they run server-side so CSP doesn't apply to them, but verify the `img-src` allows the OG image URL if the page links to it).

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/package.json apps/myk9show/vercel.json pnpm-lock.yaml
git commit -m "chore: add @vercel/og dependency and show page rewrite"
```

---

### Task 6: Create the OG show Edge Function (crawler detection + OG HTML)

**Files:**

- Create: `apps/myk9show/api/og-show.ts`

- [ ] **Step 1: Create the Edge Function**

Create `apps/myk9show/api/og-show.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

const CRAWLER_USER_AGENTS = [
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot-LinkExpanding',
  'Discordbot',
  'WhatsApp',
  'Applebot',
  'Googlebot',
  'bingbot',
  'Pinterestbot',
  'TelegramBot',
  'redditbot',
  'Embedly',
  'Quora Link Preview',
  'Showyoubot',
];

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return CRAWLER_USER_AGENTS.some(bot => userAgent.includes(bot));
}

interface ShowData {
  id: string;
  name: string;
  organization: string | null;
  start_date: string;
  end_date: string;
  location: string;
  status: string;
  entry_close_date: string | null;
  accent_color: string | null;
  logo_url: string | null;
  club_name: string;
}

function getBaseUrl(): string {
  if (process.env.VITE_PUBLIC_URL) return process.env.VITE_PUBLIC_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', opts);
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function getStatusText(status: string, entryCloseDate: string | null): string {
  switch (status) {
    case 'accepting_entries': {
      if (!entryCloseDate) return 'Accepting entries';
      const date = new Date(entryCloseDate + 'T00:00:00');
      return `Entries close ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }
    case 'closed':
      return 'Entries closed';
    case 'completed':
      return 'Show completed';
    case 'in_progress':
      return 'Show in progress';
    case 'cancelled':
      return 'Show cancelled';
    case 'published':
      return 'Entry dates TBA';
    default:
      return '';
  }
}

function buildOgHtml(show: ShowData, baseUrl: string): string {
  const dateRange = formatDateRange(show.start_date, show.end_date);
  const title = `${show.name} — ${dateRange}`;
  const orgPrefix = show.organization ? `${show.organization} Dog Show in ` : 'Dog Show in ';
  const statusText = getStatusText(show.status, show.entry_close_date);
  const descParts = [`${orgPrefix}${show.location}`, show.club_name, statusText].filter(Boolean);
  const description = descParts.join(' · ');
  const imageUrl = `${baseUrl}/api/og-show-image?id=${show.id}`;
  const canonicalUrl = `${baseUrl}/shows/${show.id}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:image" content="${escapeAttr(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:type" content="event">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(imageUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeAttr(canonicalUrl)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeAttr(canonicalUrl)}">${escapeHtml(show.name)}</a>...</p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  const showId = Array.isArray(id) ? id[0] : id;

  if (!showId) {
    return res.status(400).send('Missing show ID');
  }

  const userAgent = req.headers['user-agent'] ?? null;

  // Non-crawlers get the SPA
  if (!isCrawler(userAgent)) {
    // Rewrite to index.html for SPA routing
    // Vercel handles this via the catch-all rewrite fallback
    return res.redirect(307, `/index.html`);
  }

  // Crawler path: fetch show data and return OG HTML
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).send('Server configuration error');
  }

  try {
    const query = `id,name,organization,start_date,end_date,location,status,entry_close_date,accent_color,logo_url,clubs(name,logo_url)`;
    const response = await fetch(
      `${supabaseUrl}/rest/v1/shows?id=eq.${showId}&status=neq.draft&deleted_at=is.null&select=${encodeURIComponent(query)}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(502).send('Database error');
    }

    const data = await response.json();

    if (!data || data.length === 0) {
      return res.status(404).send('Show not found');
    }

    const row = data[0];
    const show: ShowData = {
      id: row.id,
      name: row.name,
      organization: row.organization,
      start_date: row.start_date,
      end_date: row.end_date,
      location: row.location,
      status: row.status,
      entry_close_date: row.entry_close_date,
      accent_color: row.accent_color,
      logo_url: row.logo_url ?? row.clubs?.logo_url ?? null,
      club_name: row.clubs?.name ?? '',
    };

    const baseUrl = getBaseUrl();
    const html = buildOgHtml(show, baseUrl);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
    return res.status(200).send(html);
  } catch {
    // Fallback: generic OG tags
    const baseUrl = getBaseUrl();
    const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>myK9 Dog Show</title>
  <meta property="og:title" content="myK9 Dog Show">
  <meta property="og:description" content="View show details on myK9">
  <meta property="og:url" content="${baseUrl}/shows/${showId}">
  <meta property="og:type" content="website">
  <meta http-equiv="refresh" content="0;url=${baseUrl}/shows/${showId}">
</head>
<body><p>Redirecting...</p></body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
    return res.status(200).send(fallbackHtml);
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (the `api/` directory may need a separate tsconfig or inclusion — verify)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/api/og-show.ts
git commit -m "feat(og): add Edge Function for crawler detection and OG meta tag injection"
```

---

### Task 7: Create the OG image Edge Function

**Files:**

- Create: `apps/myk9show/api/og-show-image.tsx`

- [ ] **Step 1: Create the OG image function**

Create `apps/myk9show/api/og-show-image.tsx`:

```tsx
import { ImageResponse } from '@vercel/og';
import type { VercelRequest } from '@vercel/node';

export const config = {
  runtime: 'edge',
};

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

function getStatusText(status: string, entryCloseDate: string | null): string | null {
  if (status !== 'accepting_entries' || !entryCloseDate) return null;
  const date = new Date(entryCloseDate + 'T00:00:00');
  return `Entries close ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const showId = url.searchParams.get('id');

  if (!showId) {
    return new Response('Missing show ID', { status: 400 });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  try {
    // Fetch show data
    const showQuery = `id,name,organization,start_date,end_date,location,status,entry_close_date,accent_color,logo_url,clubs(name,logo_url)`;
    const showResp = await fetch(
      `${supabaseUrl}/rest/v1/shows?id=eq.${showId}&status=neq.draft&deleted_at=is.null&select=${encodeURIComponent(showQuery)}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );

    const showData = await showResp.json();
    if (!showData || showData.length === 0) {
      // Return fallback image for invalid/draft shows
      return new Response('Show not found', {
        status: 404,
        headers: { 'Cache-Control': 'public, s-maxage=3600' },
      });
    }

    const show = showData[0];
    const clubName: string = show.clubs?.name ?? '';
    const logoUrl: string | null = show.logo_url ?? show.clubs?.logo_url ?? null;
    // Accent color fallback: show setting → org default → myK9 brand teal
    const ORG_COLORS: Record<string, string> = {
      AKC: '#14b8a6',
      UKC: '#f97316',
      ASCA: '#3b82f6',
    };
    const accentColor: string =
      show.accent_color ?? (org ? ORG_COLORS[org] : undefined) ?? '#14b8a6';
    const org: string | null = show.organization;

    // Fetch discipline list
    const discQuery = `trial_type,classes(competition_type)`;
    const discResp = await fetch(
      `${supabaseUrl}/rest/v1/trials?show_id=eq.${showId}&select=${encodeURIComponent(discQuery)}`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    const trials = await discResp.json();

    const disciplines = new Set<string>();
    if (Array.isArray(trials)) {
      for (const trial of trials) {
        if (trial.trial_type) {
          disciplines.add(trial.trial_type);
        } else if (Array.isArray(trial.classes)) {
          for (const cls of trial.classes) {
            if (cls.competition_type) disciplines.add(cls.competition_type);
          }
        }
      }
    }
    const disciplineList = [...disciplines].sort().join(' · ');

    const dateRange = formatDateRange(show.start_date, show.end_date);
    const statusText = getStatusText(show.status, show.entry_close_date);
    const initials = getInitials(clubName);

    return new ImageResponse(
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px',
          background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '8px',
            background: accentColor,
          }}
        />

        {/* Paw print watermark */}
        <div
          style={{
            position: 'absolute',
            right: '-20px',
            bottom: '-20px',
            fontSize: '180px',
            opacity: 0.06,
          }}
        >
          🐾
        </div>

        {/* Top row: club logo + myK9 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingLeft: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                width={48}
                height={48}
                style={{ borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {initials}
              </div>
            )}
            <span style={{ color: '#6b7280', fontSize: '14px' }}>{clubName}</span>
          </div>
          <div
            style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600, letterSpacing: '1px' }}
          >
            myK9
          </div>
        </div>

        {/* Center: show name + details */}
        <div
          style={{
            paddingLeft: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#111827',
              lineHeight: 1.2,
            }}
          >
            {show.name}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '24px',
              color: '#4b5563',
              fontSize: '16px',
              marginTop: '8px',
            }}
          >
            <span>📅 {dateRange}</span>
            <span>📍 {show.location}</span>
          </div>
        </div>

        {/* Bottom: entry badge + org/disciplines */}
        <div
          style={{
            paddingLeft: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          {statusText ? (
            <div
              style={{
                background: '#dbeafe',
                color: '#1d4ed8',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {statusText}
            </div>
          ) : (
            <div />
          )}
          <div
            style={{
              textAlign: 'right',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            {org && (
              <div
                style={{
                  color: '#6b7280',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '2px',
                }}
              >
                {org}
              </div>
            )}
            {disciplineList && (
              <div style={{ color: '#9ca3af', fontSize: '12px' }}>{disciplineList}</div>
            )}
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=86400, max-age=86400',
        },
      }
    );
  } catch {
    // Fallback: return an error with cache to prevent hammering
    return new Response('Error generating image', {
      status: 500,
      headers: { 'Cache-Control': 'public, s-maxage=3600' },
    });
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS (may need to add `api/` to tsconfig includes — check and fix if needed)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/api/og-show-image.tsx
git commit -m "feat(og): add dynamic OG image generation with @vercel/og"
```

---

## Chunk 3: Public Show Page Redesign and Share Button

### Task 8: Create the ShareButton component

**Files:**

- Create: `apps/myk9show/src/components/shows/ShareButton.tsx`

- [ ] **Step 1: Create the ShareButton component**

Create `apps/myk9show/src/components/shows/ShareButton.tsx`:

```tsx
import { Share2 } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { shareOrCopy, type ShareOptions } from '../../utils/share';

interface ShareButtonProps {
  shareData: ShareOptions;
  className?: string;
}

export function ShareButton({ shareData, className = '' }: ShareButtonProps) {
  const handleShare = useCallback(async () => {
    try {
      const result = await shareOrCopy(shareData);
      if (result === 'copied') {
        toast.success('Link copied!');
      }
    } catch {
      toast.error('Unable to share');
    }
  }, [shareData]);

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${className}`}
      aria-label="Share this show"
    >
      <Share2 className="h-4 w-4" />
      Share
    </button>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/shows/ShareButton.tsx
git commit -m "feat(share): add ShareButton component with native share + clipboard fallback"
```

---

### Task 9: Create the useScheduleSummary hook

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useScheduleSummary.ts`

- [ ] **Step 1: Create the hook**

This hook fetches trial/class data for a show and returns the summarized schedule. It uses the Supabase client directly (no Edge Function — this is for the SPA page rendering).

Create `apps/myk9show/src/hooks/queries/useScheduleSummary.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  summarizeSchedule,
  type DaySummary,
  type ScheduleClassRow,
} from '../../utils/schedule-summary';

export function useScheduleSummary(showId: string | null) {
  return useQuery<DaySummary[]>({
    queryKey: ['shows', showId, 'schedule-summary'],
    queryFn: async () => {
      if (!showId) return [];

      const { data, error } = await supabase
        .from('trials')
        .select(
          `
          date,
          trial_type,
          classes (
            name,
            element,
            level,
            competition_type
          )
        `
        )
        .eq('show_id', showId);

      if (error) throw error;
      if (!data) return [];

      // Flatten trials → class rows
      const rows: ScheduleClassRow[] = [];
      for (const trial of data) {
        const classes =
          (trial.classes as Array<{
            name: string;
            element: string | null;
            level: string | null;
            competition_type: string | null;
          }>) ?? [];

        for (const cls of classes) {
          rows.push({
            trialDate: trial.date,
            discipline: trial.trial_type ?? cls.competition_type,
            element: cls.element,
            level: cls.level,
            name: cls.name,
          });
        }
      }

      return summarizeSchedule(rows);
    },
    enabled: !!showId,
    staleTime: 1000 * 60 * 5, // 5 min
    gcTime: 1000 * 60 * 30, // 30 min
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/myk9show && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useScheduleSummary.ts
git commit -m "feat(schedule): add useScheduleSummary hook for day-by-day class grouping"
```

---

### Task 10: Redesign ShowDetailsPage as a public landing page

This is the largest UI task. The existing `ShowDetailsPage.tsx` needs a new layout that works as a landing page. Reference the mockup at `.superpowers/brainstorm/72047-1773450861/public-show-page.html` for visual design.

**Files:**

- Modify: `apps/myk9show/src/pages/ShowDetailsPage.tsx`

**Important context for the implementer:**

- The current page uses `useFastShowDetails(id)` for show data — keep this
- The current page has a `ShowEditPanel` for secretaries — keep this (it's behind auth)
- Add the schedule summary using `useScheduleSummary(showId)`
- Add the ShareButton in the hero section
- The page must work both for authenticated users (who see edit controls) and unauthenticated visitors (who see the public landing page)

- [ ] **Step 1: Read the current ShowDetailsPage.tsx**

Read `apps/myk9show/src/pages/ShowDetailsPage.tsx` to understand all current functionality. Do not lose any existing features.

- [ ] **Step 2: Add the hero section**

Redesign the top of the page with:

- Club logo (or initials circle) + club name
- Organization badge + ShareButton (grouped, top-right area)
- Show name as large heading
- Date range + location with calendar/pin icons
- Status badge

Reference the mockup design for Tailwind classes and layout.

- [ ] **Step 3: Add the entry CTA bar**

Below the hero, add a bar showing:

- Pre-entry fee and entry close date
- "Register Now" button (links to `/shows/${id}/register`) when status is `accepting_entries`
- "Entries Closed" text when status is `closed`
- Hidden when status is `draft`

- [ ] **Step 4: Add the schedule summary section**

Use `useScheduleSummary(showId)` to fetch and display the day-by-day schedule:

- Group by date (show day name + date)
- For each discipline: name, elements (if any), levels
- Hide the section if there are no trials/classes

Format each `DaySummary` into the UI:

```
Friday, June 13
  Scent Work — Buried, Container · Novice–Master
```

Use `date-fns` or `Intl.DateTimeFormat` to format the date string into "Friday, June 13" format.

- [ ] **Step 5: Add the show details grid**

Below the schedule, show a grid with:

- Chairman, Secretary, Chief Steward
- Pre-entry fee, Day-of-show fee
- Max entries per dog, Max total entries
- Non-owner handler policy

Only show fields that have values.

- [ ] **Step 6: Add the footer**

At the bottom: "Powered by myK9 · Browse more shows" with a link to `/shows`.

- [ ] **Step 7: Run typecheck and verify locally**

Run: `cd apps/myk9show && pnpm typecheck`
Then: `cd apps/myk9show && pnpm dev` and verify the page at `http://localhost:5173/shows/<any-show-id>`

Expected: Page renders with the new layout. Schedule summary shows if the show has trials/classes.

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/pages/ShowDetailsPage.tsx
git commit -m "feat(shows): redesign show detail page as public landing page with schedule summary"
```

---

## Chunk 4: Verification and Deployment

### Task 11: Run full test suite and typecheck

- [ ] **Step 1: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: PASS (zero errors)

- [ ] **Step 2: Run myk9show tests**

Run: `cd apps/myk9show && pnpm test`
Expected: PASS (existing tests + new share and schedule-summary tests)

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 4: Run build**

Run: `pnpm build`
Expected: PASS (verifies the Edge Functions compile, the SPA builds, and @vercel/og is bundled)

- [ ] **Step 5: Fix any issues found, commit**

If any step fails, fix the issue and commit the fix.

---

### Task 12: Manual testing and deployment verification

- [ ] **Step 1: Test locally**

Run: `cd apps/myk9show && pnpm dev`

Verify:

- `/shows/:id` page renders the new layout
- ShareButton appears and works (clipboard fallback in dev)
- Schedule summary renders if the show has trials/classes
- "Register Now" button links correctly
- Page works without authentication

- [ ] **Step 2: Test OG tags after deployment**

After the branch is deployed to Vercel preview:

- Use [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) to test a show URL
- Use [Twitter Card Validator](https://cards-dev.twitter.com/validator) to verify the card preview
- Verify the OG image renders at the `/api/og-show-image?id=<show-id>` URL
- Test with a non-existent show ID to verify fallback behavior

- [ ] **Step 3: Test crawler detection**

```bash
# Simulate a Facebook crawler
curl -H "User-Agent: facebookexternalhit/1.1" https://<preview-url>/shows/<show-id>

# Should return HTML with OG meta tags, not the SPA
```

- [ ] **Step 4: Add todo for authenticated page redesign**

Add a follow-up todo to TO-DOS.md for refreshing the authenticated show detail page to match this new design.

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: address issues found during manual testing"
```
