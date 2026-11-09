import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHONE_WALK_PATHS,
  WALK_CONFIG,
  WALK_JOB,
  WALK_SPEC,
  WALK_WORKFLOW,
  configRunsWalk,
  missingPaths,
  walkMatches,
  walkVerdict,
} from './phone-walk';

const root = resolve(__dirname, '../..');
const inTree = (path: string) => existsSync(resolve(root, path));
const walkJob = (bucket: string) => ({ name: WALK_JOB, workflow: WALK_WORKFLOW, bucket });

describe('PHONE_WALK_PATHS', () => {
  it('names only paths that exist', () => {
    expect(missingPaths(inTree)).toEqual([]);
  });

  it('reports a declared path that is gone', () => {
    const paths = [...PHONE_WALK_PATHS, 'packages/renamed-away/'];
    expect(missingPaths(inTree, paths)).toEqual(['packages/renamed-away/']);
  });
});

describe('walkMatches', () => {
  it('matches files under a declared directory and a declared file', () => {
    const files = [
      'packages/ringside/src/components/DogCard.tsx',
      'apps/myk9show/src/components/entries/management/checkInDesk/CheckInDesk.tsx',
      'apps/myk9show/src/hooks/useScoresheetRingMove.ts',
      WALK_SPEC,
    ];
    expect(walkMatches(files)).toEqual(files);
  });

  it('matches every source file the fixes that motivated the walk touched', () => {
    // MYK9-1761/1762 (c44533031), MYK9-1778 (3b6e76a6b), MYK9-1779 (b8f552031).
    const files = [
      'apps/myk9show/src/features/at-show/atShowDataAdapter.ts',
      'apps/myk9show/src/features/at-show/useAtShowScoresheet.ts',
      'apps/myk9show/src/hooks/useScoresheetRingMove.ts',
      'apps/myk9show/src/pages/scoring/ScoresheetPage.tsx',
      'apps/myk9show/src/services/replication/ReplicatedEntriesTable.ts',
      'apps/myk9show/src/services/replication/entryRingTime.ts',
      'apps/myk9show/src/utils/checkInTransitions.ts',
    ];
    expect(walkMatches(files)).toEqual(files);
  });

  it('does not match other surfaces or a sibling with a longer name', () => {
    expect(
      walkMatches([
        'apps/myk9show/src/features/billing/Invoice.tsx',
        'apps/myk9show/src/hooks/useScoresheetRingMove.test.ts',
        'packages/ringside-extras/index.ts',
        'docs/plan-workflow-speedup.md',
      ])
    ).toEqual([]);
  });
});

describe('configRunsWalk', () => {
  it('is true for the suite CI runs today', () => {
    expect(configRunsWalk(readFileSync(resolve(root, WALK_CONFIG), 'utf8'))).toBe(true);
  });

  it('is false when the walk is only mentioned in a comment', () => {
    const source = `// '**/ringsidePhoneWalk.spec.ts' used to run here\ntestMatch: ['**/batch3Scoring.spec.ts'],`;
    expect(configRunsWalk(source)).toBe(false);
  });
});

describe('walkVerdict', () => {
  it('is green only when the walk job passed', () => {
    expect(walkVerdict([walkJob('pass')]).code).toBe(0);
  });

  it('is red when the walk job failed or was cancelled', () => {
    expect(walkVerdict([walkJob('fail')]).code).toBe(1);
    expect(walkVerdict([walkJob('cancel')]).code).toBe(1);
  });

  it('is not a verdict while the job is pending, skipped or absent', () => {
    expect(walkVerdict([walkJob('pending')]).code).toBe(3);
    expect(walkVerdict([walkJob('skipping')]).code).toBe(3);
    expect(walkVerdict([]).code).toBe(3);
  });

  it('ignores a job of the same name in another workflow', () => {
    expect(walkVerdict([{ name: WALK_JOB, workflow: 'CI', bucket: 'pass' }]).code).toBe(3);
  });
});
