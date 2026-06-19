# Result Reveal + Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dog-first qualifying-result reveal in My Entries with a shareable PNG card and no new results page.

**Architecture:** Add a focused `features/result-card` slice with a pure model builder, seen-state helper, React reveal components, Canvas renderer, and share helper extension. My Entries owns the user experience; notifications deep-link into My Entries with `?resultEntryId=<entryId>`.

**Tech Stack:** TypeScript, React, Vitest, Testing Library, shadcn/ui/Base UI primitives already in the app, Canvas 2D, `canvas-confetti`, existing `shareOrCopy`.

## Global Constraints

- Work in a feature worktree/branch before editing app code.
- TypeScript only.
- No migrations.
- No new top-level page or nav item.
- Do not read raw scored columns directly to build the card; consume already-gated My Entries result data.
- Qualifying results only get the reveal prompt and share action.
- Non-qualifying, absent, excused, and withdrawn results stay calm in the existing row UI.
- Respect `prefers-reduced-motion`.
- Keep files under 500 lines.
- Use `apps/myk9show/src/test/utils/testUtils.tsx` instead of raw `render` for page/component tests that need providers.
- Run focused tests after each task; final verification runs typecheck and lint.

---

## File Structure

- Create `apps/myk9show/src/features/result-card/resultCardModel.ts`: pure model builder and result-display helpers.
- Create `apps/myk9show/src/features/result-card/resultCardModel.test.ts`: gating and formatting tests.
- Create `apps/myk9show/src/features/result-card/resultRevealSeen.ts`: localStorage read/write helpers.
- Create `apps/myk9show/src/features/result-card/resultRevealSeen.test.ts`: storage-key behavior.
- Create `apps/myk9show/src/features/result-card/renderResultCardImage.ts`: Canvas 2D PNG renderer.
- Create `apps/myk9show/src/features/result-card/renderResultCardImage.test.ts`: draw-call and fallback tests.
- Create `apps/myk9show/src/features/result-card/ResultCard.tsx`: dog-first visual card used inside the reveal.
- Create `apps/myk9show/src/features/result-card/ResultRevealDialog.tsx`: reveal modal, confetti, share flow.
- Create `apps/myk9show/src/features/result-card/ResultRevealDialog.test.tsx`: motion and share behavior.
- Create `apps/myk9show/src/features/result-card/index.ts`: public exports.
- Modify `apps/myk9show/src/utils/share.ts`: add `shareFile`.
- Modify `apps/myk9show/src/utils/share.test.ts`: add file-share branch tests.
- Modify `apps/myk9show/src/pages/MyEntriesPage/modules/my-entries-types.ts`: add optional dog image and result release marker fields.
- Modify `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts`: map dog image and release marker when available.
- Modify `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`: remove current duplicate declarations, render result prompt button, and call a new reveal handler.
- Modify `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx`: prompt visibility tests.
- Modify `apps/myk9show/src/pages/MyEntriesPage/index.tsx`: own reveal dialog state and query-param opening.
- Modify `apps/myk9show/src/test/pages/MyEntriesPage.test.tsx`: query-param reveal integration if existing mocks make it practical.
- Modify `apps/myk9show/src/hooks/useNotificationMonitor.ts`: retarget own-entry results to `/exhibitor/entries?resultEntryId=<entryId>`.
- Modify `apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts`: assertion-first URL test.

---

### Task 1: Preflight Compile Fix For MyEntryCard

**Files:**
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`
- Test: app typecheck preflight

**Interfaces:**
- Consumes: existing `MyEntryCard` props.
- Produces: compiling `MyEntryCard.tsx` so later result-card work can be verified.

- [ ] **Step 1: Confirm the current failure**

Run:

```bash
pnpm --filter @myk9/show typecheck
```

Expected before this task: FAIL with duplicate `ListOrdered` and `hasRunOrder` declarations in `MyEntryCard.tsx`.

- [ ] **Step 2: Remove the duplicate `ListOrdered` import**

In `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`, keep one `ListOrdered` entry in the `lucide-react` import block:

```ts
import {
  Calendar,
  CalendarDays,
  ListOrdered,
  MapPin,
  Eye,
  Edit,
  Download,
  User,
  CreditCard,
  MessageSquare,
} from 'lucide-react';
```

- [ ] **Step 3: Collapse duplicate run-order state**

Keep the richer block and delete the later duplicate `const hasRunOrder = entry.classes.some(cls => cls.runOrder !== undefined);`:

```ts
const hasRunOrder = entry.classes.some(cls => cls.runOrder != null);
const canViewRunOrder =
  !isPastShow &&
  hasRunOrder &&
  (entry.entryStatus === EntryStatus.ACCEPTED ||
    entry.entryStatus === EntryStatus.MOVE_UP_REQUESTED);
