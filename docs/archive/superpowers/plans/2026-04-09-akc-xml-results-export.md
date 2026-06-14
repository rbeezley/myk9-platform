# AKC XML Results Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub `AKCScentWorkFormatter` with a real implementation that generates AKC-compliant `electres.xml`, wire the `ResultsSubmissionPage` to real show data, and add a one-click "Send to AKC" button that emails the XML via a new Supabase Edge Function.

**Architecture:** A pure TypeScript formatter in `packages/secretary` generates XML from an `AKCSubmissionData` object. A new `useAKCSubmissionData` hook in the app fetches and assembles show/trial/entry/owner data from Supabase. A new `send-results` Edge Function receives the XML and sends it via Resend with the secretary CC'd. The existing `ResultsSubmissionPage` orchestrates all three.

**Tech Stack:** TypeScript, React Query, Supabase (direct PostgREST queries), Resend (via existing `RESEND_API_KEY`), Deno (edge function), Vitest

---

## File Map

| Action | File                                                                         | Purpose                             |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------- |
| Modify | `packages/secretary/src/results/types.ts`                                    | Add new fields + AKC-specific types |
| Modify | `packages/secretary/src/results/index.ts`                                    | Export new types                    |
| Modify | `packages/secretary/src/index.ts`                                            | Export new types                    |
| Modify | `packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts`         | Real XML implementation             |
| Modify | `packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts`     | Rewrite for real implementation     |
| Modify | `packages/secretary/src/results/__tests__/registry.test.ts`                  | Update `makeFormatter` helper       |
| Create | `apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts`                    | Data-fetch hook                     |
| Create | `apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.test.ts`     | Hook tests                          |
| Create | `supabase/functions/send-results/index.ts`                                   | Edge function                       |
| Modify | `apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx`          | Wire real data + Send button        |
| Modify | `apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx` | Update tests                        |

---

## Task 1: Update types in `packages/secretary`

**Files:**

- Modify: `packages/secretary/src/results/types.ts`
- Modify: `packages/secretary/src/results/index.ts`
- Modify: `packages/secretary/src/index.ts`
- Modify: `packages/secretary/src/results/__tests__/registry.test.ts`

- [ ] **Step 1: Replace `types.ts` with the updated version**

```typescript
// packages/secretary/src/results/types.ts

/**
 * Types for electronic result submission to sanctioning organizations.
 */

export interface SubmissionEntry {
  /** Call name / dog name */
  dogName: string;
  breed: string;
  /** Sanctioning registration number (AKC, UKC, etc.) */
  registrationNumber: string | null;
  handlerName: string;
  /** Class identifier, e.g. "Container - Advanced" */
  className: string;
  element: string;
  level: string;
  section: string | null;
  /** Raw result text as recorded by judge: 'Q', 'NQ', 'EXC', etc. */
  resultCode: string | null;
  /** Search time in seconds */
  searchTimeSeconds: number | null;
  /** Total fault count */
  totalFaults: number | null;
  /** Final placement within class (1 = first, null = not placed) */
  finalPlacement: number | null;
  /** Armband number assigned to this entry */
  armbandNumber: number;
  /** Trial this entry belongs to — used by formatters to group entries per event */
  trialId: string;
  /** Class this entry belongs to — used by formatters to group entries per class */
  classId: string;
}

export interface SubmissionShow {
  id: string;
  name: string;
  /** Club name that hosts the show */
  clubName: string | null;
  /** Show start date (ISO date string) */
  date: string | null;
  /** AKC/UKC club number or similar */
  clubLicenseNumber: string | null;
  /** Trial secretary full name — drives the <sender name> attribute */
  secretaryName: string | null;
  /** Trial secretary email — drives the <sender responseEmail> attribute */
  secretaryEmail: string | null;
}

export interface SubmissionTrial {
  id: string;
  trialNumber: string | number;
  date: string | null;
  judgeName: string;
  /** E.g. 'AKC', 'UKC', 'NACSW' */
  organization: string;
  /** E.g. 'scent_work', 'fast_cat' */
  sportType: string;
  /** Sanctioning organization event number (e.g. trials.event_number for AKC) */
  eventNumber: string | null;
}

export interface SubmissionData {
  show: SubmissionShow;
  /** All trials included in this submission (one <event> per trial for AKC) */
  trials: SubmissionTrial[];
  entries: SubmissionEntry[];
}

export interface ResultFormatter {
  /** Sanctioning organization, e.g. 'AKC' */
  organization: string;
  /** Sport type slug, e.g. 'scent_work' */
  sportType: string;
  /**
   * Destination email for electronic submission.
   * null means this formatter does not support direct email sending.
   */
  submissionEmail?: string | null;
  /** Produce the XML string for electronic submission */
  formatXml(data: SubmissionData): string;
}

// ---------------------------------------------------------------------------
// AKC-specific types
// ---------------------------------------------------------------------------

export interface AKCOwnerAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
}

/** Extends SubmissionEntry with fields required by the AKC electres.xsd schema */
export interface AKCSubmissionEntry extends SubmissionEntry {
  /** Registered name from dog_registrations (AKC org) — for dogName XML attribute */
  dogRegisteredName: string | null;
  /** D = dog (male), B = bitch (female) — from dogs.sex */
  dogGender: 'D' | 'B' | null;
  /** Owner full name (people.first_name + last_name) */
  ownerName: string | null;
  /** Owner mailing address */
  ownerAddress: AKCOwnerAddress | null;
  /** Class time limit in seconds — for courseTime on <class> element */
  timeLimitSeconds: number | null;
  /** entries.entry_status — 'accepted', 'withdrawn', etc. */
  entryStatus: string | null;
  /** entries.check_in_status — 'present', 'absent', etc. */
  checkInStatus: string | null;
  /** entries.result_status — 'Q', 'NQ', 'disqualified', 'excused', etc. */
  resultStatus: string | null;
}

export interface AKCSubmissionData {
  show: SubmissionShow;
  trials: SubmissionTrial[];
  entries: AKCSubmissionEntry[];
}
```

- [ ] **Step 2: Update `results/index.ts` to export the new types**

```typescript
// packages/secretary/src/results/index.ts

/**
 * Results submission module — barrel export.
 *
 * Importing this module auto-registers all built-in formatters so callers
 * can immediately use getFormatter() / listFormatters() without manual setup.
 */

export type {
  SubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
  SubmissionData,
  ResultFormatter,
  AKCOwnerAddress,
  AKCSubmissionEntry,
  AKCSubmissionData,
} from './types';
export { registerFormatter, getFormatter, listFormatters, clearFormatters } from './registry';
export { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';

// Auto-register built-in formatters on import
import { registerFormatter } from './registry';
import { AKCScentWorkFormatter } from './formatters/AKCScentWorkFormatter';

registerFormatter(AKCScentWorkFormatter);
```

- [ ] **Step 3: Update `packages/secretary/src/index.ts` to export the new types**

```typescript
// packages/secretary/src/index.ts
// (add to the existing "Results submission" export block)

export type {
  SubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
  SubmissionData,
  ResultFormatter,
  AKCOwnerAddress,
  AKCSubmissionEntry,
  AKCSubmissionData,
} from './results';
export {
  registerFormatter,
  getFormatter,
  listFormatters,
  clearFormatters,
  AKCScentWorkFormatter,
} from './results';
```

The full `index.ts` after editing (replace the "Results submission" section):

```typescript
// packages/secretary/src/index.ts

/**
 * @myk9/secretary — Secretary tools package
 */

// Visibility types
export type {
  VisibilityTiming,
  VisibilityPreset,
  ResultField,
  VisibilitySettings,
  VisibleResultFields,
  ClassState,
  VisibilityUserRole,
  VisibilityOverride,
  PresetInfo,
  FieldTimings,
} from './visibility/visibility-types';

// Visibility presets
export {
  PRESET_CONFIGS,
  PRESET_INFO,
  resolvePreset,
  fieldTimingsFromVisibility,
  detectPreset,
  hasVisibilityOverride,
} from './visibility/visibility-presets';

// Visibility cascade
export { resolveVisibilityCascade, getVisibleResultFields } from './visibility/visibility-cascade';

// Check-in cascade
export { resolveCheckinCascade } from './checkin/checkin-cascade';

// Results submission — types, registry, and built-in formatters
export type {
  SubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
  SubmissionData,
  ResultFormatter,
  AKCOwnerAddress,
  AKCSubmissionEntry,
  AKCSubmissionData,
} from './results';
export {
  registerFormatter,
  getFormatter,
  listFormatters,
  clearFormatters,
  AKCScentWorkFormatter,
} from './results';
```

