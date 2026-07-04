import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * UX walk remediation 2.A — migration-completeness guard.
 *
 * Show / trial / entry calendar dates must be rendered through the shared
 * `@/lib/format/dates` module, never re-derived inline with
 * `new Date('YYYY-MM-DD').toLocaleDateString()` (which parses as UTC midnight
 * and renders a day early for western-hemisphere viewers). This test pins the
 * migrated surfaces so a future edit can't quietly reintroduce inline
 * date-only formatting — it fails CI instead.
 *
 * `new Date(...).getTime()` for sorting/comparison is fine (timezone-agnostic);
 * only the display formatter `.toLocaleDateString(` is forbidden here.
 */
const MIGRATED_FILES = [
  'components/shows/ShowInfoCard.tsx',
  'components/clubs/ClubDetails/UpcomingShowsTab.tsx',
  'components/clubs/ClubDetails/PastShowsTab.tsx',
  'components/shows/ShowDetails/ShowGroupedSidebar.tsx',
  'components/shows/tabs/ClassesTab.tsx',
  'features/show-map/showMapTree.ts',
];

function readSource(relPath: string): string {
  return readFileSync(join(__dirname, '..', relPath), 'utf8');
}

describe('2.A date-format migration completeness', () => {
  it.each(MIGRATED_FILES)('%s imports the shared date module', relPath => {
    expect(readSource(relPath)).toContain("@/lib/format/dates");
  });

  it.each(MIGRATED_FILES)('%s renders no inline .toLocaleDateString()', relPath => {
    expect(readSource(relPath)).not.toContain('.toLocaleDateString(');
  });
});