```

- [ ] **Step 4: Verify the preflight fix**

Run:

```bash
pnpm --filter @myk9/show typecheck
```

Expected: no duplicate declaration errors. If unrelated errors remain, record them before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx
git commit -m "fix(exhibitor): restore my entries typecheck"
```

---

### Task 2: Result Card Model

**Files:**
- Create: `apps/myk9show/src/features/result-card/resultCardModel.ts`
- Create: `apps/myk9show/src/features/result-card/resultCardModel.test.ts`
- Create: `apps/myk9show/src/features/result-card/index.ts`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/my-entries-types.ts`

**Interfaces:**
- Consumes: `MyEntry`, `EntryClass`, and explicit visibility flags.
- Produces: `buildResultCardModel(input: BuildResultCardModelInput): ResultCardModel | null`, `isQualifyingResult(resultStatus: string | undefined): boolean`.

- [ ] **Step 1: Extend My Entries types**

Add optional fields to `EntryClass` in `my-entries-types.ts`:

```ts
/** Class result release marker; changes when secretary releases or re-releases results. */
resultsReleasedAt?: string | undefined;
/** Optional dog photo URL for result-card rendering. */
dogImageUrl?: string | undefined;
```

- [ ] **Step 2: Write the failing model tests**

Create `resultCardModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import { buildResultCardModel, isQualifyingResult } from './resultCardModel';

function makeEntry(overrides: Partial<MyEntry> = {}): MyEntry {
  return {
    id: 'entry-1',
    registrationId: 'reg-1',
    showId: 'show-1',
    showName: 'Rocky Mountain Classic',
    showDate: new Date('2026-09-14T00:00:00'),
    location: { venue: 'Fairgrounds', city: 'Denver', state: 'CO' },
    dogName: 'Ditto',
    dogId: 'dog-1',
    armband: '27',
    classes: [],
    totalFee: 35,
    entryStatus: EntryStatus.ACCEPTED,
    paymentStatus: PaymentStatus.PAID_ONLINE,
    submittedAt: new Date('2026-08-01T00:00:00'),
    lastUpdated: new Date('2026-09-14T16:00:00'),
    ...overrides,
  };
}

function makeClass(overrides: Partial<EntryClass> = {}): EntryClass {
  return {
    id: 'entry-1',
    name: 'Container Novice A',
    number: '101',
    fee: 35,
    status: 'entered',
    isScored: true,
    resultStatus: 'qualified',
    searchTimeSeconds: 42.18,
    totalFaults: 0,
    finalPlacement: 1,
    resultsReleasedAt: '2026-09-14T20:00:00.000Z',
    dogImageUrl: 'https://example.test/ditto.jpg',
    ...overrides,
  };
}

describe('isQualifyingResult', () => {
  it('returns true only for qualified', () => {
    expect(isQualifyingResult('qualified')).toBe(true);
    expect(isQualifyingResult('nq')).toBe(false);
    expect(isQualifyingResult('absent')).toBe(false);
    expect(isQualifyingResult(undefined)).toBe(false);
  });
});

describe('buildResultCardModel', () => {
  it('builds a dog-first qualifying card from visible fields', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass(),
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toMatchObject({
      entryId: 'entry-1',
      dogName: 'Ditto',
      showName: 'Rocky Mountain Classic',
      className: 'Container Novice A',
      resultLabel: 'Q',
      placement: 1,
      placementLabel: '1st',
      timeLabel: '42.18s',
      faultsLabel: '0 faults',
      photoUrl: 'https://example.test/ditto.jpg',
      shareEnabled: true,
      releaseKey: 'entry-1:2026-09-14T20:00:00.000Z:qualified:1',
    });
  });

  it('returns null before release', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass({ resultsReleasedAt: undefined }),
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toBeNull();
  });

  it('returns null when qualification is withheld', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass(),
      visibility: {
        showQualification: false,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toBeNull();
  });

  it('returns null for non-qualifying results', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass({ resultStatus: 'nq', finalPlacement: undefined }),
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });

    expect(model).toBeNull();
  });

  it('omits withheld optional rows', () => {
    const model = buildResultCardModel({
      entry: makeEntry(),
      classEntry: makeClass(),
      visibility: {
        showQualification: true,
        showPlacement: false,
        showTime: false,
        showFaults: false,
      },
    });

    expect(model).toMatchObject({
      resultLabel: 'Q',
      placement: undefined,
      placementLabel: undefined,
      timeLabel: undefined,
      faultsLabel: undefined,
    });
  });
});
```

- [ ] **Step 3: Run the model tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/resultCardModel.test.ts
```

Expected: FAIL because `resultCardModel.ts` does not exist.

- [ ] **Step 4: Implement the model**

Create `resultCardModel.ts`:

```ts
import type { EntryClass, MyEntry } from '@/pages/MyEntriesPage/modules';

export interface ResultCardVisibility {
  showQualification: boolean;
  showPlacement: boolean;
  showTime: boolean;
  showFaults: boolean;
}

export interface BuildResultCardModelInput {
  entry: MyEntry;
  classEntry: EntryClass;
  visibility: ResultCardVisibility;
}

export interface ResultCardModel {
  entryId: string;
  releaseKey: string;
  dogName: string;
  showName: string;
  showDateLabel: string;
  className: string;
  classNumber?: string;
  armband?: string;
  resultLabel: 'Q';
  placement?: number;
  placementLabel?: string;
  timeLabel?: string;
  faultsLabel?: string;
  photoUrl?: string;
  shareTitle: string;
  shareText: string;
  shareEnabled: true;
}

export function isQualifyingResult(resultStatus: string | undefined): boolean {
  return resultStatus === 'qualified';
}

export function buildResultCardModel({
  entry,
  classEntry,
  visibility,
}: BuildResultCardModelInput): ResultCardModel | null {
  if (!classEntry.resultsReleasedAt) return null;
  if (!visibility.showQualification) return null;
  if (!isQualifyingResult(classEntry.resultStatus)) return null;

  const placement =
    visibility.showPlacement && classEntry.finalPlacement != null && classEntry.finalPlacement >= 1
      ? classEntry.finalPlacement
      : undefined;
  const placementLabel = placement != null ? formatOrdinal(placement) : undefined;
  const timeLabel =
    visibility.showTime && classEntry.searchTimeSeconds != null
      ? `${classEntry.searchTimeSeconds.toFixed(2)}s`
      : undefined;
  const faultsLabel =
    visibility.showFaults && classEntry.totalFaults != null
      ? `${classEntry.totalFaults} ${classEntry.totalFaults === 1 ? 'fault' : 'faults'}`
      : undefined;
  const classNumber = classEntry.number || undefined;
  const releaseKey = [
    classEntry.id,
    classEntry.resultsReleasedAt,
    classEntry.resultStatus,
    placement ?? 'no-placement',
  ].join(':');

  return {
    entryId: classEntry.id,
    releaseKey,
    dogName: entry.dogName,
    showName: entry.showName,
    showDateLabel: entry.showDate.toLocaleDateString(),
    className: classEntry.name,
    ...(classNumber ? { classNumber } : {}),
    ...(entry.armband ? { armband: entry.armband } : {}),
    resultLabel: 'Q',
    ...(placement != null ? { placement } : {}),
    ...(placementLabel ? { placementLabel } : {}),
    ...(timeLabel ? { timeLabel } : {}),
    ...(faultsLabel ? { faultsLabel } : {}),
    ...(classEntry.dogImageUrl ? { photoUrl: classEntry.dogImageUrl } : {}),
    shareTitle: `${entry.dogName} qualified at ${entry.showName}`,
    shareText: `${entry.dogName} earned a Q in ${classEntry.name} at ${entry.showName}.`,
    shareEnabled: true,
  };
}

function formatOrdinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
```

Create `index.ts`:

```ts
export * from './resultCardModel';
```

- [ ] **Step 5: Run the model tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/resultCardModel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/result-card apps/myk9show/src/pages/MyEntriesPage/modules/my-entries-types.ts
git commit -m "feat(results): add result card model"
```

---

### Task 3: Seen State And File Share Helper

**Files:**
- Create: `apps/myk9show/src/features/result-card/resultRevealSeen.ts`
- Create: `apps/myk9show/src/features/result-card/resultRevealSeen.test.ts`
- Modify: `apps/myk9show/src/features/result-card/index.ts`
- Modify: `apps/myk9show/src/utils/share.ts`
- Modify: `apps/myk9show/src/utils/share.test.ts`

**Interfaces:**
- Consumes: `ResultCardModel.releaseKey`.
- Produces: `hasSeenResultReveal(releaseKey: string): boolean`, `markResultRevealSeen(releaseKey: string): void`, `shareFile(blob, options): Promise<ShareResult>`.

- [ ] **Step 1: Write failing seen-state tests**

Create `resultRevealSeen.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { hasSeenResultReveal, markResultRevealSeen } from './resultRevealSeen';