- [ ] **Step 4: Update `registry.test.ts` to include `submissionEmail` in the helper**

`makeFormatter` must now include `submissionEmail` (optional, so set to `null`):

```typescript
// packages/secretary/src/results/__tests__/registry.test.ts
// Change only the makeFormatter helper — tests themselves are unchanged

function makeFormatter(org: string, sport: string): ResultFormatter {
  return {
    organization: org,
    sportType: sport,
    submissionEmail: null,
    formatXml: () => `<${org}/>`,
  };
}
```

- [ ] **Step 5: Build the package to confirm types compile**

```bash
cd /path/to/myk9-platform
pnpm --filter @myk9/secretary build
```

Expected: build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add packages/secretary/src/results/types.ts \
        packages/secretary/src/results/index.ts \
        packages/secretary/src/index.ts \
        packages/secretary/src/results/__tests__/registry.test.ts
git commit -m "feat(secretary): add AKC-specific types and extend SubmissionData for multi-trial support"
```

---

## Task 2: Implement `AKCScentWorkFormatter`

**Files:**

- Modify: `packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts`
- Modify: `packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts`

- [ ] **Step 1: Rewrite the test file (TDD — write tests before the implementation)**

These tests completely replace the existing stub tests:

```typescript
// packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts

import { describe, it, expect } from 'vitest';
import { AKCScentWorkFormatter } from '../formatters/AKCScentWorkFormatter';
import type { AKCSubmissionData, AKCSubmissionEntry } from '../types';

// ---------------------------------------------------------------------------
// Test data builders
// ---------------------------------------------------------------------------

function makeShow(overrides: Partial<AKCSubmissionData['show']> = {}): AKCSubmissionData['show'] {
  return {
    id: 'show-1',
    name: 'Spring Scent Trial',
    clubName: 'Acme K9 Club',
    date: '2026-05-10',
    clubLicenseNumber: '12345',
    secretaryName: 'Jane Secretary',
    secretaryEmail: 'jane@example.com',
    ...overrides,
  };
}

function makeTrial(
  overrides: Partial<AKCSubmissionData['trials'][number]> = {}
): AKCSubmissionData['trials'][number] {
  return {
    id: 'trial-1',
    trialNumber: 1,
    date: '2026-05-10',
    judgeName: 'Bob Judge',
    organization: 'AKC',
    sportType: 'scent_work',
    eventNumber: '2026193001',
    ...overrides,
  };
}

function makeEntry(overrides: Partial<AKCSubmissionEntry> = {}): AKCSubmissionEntry {
  return {
    dogName: 'Fluffy',
    breed: 'Unknown',
    registrationNumber: 'HP12345601',
    handlerName: 'Alice Handler',
    className: 'Novice A - Container',
    element: 'Container',
    level: 'Novice',
    section: 'A',
    resultCode: 'Q',
    searchTimeSeconds: 14.5,
    totalFaults: 0,
    finalPlacement: 1,
    armbandNumber: 101,
    trialId: 'trial-1',
    classId: 'class-1',
    dogRegisteredName: 'Acme Fluffy The First',
    dogGender: 'B',
    ownerName: 'Alice Owner',
    ownerAddress: {
      street: '123 Main St',
      city: 'Columbus',
      state: 'OH',
      zip: '43215',
      country: 'US',
    },
    timeLimitSeconds: 120,
    entryStatus: 'accepted',
    checkInStatus: 'present',
    resultStatus: 'Q',
    ...overrides,
  };
}

