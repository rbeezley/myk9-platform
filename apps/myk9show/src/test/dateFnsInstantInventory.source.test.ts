import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MYK9-384 — `format(new Date(x))` inventory guard.
 *
 * `new Date(x)` builds an INSTANT. For a DATE-typed column — which arrives
 * either bare (`2026-08-01`) or as the midnight-UTC timestamp it round-trips
 * as (`2026-08-01T00:00:00+00:00`) — that renders the PREVIOUS day for every
 * viewer west of UTC. MYK9-384 was the fourth sighting of that bug, and the
 * three fixes before it each swept only the helper they were reported
 * against (`formatShortDate`, `formatDateMMDDYYYY`), so this third mechanism
 * — date-fns `format(new Date(...))` — survived all of them and kept the
 * clone-show picker a day early.
 *
 * The remaining call sites are NOT interchangeable, which is why this is an
 * inventory and not a ban:
 *
 *   - The show-creation wizard stores `date.toISOString()` from a locally
 *     picked Date, so its values are genuine instants encoding local
 *     midnight. Reading those as calendar days would be WRONG — east of UTC
 *     a local-midnight pick lands on the previous UTC day.
 *   - `wizardTrial.dateTime` on the write path is formatted from that same
 *     local Date into the calendar day the user chose.
 *   - The rest are `new Date()` (now) or a real timestamptz.
 *
 * So each occurrence is declared below with the reason it is an instant. A
 * NEW occurrence fails this test until someone adds it here and states which
 * it is — the point being that the choice is made deliberately rather than
 * by copying the nearest line. If the value is a calendar date, do not add
 * it: route it through `@/lib/format/dates` instead.
 *
 * Declared as file -> the distinct `new Date(<arg>)` arguments in that file,
 * matched against source with comments STRIPPED, so prose mentioning the
 * pattern can neither satisfy nor trip the scan.
 */
const DECLARED_INSTANT_CALL_SITES: Record<string, string[]> = {
  // Wizard-local ISO strings built by `date.toISOString()` from a picked
  // local Date (see steps/sections/DatesEntrySection.tsx) — instants that
  // encode local midnight, so local rendering round-trips correctly.
  'components/shows/wizard/steps/ReviewStep.tsx': [
    'show.endDate',
    'show.entryCloseDate',
    'show.entryOpenDate',
    'show.startDate',
    'trial.dateTime',
  ],
  // `new Date(now)` — an instant, deliberately rendered in US/Eastern.
  'features/admin-overview/easternDay.ts': ['now'],
  // `new Date()` — the current instant, to derive today's local key.
  'features/at-show/useRingsideEntryShows.ts': [''],
  // A show-incident timestamptz, rendered WITH a time (`timeStyle: 'short'`).
  'features/show-workbench/IncidentLogCard.tsx': ['value'],
  // Write path: formats the wizard's local Date into the chosen calendar day
  // / clock time for persistence.
  'pages/secretary/ShowCreationWizard/buildCreateShowPayload.ts': ['wizardTrial.dateTime'],
  'pages/secretary/ShowCreationWizard/showCreationWizardTransformers.ts': ['wizardTrial.dateTime'],
  'pages/secretary/ShowCreationWizard/useShowCreationWizardActions.ts': ['wizardTrial.dateTime'],
};

const SRC = join(__dirname, '..');
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
// Strip from `//` to end of line, NOT the whole line: a call carrying a
// trailing comment must stay visible to the scan.
const LINE_COMMENT = /\/\/[^\n]*$/gm;
const CALL = /format\(\s*new Date\(([^)]*)\)/g;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      sourceFiles(full, acc);
      continue;
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    acc.push(full);
  }
  return acc;
}

function scan(): Record<string, string[]> {
  const found: Record<string, string[]> = {};
  for (const file of sourceFiles(SRC)) {
    const rel = file
      .slice(SRC.length + 1)
      .split('\\')
      .join('/');
    // `src/test/**` is test scaffolding, not shipped UI.
    if (rel.startsWith('test/')) continue;
    const stripped = readFileSync(file, 'utf8')
      .replace(BLOCK_COMMENT, '')
      .replace(LINE_COMMENT, '');
    const args = [...stripped.matchAll(CALL)].map(m => (m[1] ?? '').trim());
    if (args.length > 0) found[rel] = [...new Set(args)].sort();
  }
  return found;
}

describe('MYK9-384 format(new Date(...)) inventory', () => {
  it('the scanner is not vacuous — it finds the known instant call sites', () => {
    // Guards the whole test: a broken regex or walker would report {} and
    // every assertion below would pass while checking nothing.
    const found = scan();
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(5);
    expect(found['components/shows/wizard/steps/ReviewStep.tsx']).toContain('show.startDate');
  });

  it('every occurrence is declared as a deliberate instant', () => {
    expect(scan()).toEqual(DECLARED_INSTANT_CALL_SITES);
  });

  it('the calendar-date surfaces fixed by MYK9-384 stay off the list', () => {
    const found = scan();
    for (const rel of [
      'components/shows/wizard/steps/CloneFromShowCombobox.tsx',
      'pages/secretary/SecretaryDashboardPage/TaskRow.tsx',
      'pages/club-admin/ClubMemberTables.tsx',
    ]) {
      expect(found[rel]).toBeUndefined();
      expect(readFileSync(join(SRC, rel), 'utf8')).toContain('@/lib/format/dates');
    }
  });
});