describe('result reveal seen state', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('tracks seen state by release key', () => {
    expect(hasSeenResultReveal('entry-1:release-1')).toBe(false);
    markResultRevealSeen('entry-1:release-1');
    expect(hasSeenResultReveal('entry-1:release-1')).toBe(true);
    expect(hasSeenResultReveal('entry-1:release-2')).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing file-share tests**

Append to `share.test.ts`:

```ts
import { shareFile } from './share';

describe('shareFile', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses native file share when supported', async () => {
    const fileShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => true),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: fileShare,
      configurable: true,
    });

    const result = await shareFile(new Blob(['png'], { type: 'image/png' }), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });

    expect(fileShare).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ditto qualified',
        text: 'Ditto earned a Q.',
        files: [expect.any(File)],
      })
    );
    expect(result).toBe('shared');
  });

  it('downloads and copies text when file share is unavailable', async () => {
    Object.defineProperty(navigator, 'canShare', {
      value: vi.fn(() => false),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: undefined,
      configurable: true,
    });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
    });
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click,
    } as unknown as HTMLAnchorElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:result');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const result = await shareFile(new Blob(['png'], { type: 'image/png' }), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });

    expect(click).toHaveBeenCalled();
    expect(writeTextMock).toHaveBeenCalledWith('Ditto earned a Q.');
    expect(result).toBe('copied');
  });
});
```

- [ ] **Step 3: Run tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/resultRevealSeen.test.ts src/utils/share.test.ts
```

Expected: FAIL because helpers do not exist.

- [ ] **Step 4: Implement seen-state helper**

Create `resultRevealSeen.ts`:

```ts
const PREFIX = 'myk9:result-reveal-seen:';

export function hasSeenResultReveal(releaseKey: string): boolean {
  return localStorage.getItem(`${PREFIX}${releaseKey}`) === '1';
}

export function markResultRevealSeen(releaseKey: string): void {
  localStorage.setItem(`${PREFIX}${releaseKey}`, '1');
}
```

Update `features/result-card/index.ts`:

```ts
export * from './resultCardModel';
export * from './resultRevealSeen';
```

- [ ] **Step 5: Implement `shareFile`**

Add to `share.ts`:

```ts
export interface ShareFileOptions {
  title: string;
  text: string;
  fileName: string;
}

export async function shareFile(blob: Blob, options: ShareFileOptions): Promise<ShareResult> {
  const file = new File([blob], options.fileName, { type: blob.type || 'image/png' });
  const data = { title: options.title, text: options.text, files: [file] };

  if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = options.fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }

  await navigator.clipboard.writeText(options.text);
  return 'copied';
}
```

- [ ] **Step 6: Run tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/resultRevealSeen.test.ts src/utils/share.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/features/result-card apps/myk9show/src/utils/share.ts apps/myk9show/src/utils/share.test.ts
git commit -m "feat(results): add reveal seen state and file share"
```

---

### Task 4: Canvas Result Card Renderer

**Files:**
- Create: `apps/myk9show/src/features/result-card/renderResultCardImage.ts`
- Create: `apps/myk9show/src/features/result-card/renderResultCardImage.test.ts`
- Modify: `apps/myk9show/src/features/result-card/index.ts`

**Interfaces:**
- Consumes: `ResultCardModel`.
- Produces: `renderResultCardImage(model: ResultCardModel): Promise<Blob>`.

- [ ] **Step 1: Write failing renderer tests**

Create `renderResultCardImage.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { ResultCardModel } from './resultCardModel';
import { renderResultCardImage } from './renderResultCardImage';

function makeModel(overrides: Partial<ResultCardModel> = {}): ResultCardModel {
  return {
    entryId: 'entry-1',
    releaseKey: 'entry-1:release',
    dogName: 'Ditto',
    showName: 'Rocky Mountain Classic',
    showDateLabel: '9/14/2026',
    className: 'Container Novice A',
    classNumber: '101',
    armband: '27',
    resultLabel: 'Q',
    placement: 1,
    placementLabel: '1st',
    timeLabel: '42.18s',
    faultsLabel: '0 faults',
    photoUrl: '/placeholder-dog.png',
    shareTitle: 'Ditto qualified',
    shareText: 'Ditto earned a Q.',
    shareEnabled: true,
    ...overrides,
  };
}

describe('renderResultCardImage', () => {
  it('draws the dog-first result facts', async () => {
    const fillText = vi.fn();
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage,
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        set fillStyle(value: string) {},
        set font(value: string) {},
        set textAlign(value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderResultCardImage(makeModel());

    expect(fillText).toHaveBeenCalledWith('Ditto', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('Q', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('1st', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('Rocky Mountain Classic', expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith('myK9Show', expect.any(Number), expect.any(Number));
  });

  it('omits placement text when placement is hidden', async () => {
    const fillText = vi.fn();
    const canvas = {
      getContext: vi.fn(() => ({
        fillRect: vi.fn(),
        fillText,
        drawImage: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        clip: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
        set fillStyle(value: string) {},
        set font(value: string) {},
        set textAlign(value: CanvasTextAlign) {},
      })),
      toBlob: vi.fn((cb: BlobCallback) => cb(new Blob(['png'], { type: 'image/png' }))),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);

    await renderResultCardImage(makeModel({ placement: undefined, placementLabel: undefined }));

    expect(fillText).not.toHaveBeenCalledWith('1st', expect.any(Number), expect.any(Number));
  });
});
```

- [ ] **Step 2: Run renderer tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/renderResultCardImage.test.ts
```

Expected: FAIL because `renderResultCardImage.ts` does not exist.

- [ ] **Step 3: Implement renderer**

Create `renderResultCardImage.ts`:

```ts
import type { ResultCardModel } from './resultCardModel';

const WIDTH = 1080;
const HEIGHT = 1350;

export async function renderResultCardImage(model: ResultCardModel): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create result card image');

  ctx.fillStyle = '#fffaf3';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = '#1f2933';
  ctx.font = '700 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(model.dogName, WIDTH / 2, 150);

  ctx.fillStyle = '#1d4ed8';
  ctx.font = '800 144px system-ui, sans-serif';
  ctx.fillText(model.resultLabel, WIDTH / 2, 360);

  if (model.placementLabel) {
    ctx.fillStyle = '#1f2933';
    ctx.font = '700 64px system-ui, sans-serif';
    ctx.fillText(model.placementLabel, WIDTH / 2, 455);
  }

  ctx.fillStyle = '#334155';
  ctx.font = '600 48px system-ui, sans-serif';
  ctx.fillText(model.className, WIDTH / 2, 610);
  ctx.font = '500 42px system-ui, sans-serif';
  ctx.fillText(model.showName, WIDTH / 2, 685);

  const details = [model.timeLabel, model.faultsLabel, model.armband ? `Armband ${model.armband}` : undefined]
    .filter((value): value is string => Boolean(value));
  ctx.font = '500 38px system-ui, sans-serif';
  details.forEach((detail, index) => {
    ctx.fillText(detail, WIDTH / 2, 780 + index * 58);
  });

  ctx.fillStyle = '#6b6358';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText('myK9Show', WIDTH / 2, HEIGHT - 90);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error('Unable to create result card image'));
    }, 'image/png');
  });
}
```

- [ ] **Step 4: Export renderer**

Update `features/result-card/index.ts`:

```ts
export * from './resultCardModel';
export * from './resultRevealSeen';
export * from './renderResultCardImage';
```

- [ ] **Step 5: Run renderer tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/renderResultCardImage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/features/result-card
git commit -m "feat(results): render shareable result card image"
```