function makeData(overrides: Partial<AKCSubmissionData> = {}): AKCSubmissionData {
  return {
    show: makeShow(),
    trials: [makeTrial()],
    entries: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AKCScentWorkFormatter', () => {
  it('has organization AKC', () => {
    expect(AKCScentWorkFormatter.organization).toBe('AKC');
  });

  it('has sportType scent_work', () => {
    expect(AKCScentWorkFormatter.sportType).toBe('scent_work');
  });

  it('has submissionEmail set', () => {
    expect(AKCScentWorkFormatter.submissionEmail).toBeTruthy();
  });

  describe('sender element', () => {
    it('starts with XML declaration', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml.startsWith('<?xml version="1.0"?>')).toBe(true);
    });

    it('has correct xmlns and schemaVersion', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('xmlns="http://www.akc.org"');
      expect(xml).toContain('schemaVersion="1.0"');
    });

    it('includes secretary name in sender name attribute', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('name="Jane Secretary"');
    });

    it('includes secretary email in responseEmail attribute', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('responseEmail="jane@example.com"');
    });

    it('escapes ampersands in secretary name', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ show: makeShow({ secretaryName: 'Jane & Bob' }) })
      );
      expect(xml).toContain('name="Jane &amp; Bob"');
      expect(xml).not.toContain('name="Jane & Bob"');
    });
  });

  describe('event element', () => {
    it('produces one event per trial', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          trials: [
            makeTrial({ id: 'trial-1', eventNumber: '2026193001', date: '2026-05-10' }),
            makeTrial({ id: 'trial-2', eventNumber: '2026193002', date: '2026-05-11' }),
          ],
        })
      );
      expect((xml.match(/<event /g) ?? []).length).toBe(2);
      expect(xml).toContain('akceventid="2026193001"');
      expect(xml).toContain('akceventid="2026193002"');
    });

    it('includes club name in event', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('clubName="Acme K9 Club"');
    });

    it('includes event date', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData());
      expect(xml).toContain('eventDate="2026-05-10"');
    });
  });

  describe('class element', () => {
    it('groups entries from the same class into one class element', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1', armbandNumber: 101 }),
            makeEntry({ classId: 'class-1', armbandNumber: 102, finalPlacement: 2 }),
          ],
        })
      );
      expect((xml.match(/<class /g) ?? []).length).toBe(1);
    });

    it('creates separate class elements for different classes', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1' }),
            makeEntry({
              classId: 'class-2',
              element: 'Interior',
              level: 'Novice',
              section: 'A',
              trialId: 'trial-1',
            }),
          ],
        })
      );
      expect((xml.match(/<class /g) ?? []).length).toBe(2);
    });

    it('sets compGroup to SCWK', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData({ entries: [makeEntry()] }));
      expect(xml).toContain('compGroup="SCWK"');
    });

    it('sets breedCode to ALLB on class', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData({ entries: [makeEntry()] }));
      expect(xml).toContain('breedCode="ALLB"');
    });

    it('sets gender to C (combined) on class', () => {
      const xml = AKCScentWorkFormatter.formatXml(makeData({ entries: [makeEntry()] }));
      expect(xml).toContain('gender="C"');
    });

    it('formats courseTime as seconds.0 from timeLimitSeconds', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ timeLimitSeconds: 120 })] })
      );
      expect(xml).toContain('courseTime="120.0"');
    });

    it('computes numEntries excluding withdrawals', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1', armbandNumber: 101, entryStatus: 'accepted' }),
            makeEntry({ classId: 'class-1', armbandNumber: 102, entryStatus: 'accepted' }),
            makeEntry({ classId: 'class-1', armbandNumber: 103, entryStatus: 'withdrawn' }),
          ],
        })
      );
      expect(xml).toContain('numEntries="2"');
      expect(xml).toContain('numWithdrawals="1"');
    });

    it('computes numStarters excluding absent entries', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({ classId: 'class-1', armbandNumber: 101, checkInStatus: 'present' }),
            makeEntry({
              classId: 'class-1',
              armbandNumber: 102,
              checkInStatus: 'absent',
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('numEntries="2"');
      expect(xml).toContain('numStarters="1"');
    });

    it('computes numQualifying from Q results and placements 1-4', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              classId: 'class-1',
              armbandNumber: 101,
              finalPlacement: 1,
              resultStatus: null,
            }),
            makeEntry({
              classId: 'class-1',
              armbandNumber: 102,
              finalPlacement: null,
              resultStatus: 'Q',
            }),
            makeEntry({
              classId: 'class-1',
              armbandNumber: 103,
              finalPlacement: null,
              resultStatus: null,
            }),
          ],
        })
      );
      expect(xml).toContain('numQualifying="2"');
    });
  });

  describe('primaryClass mapping', () => {
    const cases: Array<[string, string, string]> = [
      ['Novice', 'A', 'SWNOVA'],
      ['Novice', 'B', 'SWNOVB'],
      ['Advanced', '', 'SWADV'],
      ['Excellent', '', 'SWEXC'],
      ['Master', '', 'SWMAST'],
      ['Detective', '', 'SWDC'],
    ];

    for (const [level, section, expected] of cases) {
      it(`maps ${level} ${section} to ${expected}`, () => {
        const xml = AKCScentWorkFormatter.formatXml(
          makeData({
            entries: [makeEntry({ level, section: section || null, element: 'Container' })],
          })
        );
        expect(xml).toContain(`primaryClass="${expected}"`);
      });
    }
  });

  describe('secondaryClass mapping', () => {
    const cases: Array<[string, string]> = [
      ['Container', 'CONTAINR'],
      ['Interior', 'INTERIOR'],
      ['Exterior', 'EXTERIOR'],
      ['Buried', 'BURIED'],
      ['Handler Discrimination', 'HANDDISC'],
    ];

    for (const [element, expected] of cases) {
      it(`maps ${element} to ${expected}`, () => {
        const xml = AKCScentWorkFormatter.formatXml(
          makeData({ entries: [makeEntry({ element })] })
        );
        expect(xml).toContain(`secondaryClass="${expected}"`);
      });
    }

    it('omits secondaryClass for Detective', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [makeEntry({ level: 'Detective', element: 'Detective', section: null })],
        })
      );
      expect(xml).not.toContain('secondaryClass=');
    });
  });

  describe('results element', () => {
    it('includes AKC registration number', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ registrationNumber: 'HP66613103' })] })
      );
      expect(xml).toContain('akcDogRegnum="HP66613103"');
    });

    it('exports empty string for missing AKC reg number (not null/undefined)', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ registrationNumber: null })] })
      );
      expect(xml).toContain('akcDogRegnum=""');
      expect(xml).not.toContain('akcDogRegnum="null"');
      expect(xml).not.toContain('akcDogRegnum="undefined"');
    });

    it('uses dogRegisteredName for dogName attribute', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              dogName: 'CallName',
              dogRegisteredName: 'Acme Fluffy The First',
            }),
          ],
        })
      );
      expect(xml).toContain('dogName="Acme Fluffy The First"');
    });

    it('falls back to dogName when dogRegisteredName is null', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [makeEntry({ dogName: 'CallName', dogRegisteredName: null })],
        })
      );
      expect(xml).toContain('dogName="CallName"');
    });

    it('includes armband number as catalogNumber', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ armbandNumber: 145 })] })
      );
      expect(xml).toContain('catalogNumber="145"');
    });

    it('includes search time as courseTime', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ searchTimeSeconds: 17.5 })] })
      );
      expect(xml).toContain('courseTime="17.5"');
    });
  });

  describe('actionCode / resultCode mapping', () => {
    it('maps withdrawn → WHLD / EXO', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'withdrawn',
              checkInStatus: null,
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="WHLD"');
      expect(xml).toContain('<resultCode>EXO</resultCode>');
    });

    it('maps absent → ABSN / A', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'absent',
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="ABSN"');
      expect(xml).toContain('<resultCode>A</resultCode>');
    });

    it('maps disqualified → DISQ / A', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'disqualified',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="DISQ"');
      expect(xml).toContain('<resultCode>A</resultCode>');
    });

    it('maps excused → EXCU / EXO', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'excused',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="EXCU"');
      expect(xml).toContain('<resultCode>EXO</resultCode>');
    });

    it('maps placement 1 → PLAC / 1', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: null,
              finalPlacement: 1,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="PLAC"');
      expect(xml).toContain('<resultCode>1</resultCode>');
    });

    it('maps placement 4 → PLAC / 4', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: null,
              finalPlacement: 4,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="PLAC"');
      expect(xml).toContain('<resultCode>4</resultCode>');
    });

    it('maps Q with no placement → CNT / Q', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'Q',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="CNT"');
      expect(xml).toContain('<resultCode>Q</resultCode>');
    });

    it('maps explicit NQ → CNT / NQ', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: 'NQ',
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="CNT"');
      expect(xml).toContain('<resultCode>NQ</resultCode>');
    });

    it('maps unscored entry (null result, null placement) → CNT / NQ', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              entryStatus: 'accepted',
              checkInStatus: 'present',
              resultStatus: null,
              finalPlacement: null,
            }),
          ],
        })
      );
      expect(xml).toContain('actionCode="CNT"');
      expect(xml).toContain('<resultCode>NQ</resultCode>');
    });
  });

  describe('owner address', () => {
    it('uses USState and USPostalCode for US addresses', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              ownerAddress: {
                street: '123 Main St',
                city: 'Columbus',
                state: 'OH',
                zip: '43215',
                country: 'US',
              },
            }),
          ],
        })
      );
      expect(xml).toContain('<USState>OH</USState>');
      expect(xml).toContain('<USPostalCode>43215</USPostalCode>');
      expect(xml).not.toContain('ForeignState');
    });

    it('uses ForeignState and ForeignPostalCode for Canadian addresses', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              ownerAddress: {
                street: '456 Maple Ave',
                city: 'Ottawa',
                state: 'ON',
                zip: 'K1A0A6',
                country: 'CA',
              },
            }),
          ],
        })
      );
      expect(xml).toContain('<ForeignState>ON</ForeignState>');
      expect(xml).toContain('<ForeignPostalCode>K1A0A6</ForeignPostalCode>');
      expect(xml).not.toContain('USState');
    });

    it('strips hyphens from US zip codes', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({
          entries: [
            makeEntry({
              ownerAddress: {
                street: '1 Park Ave',
                city: 'New York',
                state: 'NY',
                zip: '10001-1234',
                country: 'US',
              },
            }),
          ],
        })
      );
      expect(xml).toContain('<USPostalCode>100011234</USPostalCode>');
    });

    it('omits ownerAddress element when ownerAddress is null', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ ownerAddress: null })] })
      );
      expect(xml).not.toContain('<ownerAddress>');
    });
  });

  describe('gender', () => {
    it('uses D for male dogs', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ dogGender: 'D' })] })
      );
      expect(xml).toContain('gender="D"');
    });

    it('uses B for female dogs', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ dogGender: 'B' })] })
      );
      expect(xml).toContain('gender="B"');
    });

    it('defaults to B when dogGender is null', () => {
      const xml = AKCScentWorkFormatter.formatXml(
        makeData({ entries: [makeEntry({ dogGender: null })] })
      );
      expect(xml).toContain('gender="B"');
    });
  });

  describe('multi-trial show', () => {
    it('only includes entries from each trial in the correct event', () => {
      const xml = AKCScentWorkFormatter.formatXml({
        show: makeShow(),
        trials: [
          makeTrial({ id: 'trial-1', eventNumber: 'EV001', date: '2026-05-10' }),
          makeTrial({ id: 'trial-2', eventNumber: 'EV002', date: '2026-05-11' }),
        ],
        entries: [
          makeEntry({ trialId: 'trial-1', armbandNumber: 101 }),
          makeEntry({ trialId: 'trial-2', armbandNumber: 201 }),
        ],
      });
      // Both events present
      expect(xml).toContain('akceventid="EV001"');
      expect(xml).toContain('akceventid="EV002"');
    });
  });
});
```

- [ ] **Step 2: Run the tests to confirm they all fail (implementation is still the stub)**

```bash
cd apps/myk9show && npx vitest run ../../packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts
```

Expected: most tests FAIL (stub returns `<AKCResults>` placeholder, not real XML).

- [ ] **Step 3: Replace `AKCScentWorkFormatter.ts` with the real implementation**

```typescript
// packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts

import type {
  ResultFormatter,
  SubmissionData,
  AKCSubmissionData,
  AKCSubmissionEntry,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CANADIAN_PROVINCES = new Set(['ON', 'AB', 'QC', 'NS', 'NB', 'MB', 'BC', 'PE', 'SK', 'NL']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape the five predefined XML entities. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}

function mapPrimaryClass(level: string, section: string | null): string {
  const combined = section ? `${level} ${section}` : level;
  if (combined === 'Novice A') return 'SWNOVA';
  if (combined === 'Novice B') return 'SWNOVB';
  if (level.startsWith('Advanced')) return 'SWADV';
  if (level.startsWith('Excellent')) return 'SWEXC';
  if (level.startsWith('Master')) return 'SWMAST';
  if (level.startsWith('Detective') || level === 'Detective') return 'SWDC';
  return 'SWNOVA'; // safe fallback
}

function mapSecondaryClass(element: string): string {
  switch (element) {
    case 'Container':
      return 'CONTAINR';
    case 'Interior':
      return 'INTERIOR';
    case 'Exterior':
      return 'EXTERIOR';
    case 'Buried':
      return 'BURIED';
    case 'Handler Discrimination':
      return 'HANDDISC';
    default:
      return '';
  }
}

function mapResultCodes(entry: AKCSubmissionEntry): { actionCode: string; resultCode: string } {
  if (entry.entryStatus === 'withdrawn') return { actionCode: 'WHLD', resultCode: 'EXO' };
  if (entry.checkInStatus === 'absent') return { actionCode: 'ABSN', resultCode: 'A' };
  if (entry.resultStatus === 'disqualified') return { actionCode: 'DISQ', resultCode: 'A' };
  if (entry.resultStatus === 'excused') return { actionCode: 'EXCU', resultCode: 'EXO' };
  if (entry.finalPlacement != null && entry.finalPlacement >= 1 && entry.finalPlacement <= 4) {
    return { actionCode: 'PLAC', resultCode: String(entry.finalPlacement) };
  }
  if (entry.resultStatus === 'Q') return { actionCode: 'CNT', resultCode: 'Q' };
  // NQ, null result, or any other non-qualifying status
  return { actionCode: 'CNT', resultCode: 'NQ' };
}

// ---------------------------------------------------------------------------
// XML generation
// ---------------------------------------------------------------------------

function generateAKCXml(data: AKCSubmissionData): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0"?>');
  lines.push(
    `<sender xmlns="http://www.akc.org" schemaVersion="1.0"` +
      ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"` +
      ` xsi:schemaLocation="http://www.akc.org electres.xsd"` +
      ` name="${esc(data.show.secretaryName ?? '')}"` +
      ` responseEmail="${esc(data.show.secretaryEmail ?? '')}">`
  );

  for (const trial of data.trials) {
    lines.push(
      `  <event akceventid="${esc(trial.eventNumber ?? '')}"` +
        ` clubName="${esc(data.show.clubName ?? '')}"` +
        ` eventDate="${esc(trial.date ?? '')}">`
    );

    const trialEntries = data.entries.filter(e => e.trialId === trial.id);
    const byClass = groupBy(trialEntries, e => e.classId);

    for (const [, classEntries] of byClass) {
      const first = classEntries[0];
      const primaryClass = mapPrimaryClass(first.level, first.section);
      const secondaryClass = mapSecondaryClass(first.element);
      const courseTime = first.timeLimitSeconds != null ? `${first.timeLimitSeconds}.0` : '0.0';

      const numWithdrawals = classEntries.filter(e => e.entryStatus === 'withdrawn').length;
      const numEntries = classEntries.length - numWithdrawals;
      const numAbsent = classEntries.filter(e => e.checkInStatus === 'absent').length;
      const numStarters = numEntries - numAbsent;
      const numQualifying = classEntries.filter(
        e =>
          e.resultStatus === 'Q' ||
          (e.finalPlacement != null && e.finalPlacement >= 1 && e.finalPlacement <= 4)
      ).length;

      const secondaryAttr = secondaryClass ? ` secondaryClass="${secondaryClass}"` : '';
      lines.push(
        `    <class compGroup="SCWK"` +
          ` primaryClass="${primaryClass}"${secondaryAttr}` +
          ` breedCode="ALLB" gender="C"` +
          ` courseTime="${courseTime}"` +
          ` numEntries="${numEntries}"` +
          ` numStarters="${numStarters}"` +
          ` numQualifying="${numQualifying}"` +
          ` numWithdrawals="${numWithdrawals}">`
      );

      for (const entry of classEntries) {
        const { actionCode, resultCode } = mapResultCodes(entry);
        const searchTime = entry.searchTimeSeconds != null ? String(entry.searchTimeSeconds) : '0';
        const gender = entry.dogGender ?? 'B';
        const dogName = esc(entry.dogRegisteredName ?? entry.dogName);
        const akcNum = esc(entry.registrationNumber ?? '');

        lines.push(
          `      <results akcDogRegnum="${akcNum}"` +
            ` gender="${gender}"` +
            ` dogName="${dogName}"` +
            ` breedCode="ALLB"` +
            ` catalogNumber="${entry.armbandNumber}"` +
            ` courseTime="${searchTime}"` +
            ` actionCode="${actionCode}">`
        );
        lines.push(`        <resultCode>${esc(resultCode)}</resultCode>`);
        lines.push(`        <ownerName>${esc(entry.ownerName ?? '')}</ownerName>`);

        if (entry.ownerAddress) {
          const isCanadian = CANADIAN_PROVINCES.has(entry.ownerAddress.state ?? '');
          const stateTag = isCanadian ? 'ForeignState' : 'USState';
          const zipTag = isCanadian ? 'ForeignPostalCode' : 'USPostalCode';
          const zip = (entry.ownerAddress.zip ?? '').replace(/-/g, '');
          lines.push(`        <ownerAddress>`);
          lines.push(
            `          <addressLine>${esc(entry.ownerAddress.street ?? '')}</addressLine>`
          );
          lines.push(`          <city>${esc(entry.ownerAddress.city ?? '')}</city>`);
          lines.push(`          <${stateTag}>${esc(entry.ownerAddress.state ?? '')}</${stateTag}>`);
          lines.push(`          <${zipTag}>${esc(zip)}</${zipTag}>`);
          lines.push(`        </ownerAddress>`);
        }

        lines.push(`      </results>`);
      }

      lines.push(`    </class>`);
    }

    lines.push(`  </event>`);
  }

  lines.push(`</sender>`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

export const AKCScentWorkFormatter: ResultFormatter = {
  organization: 'AKC',
  sportType: 'scent_work',
  submissionEmail: 'results@akc.org', // confirm with AKC before launch
  formatXml(data: SubmissionData): string {
    return generateAKCXml(data as unknown as AKCSubmissionData);
  },
};
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run ../../packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Build the package to confirm no type errors**

```bash
cd /path/to/myk9-platform && pnpm --filter @myk9/secretary build
```

Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add packages/secretary/src/results/formatters/AKCScentWorkFormatter.ts \
        packages/secretary/src/results/__tests__/AKCScentWorkFormatter.test.ts
git commit -m "feat(secretary): implement AKCScentWorkFormatter with real AKC electres.xml generation"
```

---

## Task 3: Build `useAKCSubmissionData` hook

**Files:**

- Create: `apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts`
- Create: `apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.test.ts`

- [ ] **Step 1: Write the failing tests first**

```typescript
// apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useAKCSubmissionData } from '../useAKCSubmissionData';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({ user: { id: 'auth-user-1' } }),
}));

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: mockSupabase,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function buildSelectChain(returnValue: { data: unknown; error: null | object }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(returnValue),
    single: vi.fn().mockResolvedValue(returnValue),
    then: undefined as unknown,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAKCSubmissionData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null data when showId is empty', () => {
    const { result } = renderHook(() => useAKCSubmissionData(''), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('maps dogs.sex Male to dogGender D', async () => {
    // Arrange: show + club
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'show-1',
              name: 'Spring Trial',
              club_id: 'club-1',
              clubs: { name: 'Acme Club' },
            },
            error: null,
          }),
        };
      }
      if (table === 'people') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { first_name: 'Jane', last_name: 'Sec', email: 'jane@example.com' },
            error: null,
          }),
          in: vi.fn().mockReturnThis(),
        };
      }
      if (table === 'trials') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'trial-1',
                event_number: 'EV001',
                date: '2026-05-10',
                trial_number: '1',
                name: 'Trial 1',
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'classes') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'class-1',
                element: 'Container',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 120,
                trial_id: 'trial-1',
                name: 'Novice A Container',
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'entries') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'entry-1',
                dog_id: 'dog-1',
                class_id: 'class-1',
                trial_id: 'trial-1',
                armband: '101',
                search_time_seconds: 14.5,
                final_placement: 1,
                result_status: null,
                entry_status: 'accepted',
                check_in_status: 'present',
                run_order: 1,
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'dogs') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'dog-1',
                akc_number: 'HP12345601',
                sex: 'Male',
                owner_id: 'owner-1',
                name: 'Fluffy',
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'dog_registrations') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ dog_id: 'dog-1', registered_name: 'Acme Fluffy The First' }],
            error: null,
          }),
        };
      }
      // owners (people by id)
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'owner-1',
              first_name: 'Alice',
              last_name: 'Owner',
              street_address: '123 Main',
              city: 'Columbus',
              state: 'OH',
              zip_code: '43215',
              country: 'US',
            },
          ],
          error: null,
        }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const entry = result.current.data?.entries[0];
    expect(entry?.dogGender).toBe('D');
  });

  it('maps dogs.sex Female to dogGender B', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'show-1', name: 'T', club_id: null, clubs: null },
            error: null,
          }),
        };
      if (table === 'people')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockReturnThis(),
        };
      if (table === 'trials')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 't1', event_number: null, date: '2026-05-10', trial_number: '1', name: 'T1' },
            ],
            error: null,
          }),
        };
      if (table === 'classes')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'c1',
                element: 'Buried',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 90,
                trial_id: 't1',
                name: 'N',
              },
            ],
            error: null,
          }),
        };
      if (table === 'entries')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'e1',
                dog_id: 'd1',
                class_id: 'c1',
                trial_id: 't1',
                armband: '102',
                search_time_seconds: 20,
                final_placement: null,
                result_status: 'Q',
                entry_status: 'accepted',
                check_in_status: 'present',
                run_order: 1,
              },
            ],
            error: null,
          }),
        };
      if (table === 'dogs')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'd1', akc_number: 'HP99', sex: 'Female', owner_id: null, name: 'Bella' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries[0]?.dogGender).toBe('B');
  });

  it('uses dog_registrations.registered_name for dogRegisteredName', async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'shows')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: 'show-1', name: 'T', club_id: null, clubs: null },
            error: null,
          }),
        };
      if (table === 'people')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          in: vi.fn().mockReturnThis(),
        };
      if (table === 'trials')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [
              { id: 't1', event_number: null, date: '2026-05-10', trial_number: '1', name: 'T1' },
            ],
            error: null,
          }),
        };
      if (table === 'classes')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'c1',
                element: 'Container',
                level: 'Novice',
                section: 'A',
                time_limit_seconds: 90,
                trial_id: 't1',
                name: 'N',
              },
            ],
            error: null,
          }),
        };
      if (table === 'entries')
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'e1',
                dog_id: 'd1',
                class_id: 'c1',
                trial_id: 't1',
                armband: '101',
                search_time_seconds: 10,
                final_placement: null,
                result_status: 'Q',
                entry_status: 'accepted',
                check_in_status: 'present',
                run_order: 1,
              },
            ],
            error: null,
          }),
        };
      if (table === 'dogs')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'd1', akc_number: 'HP99', sex: 'Male', owner_id: null, name: 'CallName' }],
            error: null,
          }),
        };
      if (table === 'dog_registrations')
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({
            data: [{ dog_id: 'd1', registered_name: 'Registered Name Here' }],
            error: null,
          }),
        };
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useAKCSubmissionData('show-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.entries[0]?.dogRegisteredName).toBe('Registered Name Here');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail (file doesn't exist yet)**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useAKCSubmissionData.test.ts
```

Expected: FAIL — `Cannot find module '../useAKCSubmissionData'`.

- [ ] **Step 3: Create the hook**

```typescript
// apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';
import type {
  AKCSubmissionData,
  AKCSubmissionEntry,
  SubmissionShow,
  SubmissionTrial,
} from '@myk9/secretary';