---

### Task 5: Result Card UI And Reveal Dialog

**Files:**
- Create: `apps/myk9show/src/features/result-card/ResultCard.tsx`
- Create: `apps/myk9show/src/features/result-card/ResultRevealDialog.tsx`
- Create: `apps/myk9show/src/features/result-card/ResultRevealDialog.test.tsx`
- Modify: `apps/myk9show/src/features/result-card/index.ts`

**Interfaces:**
- Consumes: `ResultCardModel`, `renderResultCardImage`, `shareFile`.
- Produces: `<ResultRevealDialog open onOpenChange model onSeen />`.

- [ ] **Step 1: Write failing dialog tests**

Create `ResultRevealDialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { ResultCardModel } from './resultCardModel';
import { ResultRevealDialog } from './ResultRevealDialog';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('./renderResultCardImage', () => ({
  renderResultCardImage: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}));
vi.mock('@/utils/share', async () => {
  const actual = await vi.importActual('@/utils/share');
  return { ...actual, shareFile: vi.fn(() => Promise.resolve('shared')) };
});

function makeModel(overrides: Partial<ResultCardModel> = {}): ResultCardModel {
  return {
    entryId: 'entry-1',
    releaseKey: 'entry-1:release',
    dogName: 'Ditto',
    showName: 'Rocky Mountain Classic',
    showDateLabel: '9/14/2026',
    className: 'Container Novice A',
    resultLabel: 'Q',
    placement: 1,
    placementLabel: '1st',
    timeLabel: '42.18s',
    faultsLabel: '0 faults',
    shareTitle: 'Ditto qualified',
    shareText: 'Ditto earned a Q.',
    shareEnabled: true,
    ...overrides,
  };
}

describe('ResultRevealDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a dog-first qualifying reveal and marks it seen', () => {
    const onSeen = vi.fn();
    render(
      <ResultRevealDialog
        open
        onOpenChange={vi.fn()}
        model={makeModel()}
        onSeen={onSeen}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ditto')).toBeInTheDocument();
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(onSeen).toHaveBeenCalledWith('entry-1:release');
  });

  it('shares the rendered PNG when Share is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ResultRevealDialog
        open
        onOpenChange={vi.fn()}
        model={makeModel()}
        onSeen={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: /Share/i }));

    const { renderResultCardImage } = await import('./renderResultCardImage');
    const { shareFile } = await import('@/utils/share');
    expect(renderResultCardImage).toHaveBeenCalledWith(expect.objectContaining({ dogName: 'Ditto' }));
    expect(shareFile).toHaveBeenCalledWith(expect.any(Blob), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });
  });
});
```

- [ ] **Step 2: Run dialog tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/ResultRevealDialog.test.tsx
```

Expected: FAIL because components do not exist.

- [ ] **Step 3: Implement `ResultCard`**

Create `ResultCard.tsx`:

```tsx
import { Award } from 'lucide-react';
import type { ResultCardModel } from './resultCardModel';

interface ResultCardProps {
  model: ResultCardModel;
}

export function ResultCard({ model }: ResultCardProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-primary/20 bg-card text-card-foreground">
      <div className="bg-primary/10 px-5 py-5 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Award className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-3xl font-bold">{model.dogName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{model.showName}</p>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="flex items-center justify-center gap-3">
          <span className="rounded-md border border-success/30 bg-success/15 px-4 py-2 text-3xl font-bold text-success">
            {model.resultLabel}
          </span>
          {model.placementLabel && (
            <span className="rounded-md border border-primary/20 bg-primary/10 px-4 py-2 text-2xl font-bold text-primary">
              {model.placementLabel}
            </span>
          )}
        </div>
        <div className="text-center">
          <p className="font-semibold">{model.className}</p>
          <p className="text-sm text-muted-foreground">{model.showDateLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {model.timeLabel && <ResultFact label="Time" value={model.timeLabel} />}
          {model.faultsLabel && <ResultFact label="Faults" value={model.faultsLabel} />}
          {model.armband && <ResultFact label="Armband" value={model.armband} />}
        </div>
      </div>
    </div>
  );
}

function ResultFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ResultRevealDialog`**

Create `ResultRevealDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { shareFile } from '@/utils/share';
import { ResultCard } from './ResultCard';
import { renderResultCardImage } from './renderResultCardImage';
import type { ResultCardModel } from './resultCardModel';

interface ResultRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ResultCardModel | null;
  onSeen: (releaseKey: string) => void;
}