export function useAKCSubmissionData(showId: string) {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: ['akc-submission-data', showId],
    queryFn: async (): Promise<AKCSubmissionData> => {
      // Round 1: show + club, secretary profile, trials — parallel
      const [showRes, secretaryRes, trialsRes] = await Promise.all([
        supabase.from('shows').select('id, name, club_id, clubs(name)').eq('id', showId).single(),
        supabase
          .from('people')
          .select('first_name, last_name, email')
          .eq('auth_user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('trials')
          .select('id, event_number, date, trial_number, name')
          .eq('show_id', showId)
          .is('deleted_at', null)
          .order('date'),
      ]);

      if (showRes.error) throw showRes.error;
      if (trialsRes.error) throw trialsRes.error;

      const showRow = showRes.data;
      const clubRow = showRow.clubs as { name: string } | null;
      const secretaryRow = secretaryRes.data;
      const trialRows = (trialsRes.data ?? []) as Array<{
        id: string;
        event_number: string | null;
        date: string;
        trial_number: string | null;
        name: string;
      }>;

      const show: SubmissionShow = {
        id: showRow.id as string,
        name: showRow.name as string,
        clubName: clubRow?.name ?? null,
        date: null,
        clubLicenseNumber: null,
        secretaryName: secretaryRow
          ? `${secretaryRow.first_name} ${secretaryRow.last_name}`.trim()
          : null,
        secretaryEmail: secretaryRow?.email ?? null,
      };

      const trials: SubmissionTrial[] = trialRows.map(t => ({
        id: t.id,
        trialNumber: t.trial_number ?? 1,
        date: t.date,
        judgeName: '',
        organization: 'AKC',
        sportType: 'scent_work',
        eventNumber: t.event_number,
      }));

      const trialIds = trialRows.map(t => t.id);

      if (trialIds.length === 0) {
        return { show, trials, entries: [] };
      }

      // Round 2: classes + entries — parallel
      const [classesRes, entriesRes] = await Promise.all([
        supabase
          .from('classes')
          .select('id, element, level, section, time_limit_seconds, trial_id, name')
          .in('trial_id', trialIds)
          .is('deleted_at', null),
        supabase
          .from('entries')
          .select(
            'id, dog_id, class_id, trial_id, armband, search_time_seconds, final_placement, result_status, entry_status, check_in_status, run_order'
          )
          .eq('show_id', showId)
          .is('deleted_at', null),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const classRows = (classesRes.data ?? []) as Array<{
        id: string;
        element: string | null;
        level: string | null;
        section: string | null;
        time_limit_seconds: number | null;
        trial_id: string;
        name: string;
      }>;
      const entryRows = (entriesRes.data ?? []) as Array<{
        id: string;
        dog_id: string | null;
        class_id: string | null;
        trial_id: string | null;
        armband: string | null;
        search_time_seconds: number | null;
        final_placement: number | null;
        result_status: string | null;
        entry_status: string | null;
        check_in_status: string | null;
        run_order: number | null;
      }>;

      const classMap = new Map(classRows.map(c => [c.id, c]));
      const validEntries = entryRows.filter(
        e => e.dog_id && e.class_id && classMap.has(e.class_id)
      );
      const dogIds = [...new Set(validEntries.map(e => e.dog_id!))] as string[];

      if (dogIds.length === 0) {
        return { show, trials, entries: [] };
      }

      // Round 3: dogs + dog registrations (AKC org) — parallel
      const [dogsRes, dogRegsRes] = await Promise.all([
        supabase.from('dogs').select('id, akc_number, sex, owner_id, name').in('id', dogIds),
        supabase
          .from('dog_registrations')
          .select('dog_id, registered_name')
          .in('dog_id', dogIds)
          .eq('organization', 'AKC'),
      ]);

      if (dogsRes.error) throw dogsRes.error;
      if (dogRegsRes.error) throw dogRegsRes.error;

      const dogMap = new Map(
        (
          (dogsRes.data ?? []) as Array<{
            id: string;
            akc_number: string | null;
            sex: string | null;
            owner_id: string | null;
            name: string;
          }>
        ).map(d => [d.id, d])
      );
      const dogRegMap = new Map(
        ((dogRegsRes.data ?? []) as Array<{ dog_id: string; registered_name: string | null }>).map(
          r => [r.dog_id, r.registered_name]
        )
      );

      const ownerIds = [
        ...new Set(
          [...dogMap.values()].map(d => d.owner_id).filter((id): id is string => id != null)
        ),
      ];

      // Round 4: owners
      const ownersRes = await supabase
        .from('people')
        .select('id, first_name, last_name, street_address, city, state, zip_code, country')
        .in('id', ownerIds);

      if (ownersRes.error) throw ownersRes.error;

      const ownerMap = new Map(
        (
          (ownersRes.data ?? []) as Array<{
            id: string;
            first_name: string;
            last_name: string;
            street_address: string | null;
            city: string | null;
            state: string | null;
            zip_code: string | null;
            country: string | null;
          }>
        ).map(o => [
          o.id,
          {
            name: `${o.first_name} ${o.last_name}`.trim(),
            address: {
              street: o.street_address,
              city: o.city,
              state: o.state,
              zip: o.zip_code,
              country: o.country,
            },
          },
        ])
      );

      // Build AKCSubmissionEntry array
      const entries: AKCSubmissionEntry[] = validEntries.map(e => {
        const cls = classMap.get(e.class_id!)!;
        const dog = dogMap.get(e.dog_id!);
        const owner = dog?.owner_id ? ownerMap.get(dog.owner_id) : null;
        const registeredName = dogRegMap.get(e.dog_id!) ?? null;

        const dogGender: 'D' | 'B' | null =
          dog?.sex === 'Male' ? 'D' : dog?.sex === 'Female' ? 'B' : null;

        return {
          // SubmissionEntry base fields
          dogName: dog?.name ?? '',
          breed: 'Unknown',
          registrationNumber: dog?.akc_number ?? null,
          handlerName: '',
          className: cls.name,
          element: cls.element ?? '',
          level: cls.level ?? '',
          section: cls.section ?? null,
          resultCode: e.result_status,
          searchTimeSeconds: e.search_time_seconds,
          totalFaults: null,
          finalPlacement: e.final_placement,
          armbandNumber: e.armband != null ? Number(e.armband) : 0,
          trialId: e.trial_id ?? '',
          classId: e.class_id ?? '',
          // AKCSubmissionEntry fields
          dogRegisteredName: registeredName,
          dogGender,
          ownerName: owner?.name ?? null,
          ownerAddress: owner?.address ?? null,
          timeLimitSeconds: cls.time_limit_seconds,
          entryStatus: e.entry_status,
          checkInStatus: e.check_in_status,
          resultStatus: e.result_status,
        };
      });

      return { show, trials, entries };
    },
    enabled: !!showId && !!user,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useAKCSubmissionData.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/queries/useAKCSubmissionData.ts \
        apps/myk9show/src/hooks/queries/__tests__/useAKCSubmissionData.test.ts
git commit -m "feat(myk9show): add useAKCSubmissionData hook"
```

---

## Task 4: Build `send-results` Edge Function

**Files:**

- Create: `supabase/functions/send-results/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
// supabase/functions/send-results/index.ts

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const resendApiKey = Deno.env.get('RESEND_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const ALLOWED_ORIGINS = [
  'https://myk9show.com',
  'https://www.myk9show.com',
  'https://app.myk9show.com',
  'https://myk9-platform-myk9show.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
];

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

// Server-side map: organization:sportType → submission email
// Client cannot override this — prevents email redirection abuse.
const SUBMISSION_EMAILS: Record<string, string> = {
  'AKC:scent_work': 'results@akc.org', // ⚠ confirm actual address before launch
};

const FROM_EMAIL = 'myK9Show <results@myk9show.com>';

interface SendResultsPayload {
  xml: string;
  filename: string;
  organization: string;
  sportType: string;
  secretaryEmail: string;
}

Deno.serve(async req => {
  const corsHeaders = getCorsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const jsonResponse = (body: object, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Verify caller is authenticated via Supabase JWT
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '') ?? '';
  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser(token);

  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!resendApiKey) {
    console.error('send-results: RESEND_API_KEY not configured');
    return jsonResponse({ error: 'Email service not configured' }, 503);
  }

  let body: SendResultsPayload;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { xml, filename, organization, sportType, secretaryEmail } = body;

  if (!xml || !filename || !organization || !sportType || !secretaryEmail) {
    return jsonResponse(
      { error: 'Missing required fields: xml, filename, organization, sportType, secretaryEmail' },
      400
    );
  }

  const toEmail = SUBMISSION_EMAILS[`${organization.toUpperCase()}:${sportType.toLowerCase()}`];

  if (!toEmail) {
    return jsonResponse(
      { error: `No submission email configured for ${organization}:${sportType}` },
      400
    );
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [toEmail],
      cc: [secretaryEmail],
      reply_to: secretaryEmail,
      subject: `Electronic Results — ${filename}`,
      html: `<p>Electronic results submission from myK9Show attached.</p>`,
      attachments: [
        {
          filename,
          content: btoa(unescape(encodeURIComponent(xml))),
        },
      ],
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text();
    console.error('send-results: Resend error:', errText);
    return jsonResponse({ error: 'Failed to send email' }, 502);
  }

  return jsonResponse({ success: true });
});
```

- [ ] **Step 2: Confirm AKC submission email address before deploying**

**BLOCKING** — `results@akc.org` in `SUBMISSION_EMAILS` is unconfirmed. Before deploying, verify the actual AKC electronic results submission address (check the AKC Trial Secretary Handbook or contact AKC directly). Update the constant in the edge function with the confirmed address. Sending to a wrong address means AKC never receives the results.

- [ ] **Step 3: Deploy the function**

```bash
cd /path/to/myk9-platform
supabase functions deploy send-results --no-verify-jwt
```

Expected: `send-results` function deployed successfully.

- [ ] **Step 4: Smoke test the deployed function**

Confirm the function rejects unauthenticated requests:

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/send-results \
  -H "Content-Type: application/json" \
  -d '{}'
# Expected: 401
```

Also test missing-fields validation with a valid dev JWT:

```bash
curl -s -w "\n%{http_code}" \
  -X POST https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/send-results \
  -H "Authorization: Bearer <dev-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"xml":"<x/>","filename":"test.xml","organization":"AKC","sportType":"scent_work"}'
# Expected: 400 (missing secretaryEmail)
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-results/index.ts
git commit -m "feat(functions): add send-results edge function for AKC XML email submission"
```

---

## Task 5: Wire `ResultsSubmissionPage` to real data

**Files:**

- Modify: `apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx`
- Modify: `apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx`

- [ ] **Step 1: Update the test file first (TDD)**

```typescript
// apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import ResultsSubmissionPage from '../ResultsSubmissionPage';

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const mockHistoryData = vi.hoisted(() => ({
  rows: [] as {
    id: string;
    show_id: string;
    trial_id: string | null;
    organization: string;
    sport_type: string;
    submitted_at: string;
    submitted_by: string | null;
    xml_payload: string | null;
    status: 'pending' | 'sent' | 'failed';
  }[],
}));

const mockAKCData = vi.hoisted(() => ({
  value: null as import('@myk9/secretary').AKCSubmissionData | null,
  isLoading: false,
  isError: false,
  isSuccess: true,
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    selectedShowId: 'show-1',
    shows: [
      { id: 'show-1', name: 'Spring Scent Trial' },
      { id: 'show-2', name: 'Fall Classic' },
    ],
    selectShow: vi.fn(),
  }),
}));

vi.mock('@myk9/secretary', async () => {
  const actual = await vi.importActual<typeof import('@myk9/secretary')>('@myk9/secretary');
  return {
    ...actual,
    listFormatters: () => [
      {
        organization: 'AKC',
        sportType: 'scent_work',
        submissionEmail: 'results@akc.org',
        formatXml: () => '<?xml version="1.0"?><sender xmlns="http://www.akc.org"></sender>',
      },
    ],
    AKCScentWorkFormatter: {
      organization: 'AKC',
      sportType: 'scent_work',
      submissionEmail: 'results@akc.org',
      formatXml: () => '<?xml version="1.0"?><sender xmlns="http://www.akc.org"></sender>',
    },
  };
});

vi.mock('@/hooks/queries/useAKCSubmissionData', () => ({
  useAKCSubmissionData: () => mockAKCData,
}));

vi.mock('@/hooks/mutations/useResultSubmission', () => ({
  useResultSubmission: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useResultSubmissions: () => ({
    data: mockHistoryData.rows,
    isLoading: false,
  }),
}));

const mockInvoke = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: mockInvoke,
    },
  },
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResultsSubmissionPage', () => {
  beforeEach(() => {
    mockHistoryData.rows = [];
    mockAKCData.value = null;
    mockAKCData.isLoading = false;
    mockAKCData.isError = false;
    mockAKCData.isSuccess = true;
    mockInvoke.mockResolvedValue({ data: { success: true }, error: null });
    vi.clearAllMocks();
  });

  it('renders the page heading', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByText('Results Submission')).toBeInTheDocument());
  });

  it('renders the show selector', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('show-selector')).toBeInTheDocument());
  });

  it('renders the organization selector', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('org-selector')).toBeInTheDocument());
  });

  it('renders the XML preview area', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('xml-preview')).toBeInTheDocument());
  });

  it('renders the Download XML button', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('download-btn')).toBeInTheDocument());
  });

  it('renders the Send to AKC button', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('send-btn')).toBeInTheDocument());
  });

  it('shows no pre-flight warning when no entries are missing AKC numbers', async () => {
    mockAKCData.value = {
      show: { id: 'show-1', name: 'T', clubName: null, date: null, clubLicenseNumber: null, secretaryName: 'Jane', secretaryEmail: 'jane@example.com' },
      trials: [],
      entries: [
        {
          dogName: 'Fluffy', breed: 'X', registrationNumber: 'HP123', handlerName: '', className: 'N', element: 'Container', level: 'Novice', section: 'A', resultCode: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, armbandNumber: 101, trialId: 't1', classId: 'c1',
          dogRegisteredName: null, dogGender: 'B', ownerName: null, ownerAddress: null, timeLimitSeconds: null, entryStatus: 'accepted', checkInStatus: 'present', resultStatus: null,
        },
      ],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.queryByTestId('preflight-warning')).not.toBeInTheDocument());
  });

  it('shows pre-flight warning when entries are missing AKC registration numbers', async () => {
    mockAKCData.value = {
      show: { id: 'show-1', name: 'T', clubName: null, date: null, clubLicenseNumber: null, secretaryName: 'Jane', secretaryEmail: 'jane@example.com' },
      trials: [],
      entries: [
        {
          dogName: 'Fluffy', breed: 'X', registrationNumber: null, handlerName: '', className: 'N', element: 'Container', level: 'Novice', section: 'A', resultCode: null, searchTimeSeconds: null, totalFaults: null, finalPlacement: null, armbandNumber: 101, trialId: 't1', classId: 'c1',
          dogRegisteredName: null, dogGender: 'B', ownerName: null, ownerAddress: null, timeLimitSeconds: null, entryStatus: 'accepted', checkInStatus: 'present', resultStatus: null,
        },
      ],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    await waitFor(() =>
      expect(screen.getByTestId('preflight-warning')).toBeInTheDocument()
    );
    expect(screen.getByTestId('preflight-warning').textContent).toContain('1');
  });

  it('"Send to AKC" calls supabase.functions.invoke with send-results', async () => {
    mockAKCData.value = {
      show: { id: 'show-1', name: 'Spring', clubName: 'Club', date: null, clubLicenseNumber: null, secretaryName: 'Jane', secretaryEmail: 'jane@example.com' },
      trials: [],
      entries: [],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith(
        'send-results',
        expect.objectContaining({
          body: expect.objectContaining({
            organization: 'AKC',
            sportType: 'scent_work',
            secretaryEmail: 'jane@example.com',
          }),
        })
      );
    });
  });

  it('shows empty submission history message when no history exists', async () => {
    render(<ResultsSubmissionPage />);
    await waitFor(() =>
      expect(screen.getByText('No submissions recorded for this show.')).toBeInTheDocument()
    );
  });

  it('renders submission history table when rows exist', async () => {
    mockHistoryData.rows = [
      {
        id: 'sub-1',
        show_id: 'show-1',
        trial_id: null,
        organization: 'AKC',
        sport_type: 'scent_work',
        submitted_at: '2026-05-10T12:00:00Z',
        submitted_by: null,
        xml_payload: null,
        status: 'sent',
      },
    ];

    render(<ResultsSubmissionPage />);
    await waitFor(() => expect(screen.getByTestId('history-table')).toBeInTheDocument());
  });

  it('shows confirmation dialog before sending', async () => {
    mockAKCData.value = {
      show: { id: 'show-1', name: 'Spring', clubName: 'Club', date: null, clubLicenseNumber: null, secretaryName: 'Jane', secretaryEmail: 'jane@example.com' },
      trials: [],
      entries: [],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    // Dialog appears — invoke NOT called yet
    expect(await screen.findByTestId('send-confirm-dialog')).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('sends only after confirmation', async () => {
    mockAKCData.value = {
      show: { id: 'show-1', name: 'Spring', clubName: 'Club', date: null, clubLicenseNumber: null, secretaryName: 'Jane', secretaryEmail: 'jane@example.com' },
      trials: [],
      entries: [],
    } as import('@myk9/secretary').AKCSubmissionData;

    render(<ResultsSubmissionPage />);
    const sendBtn = await screen.findByTestId('send-btn');
    fireEvent.click(sendBtn);

    const confirmBtn = await screen.findByTestId('send-confirm-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith('send-results', expect.anything()));
  });
});
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx
```

Expected: `send-btn`, `preflight-warning` tests FAIL — those `data-testid` values don't exist yet.

- [ ] **Step 3: Rewrite `ResultsSubmissionPage/index.tsx`**

```typescript
// apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useShowStore } from '@/store/showStore';
import { supabase } from '@/services/database/supabaseClient';
import { listFormatters, AKCScentWorkFormatter } from '@myk9/secretary';
import { useAKCSubmissionData } from '@/hooks/queries/useAKCSubmissionData';
import { useResultSubmission, useResultSubmissions } from '@/hooks/mutations/useResultSubmission';
import type { ResultSubmissionRow } from '@/hooks/mutations/useResultSubmission';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilename(showName: string): string {
  const slug = showName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14);
  return `${slug}-Results_${ts}.xml`;
}

function downloadXml(xml: string, filename: string): void {
  const blob = new Blob([xml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusVariant(
  status: ResultSubmissionRow['status']
): 'default' | 'secondary' | 'destructive' {
  if (status === 'sent') return 'default';
  if (status === 'failed') return 'destructive';
  return 'secondary';
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResultsSubmissionPage() {
  const { shows, selectedShowId, selectShow } = useShowStore();

  const formatters = listFormatters();
  const [formatterKey, setFormatterKey] = useState<string>(
    formatters.length > 0 ? `${formatters[0].organization}:${formatters[0].sportType}` : ''
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const activeFormatter = formatters.find(
    f => `${f.organization}:${f.sportType}` === formatterKey
  );

  const selectedShow = shows.find(s => s.id === selectedShowId) ?? null;
  const isAKCScentWork =
    activeFormatter?.organization === 'AKC' && activeFormatter?.sportType === 'scent_work';

  // Auto-select first show
  useEffect(() => {
    if (!selectedShowId && shows.length > 0) {
      selectShow(shows[0].id);
    }
  }, [selectedShowId, shows, selectShow]);

  // Fetch real AKC data when AKC scent work formatter is selected
  const {
    data: akcData,
    isLoading: isAKCLoading,
  } = useAKCSubmissionData(isAKCScentWork ? (selectedShowId ?? '') : '');

  // Generate XML preview
  const xmlPreview =
    isAKCScentWork && akcData
      ? AKCScentWorkFormatter.formatXml(akcData)
      : isAKCScentWork && isAKCLoading
        ? ''
        : '';

  // Pre-flight: count entries missing AKC reg numbers
  const missingAKCCount = akcData
    ? akcData.entries.filter(e => !e.registrationNumber).length
    : 0;

  const filename = selectedShow ? buildFilename(selectedShow.name) : 'results.xml';

  const {
    mutate: recordSubmission,
  } = useResultSubmission(selectedShowId);

  const { data: history = [], isLoading: historyLoading } = useResultSubmissions(
    selectedShowId ?? ''
  );

  const handleDownload = () => {
    if (!xmlPreview) return;
    downloadXml(xmlPreview, filename);
  };

  const handleSend = async () => {
    if (!xmlPreview || !activeFormatter || !selectedShowId || !akcData) return;

    setSendError(null);
    setSendSuccess(false);
    setIsSending(true);

    try {
      const { error } = await supabase.functions.invoke('send-results', {
        body: {
          xml: xmlPreview,
          filename,
          organization: activeFormatter.organization,
          sportType: activeFormatter.sportType,
          secretaryEmail: akcData.show.secretaryEmail ?? '',
        },
      });

      if (error) throw error;

      // Auto-record submission on success
      recordSubmission({
        show_id: selectedShowId,
        organization: activeFormatter.organization,
        sport_type: activeFormatter.sportType,
        xml_payload: xmlPreview,
        status: 'sent',
      });

      setSendSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send. Please download and email manually.';
      setSendError(msg);
    } finally {
      setIsSending(false);
    }
  };

  const handleMarkSubmitted = () => {
    if (!selectedShowId || !activeFormatter) return;
    recordSubmission({
      show_id: selectedShowId,
      organization: activeFormatter.organization,
      sport_type: activeFormatter.sportType,
      xml_payload: xmlPreview || null,
      status: 'sent',
    });
  };

  return (
    <div className="container mx-auto py-6 space-y-8" data-testid="results-submission-page">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Results Submission</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Generate and submit electronic results to sanctioning organizations.
          </p>
        </div>

        {shows.length > 0 && (
          <Select value={selectedShowId ?? ''} onValueChange={selectShow}>
            <SelectTrigger className="w-[240px]" data-testid="show-selector">
              <SelectValue placeholder="Select show">
                {selectedShow?.name ?? 'Select show'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {shows.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="org-select">
            Organization
          </label>
          <Select value={formatterKey} onValueChange={setFormatterKey}>
            <SelectTrigger id="org-select" className="w-[220px]" data-testid="org-selector">
              <SelectValue placeholder="Select organization" />
            </SelectTrigger>
            <SelectContent>
              {formatters.map(f => (
                <SelectItem
                  key={`${f.organization}:${f.sportType}`}
                  value={`${f.organization}:${f.sportType}`}
                >
                  {f.organization} — {f.sportType.replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 pb-0.5">
          {activeFormatter?.submissionEmail && (
            <>
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={!xmlPreview || isSending}
                data-testid="send-btn"
              >
                {isSending ? 'Sending...' : `Send to ${activeFormatter.organization}`}
              </Button>
              <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
                <AlertDialogContent data-testid="send-confirm-dialog">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send results to {activeFormatter.organization}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will email the XML file to {activeFormatter.organization} and CC your secretary address. This action cannot be undone.
                      {akcData && akcData.entries.length > 0 && (
                        <> {akcData.entries.length} entries will be included.</>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleSend}
                      data-testid="send-confirm-btn"
                    >
                      Send
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={!xmlPreview}
            data-testid="download-btn"
          >
            Download XML
          </Button>
          <Button
            variant="outline"
            onClick={handleMarkSubmitted}
            disabled={!selectedShowId || !activeFormatter}
            data-testid="mark-submitted-btn"
          >
            Mark as Submitted
          </Button>
        </div>
      </div>

      {/* Send feedback */}
      {sendSuccess && (
        <p className="text-sm text-green-600" data-testid="send-success">
          Results sent successfully. A copy was CC&apos;d to your email.
        </p>
      )}
      {sendError && (
        <p className="text-sm text-destructive" data-testid="send-error">
          {sendError}
        </p>
      )}

      {/* Pre-flight warning */}
      {missingAKCCount > 0 && (
        <div
          className="rounded-md border border-yellow-400 bg-yellow-50 px-4 py-3 text-sm text-yellow-800"
          data-testid="preflight-warning"
        >
          {missingAKCCount} {missingAKCCount === 1 ? 'entry is' : 'entries are'} missing AKC
          registration numbers and will export with a blank akcDogRegnum. Verify dog
          registrations before submitting.
        </div>
      )}

      {/* XML preview */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium">XML Preview</h2>
        <Textarea
          readOnly
          value={isAKCLoading ? 'Fetching show data...' : xmlPreview}
          placeholder="Select a show and organization to preview the XML."
          className="font-mono text-xs min-h-[220px] resize-y"
          data-testid="xml-preview"
        />
      </div>

      {/* Submission history */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">Submission History</h2>

        {historyLoading ? (
          <p className="text-sm text-muted-foreground">Loading history...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions recorded for this show.</p>
        ) : (
          <Table data-testid="history-table">
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Sport</TableHead>
                <TableHead>Submitted At</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(row => (
                <TableRow key={row.id}>
                  <TableCell>{row.organization}</TableCell>
                  <TableCell>{row.sport_type.replace(/_/g, ' ')}</TableCell>
                  <TableCell>{formatDate(row.submitted_at)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run all affected tests**

```bash
cd apps/myk9show && npx vitest run src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full myk9show test suite**

```bash
cd apps/myk9show && pnpm test
```

Expected: all tests PASS (no regressions). If the suite hangs after 60 seconds, stop and report — known timeout issue per CLAUDE.md.

- [ ] **Step 6: Run typecheck across the monorepo**

```bash
cd /path/to/myk9-platform && pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/secretary/ResultsSubmissionPage/index.tsx \
        apps/myk9show/src/pages/secretary/__tests__/ResultsSubmissionPage.test.tsx
git commit -m "feat(myk9show): wire ResultsSubmissionPage to real AKC data and add Send to AKC button"
```

---

## Self-Review Checklist

**Spec coverage:**

- ✅ Type changes (Task 1) — `SubmissionData.trials[]`, `trialId`/`classId` on entries, `secretaryName`/`secretaryEmail` on show, `eventNumber` on trial, `submissionEmail` on formatter, `AKCSubmissionEntry`, `AKCSubmissionData`
- ✅ `AKCScentWorkFormatter` real implementation with all mappings (Task 2)
- ✅ `useAKCSubmissionData` hook with 4-round query sequence (Task 3)
- ✅ `send-results` edge function — JWT auth, server-side email map, Resend CC (Task 4)
- ✅ `ResultsSubmissionPage` — real data, Send button, pre-flight warning, download (Task 5)
- ✅ Tests: formatter unit tests (Task 2), hook tests (Task 3), page tests (Task 5)
- ✅ `dog_registrations` filtered by `organization = 'AKC'` (Task 3, Step 3)
- ✅ All entries (including withdrawn) fetched in hook — not filtered out