export function ResultRevealDialog({
  open,
  onOpenChange,
  model,
  onSeen,
}: ResultRevealDialogProps) {
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!open || !model) return;
    onSeen(model.releaseKey);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    void confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 } });
  }, [model, onSeen, open]);

  async function handleShare() {
    if (!model) return;
    setSharing(true);
    try {
      const blob = await renderResultCardImage(model);
      await shareFile(blob, {
        title: model.shareTitle,
        text: model.shareText,
        fileName: `${model.dogName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-result.png`,
      });
    } finally {
      setSharing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New result</DialogTitle>
        </DialogHeader>
        {model && (
          <div className="space-y-4">
            <ResultCard model={model} />
            <Button onClick={handleShare} disabled={sharing} className="min-h-[44px] w-full">
              <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {sharing ? 'Preparing...' : 'Share'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Export components**

Update `features/result-card/index.ts`:

```ts
export * from './resultCardModel';
export * from './resultRevealSeen';
export * from './renderResultCardImage';
export * from './ResultCard';
export * from './ResultRevealDialog';
```

- [ ] **Step 6: Run dialog tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/features/result-card/ResultRevealDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/features/result-card
git commit -m "feat(results): add result reveal dialog"
```

---

### Task 6: My Entries Integration

**Files:**
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/useMyEntriesData.ts`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx`
- Modify: `apps/myk9show/src/pages/MyEntriesPage/index.tsx`

**Interfaces:**
- Consumes: `buildResultCardModel`, `hasSeenResultReveal`, `markResultRevealSeen`.
- Produces: My Entries soft prompt and reveal dialog.

- [ ] **Step 1: Map dog image and release marker**

In `useMyEntriesData.ts`, add selected fields if the current query does not include them:

```ts
// entries.classes join must include results_released_at through the class row.
// dog join must include image_url.
```

When building `EntryClass`, assign:

```ts
resultsReleasedAt: classData.results_released_at ?? undefined,
dogImageUrl: dog?.image_url ?? undefined,
```

If `classData` or `dog` local types do not declare those fields, extend their local structural types instead of using `any`.

- [ ] **Step 2: Write failing MyEntryCard prompt test**

Append to `MyEntryCard.test.tsx`:

```tsx
describe('MyEntryCard result reveal prompt', () => {
  it('shows a New result button for a newly released qualifying result', () => {
    const onResultRevealClick = vi.fn();
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeEntry({
            classes: [
              makeClass({
                id: 'entry-1',
                isScored: true,
                resultStatus: 'qualified',
                finalPlacement: 1,
                resultsReleasedAt: '2026-09-14T20:00:00.000Z',
              }),
            ],
          })}
          onCheckInClick={vi.fn()}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
          onResultRevealClick={onResultRevealClick}
          seenResultReleaseKeys={new Set()}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole('button', { name: /New result/i })).toBeInTheDocument();
  });

  it('does not show New result for non-qualifying results', () => {
    render(
      <MemoryRouter>
        <MyEntryCard
          entry={makeEntry({
            classes: [
              makeClass({
                id: 'entry-1',
                isScored: true,
                resultStatus: 'nq',
                resultsReleasedAt: '2026-09-14T20:00:00.000Z',
              }),
            ],
          })}
          onCheckInClick={vi.fn()}
          onEditClick={vi.fn()}
          onReceiptClick={vi.fn()}
          onResultRevealClick={vi.fn()}
          seenResultReleaseKeys={new Set()}
        />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button', { name: /New result/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run MyEntryCard tests red**

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Expected: FAIL because `MyEntryCard` does not accept reveal props.

- [ ] **Step 4: Add reveal props to MyEntryCard**

Update `MyEntryCardProps`:

```ts
import { buildResultCardModel, type ResultCardModel } from '@/features/result-card';

interface MyEntryCardProps {
  entry: MyEntry;
  onCheckInClick: (entry: MyEntry, classEntry: EntryClass) => void;
  onEditClick: (entry: MyEntry) => void;
  onReceiptClick: (entry: MyEntry) => void;
  onResultRevealClick?: (model: ResultCardModel) => void;
  seenResultReleaseKeys?: Set<string>;
}
```

Default the optional props in the component signature:

```ts
seenResultReleaseKeys = new Set(),
```

For each class row, build the model:

```ts
const resultModel = buildResultCardModel({
  entry,
  classEntry: cls,
  visibility: {
    showQualification: true,
    showPlacement: true,
    showTime: true,
    showFaults: true,
  },
});
const showNewResult =
  resultModel != null && !seenResultReleaseKeys.has(resultModel.releaseKey);
```

Render the prompt near the existing result badge:

```tsx
{showNewResult && onResultRevealClick && (
  <Button
    type="button"
    size="sm"
    variant="outline"
    onClick={() => onResultRevealClick(resultModel)}
    className="min-h-[36px] border-primary/30 text-primary"
  >
    New result
  </Button>
)}
```

- [ ] **Step 5: Run MyEntryCard tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Integrate dialog in MyEntriesPage**

In `index.tsx`, import:

```ts
import {
  buildResultCardModel,
  ResultRevealDialog,
  hasSeenResultReveal,
  markResultRevealSeen,
  type ResultCardModel,
} from '@/features/result-card';
```

Also change the router import from:

```ts
import { Link, useNavigate } from 'react-router-dom';
```

to:

```ts
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
```

Add state:

```ts
const [resultRevealModel, setResultRevealModel] = useState<ResultCardModel | null>(null);
const [seenResultReleaseKeys, setSeenResultReleaseKeys] = useState<Set<string>>(() => {
  return new Set();
});
```

After entries load, refresh seen keys:

```ts
React.useEffect(() => {
  const keys = new Set<string>();
  for (const entry of entries) {
    for (const cls of entry.classes) {
      const model = buildResultCardModel({
        entry,
        classEntry: cls,
        visibility: {
          showQualification: true,
          showPlacement: true,
          showTime: true,
          showFaults: true,
        },
      });
      if (model && hasSeenResultReveal(model.releaseKey)) keys.add(model.releaseKey);
    }
  }
  setSeenResultReleaseKeys(keys);
}, [entries]);
```

Pass props to `MyEntryCard`:

```tsx
onResultRevealClick={setResultRevealModel}
seenResultReleaseKeys={seenResultReleaseKeys}
```

Render dialog:

```tsx
<ResultRevealDialog
  open={resultRevealModel != null}
  onOpenChange={open => {
    if (!open) setResultRevealModel(null);
  }}
  model={resultRevealModel}
  onSeen={releaseKey => {
    markResultRevealSeen(releaseKey);
    setSeenResultReleaseKeys(prev => new Set(prev).add(releaseKey));
  }}
/>
```

- [ ] **Step 7: Add query-param open behavior**

When `resultEntryId` exists and entries are loaded, find the matching class row, build a model, and open the reveal. If no model exists, do nothing.

```ts
const [searchParams, setSearchParams] = useSearchParams();

React.useEffect(() => {
  const resultEntryId = searchParams.get('resultEntryId');
  if (!resultEntryId || resultRevealModel) return;

  for (const entry of entries) {
    const classEntry = entry.classes.find(cls => cls.id === resultEntryId);
    if (!classEntry) continue;
    const model = buildResultCardModel({
      entry,
      classEntry,
      visibility: {
        showQualification: true,
        showPlacement: true,
        showTime: true,
        showFaults: true,
      },
    });
    if (model) {
      setResultRevealModel(model);
      const next = new URLSearchParams(searchParams);
      next.delete('resultEntryId');
      setSearchParams(next, { replace: true });
    }
    break;
  }
}, [entries, resultRevealModel, searchParams, setSearchParams]);
```

- [ ] **Step 8: Run focused My Entries tests**

Run:

```bash
cd apps/myk9show && npx vitest run src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx src/test/pages/MyEntriesPage.test.tsx
```

Expected: PASS, or document why the broader page test needs a fixture update.

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/pages/MyEntriesPage apps/myk9show/src/features/result-card
git commit -m "feat(exhibitor): surface new qualifying results"
```

---

### Task 7: Notification Retargeting

**Files:**
- Modify: `apps/myk9show/src/hooks/useNotificationMonitor.ts`
- Modify: `apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts`

**Interfaces:**
- Consumes: class context entries and owned dog ids.
- Produces: result notifications with `actionUrl=/exhibitor/entries?resultEntryId=<entryId>` when exactly one owned entry is in the class.

- [ ] **Step 1: Write assertion-first notification test**

Add a test that proves the exact URL:

```ts
it('retargets single owned result notifications to the My Entries reveal URL', () => {
  // Arrange useQuery mock data so class c1 has one owned dog entry e1.
  // Then fire the classes UPDATE callback with is_scoring_finalized changing false -> true.
  // Assert exact URL, not just delivery.
  expect(mockDeliver).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'results_posted',
      actionUrl: '/exhibitor/entries?resultEntryId=e1',
    })
  );
});
```

If the existing test harness cannot inject query data, first refactor its hoisted `useQuery` mock to return a mutable `mockUseQueryData` object.

- [ ] **Step 2: Run notification test red**

Run:

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts -t "retargets single owned result"
```

Expected: FAIL because current code uses `/classes/:classId`.

- [ ] **Step 3: Add helper for result action URL**

Inside `useNotificationMonitor.ts`, near helper constants:

```ts
function buildResultsActionUrl(classId: string, userEntries: ShowEntry[]): string {
  if (userEntries.length === 1) {
    return `/exhibitor/entries?resultEntryId=${encodeURIComponent(userEntries[0].id)}`;
  }
  return `/classes/${classId}`;
}
```

This intentionally falls back to the class results page when the account has multiple dogs in the class, because one notification cannot choose one dog-first reveal without hiding the other result.

- [ ] **Step 4: Use helper in both result-posted paths**

Replace each `resultsPayload.actionUrl = /classes/${classId}` result-posted assignment with:

```ts
const userEntries = ctx.entries.filter(e => userDogIdsRef.current.has(e.dogId));
const userDogNames = userEntries.map(e => newDogNames.get(e.dogId) ?? 'Your dog');
if (userDogNames.length > 0) {
  const resultsPayload = buildResultsPostedPayload({
    dogName: userDogNames.join(', '),
    className: ctx.className,
  });
  resultsPayload.actionUrl = buildResultsActionUrl(classId, userEntries);
  deliverRef.current(resultsPayload);
}
```

Use `dogNameMap.current` in the realtime class-change path where `newDogNames` is not in scope.

- [ ] **Step 5: Run notification tests green**

Run:

```bash
cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationMonitor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationMonitor.ts apps/myk9show/src/hooks/__tests__/useNotificationMonitor.test.ts
git commit -m "feat(results): deep-link notifications to result reveal"
```

---

### Task 8: Final Verification And Tracking

**Files:**
- Modify: `OPEN-TODOS.md`
- Review: `docs/superpowers/specs/2026-06-19-result-reveal-share-card-design.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified implementation and updated tracking.

- [ ] **Step 1: Run focused feature tests**

Run:

```bash
cd apps/myk9show && npx vitest run \
  src/features/result-card/resultCardModel.test.ts \
  src/features/result-card/resultRevealSeen.test.ts \
  src/features/result-card/renderResultCardImage.test.ts \
  src/features/result-card/ResultRevealDialog.test.tsx \
  src/pages/MyEntriesPage/modules/MyEntryCard.test.tsx \
  src/hooks/__tests__/useNotificationMonitor.test.ts \
  src/utils/share.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run app verification**

Run:

```bash
pnpm --filter @myk9/show typecheck
pnpm --filter @myk9/show lint
```

Expected: PASS.

- [ ] **Step 3: Manual browser smoke**

Run the show app:

```bash
pnpm dev:show
```

Open `/exhibitor/entries` as an exhibitor with a released qualifying result. Verify:

- The class row shows "New result" once.
- The reveal opens from the prompt.
- The reveal does not auto-open on page load without `resultEntryId`.
- Refreshing after opening removes the "New result" prompt.
- `/exhibitor/entries?resultEntryId=<entryId>` opens the same reveal.
- A non-qualifying result shows no prompt and no share action.
- Reduced-motion mode suppresses confetti.
- Share uses the native sheet on a supported mobile browser or downloads the PNG on desktop.

- [ ] **Step 4: Update tracking**

In `OPEN-TODOS.md`, mark the item complete:

```md
- [x] ~~**Result Reveal + Share Card**~~ — Implemented in PR/commit <reference>: dog-first qualifying result reveal on My Entries, seen-state prompt, shareable PNG, native share/download fallback, and result notification deep-linking.
```

- [ ] **Step 5: Commit tracking**

```bash
git add OPEN-TODOS.md
git commit -m "docs: mark result reveal share card complete"
```
