import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHONE_WALK_PATHS,
  WALK_CONFIG,
  WALK_JOB,
  WALK_STEP,
  WALK_WORKFLOW_FILE,
  currentWalkRun,
  parseJobLink,
  workflowRunsWalkStep,
  WALK_SPEC,
  WALK_WORKFLOW,
  configRunsWalk,
  missingPaths,
  readFlag,
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

  it('is false when the walk is commented out inside the list', () => {
    const source = `testMatch: [\n  '**/batch3Scoring.spec.ts',\n  // '**/ringsidePhoneWalk.spec.ts',\n],`;
    expect(configRunsWalk(source)).toBe(false);
  });
});

describe('readFlag', () => {
  it('reads a value and reports an absent flag as undefined', () => {
    expect(readFlag(['--pr', '12'], '--pr')).toBe('12');
    expect(readFlag(['--pr', '12'], '--base')).toBeUndefined();
  });

  it('throws when a flag has no value, so a typo is never read as "no PR"', () => {
    expect(() => readFlag(['--pr'], '--pr')).toThrow('--pr needs a value');
    expect(() => readFlag(['--base', '--pr', '5'], '--base')).toThrow('--base needs a value');
  });
});

const LINK = 'https://github.com/o/r/actions/runs/10/job/20';
const walkRun = (bucket: string, link = LINK) => ({ ...walkJob(bucket), link });
const step = (status: string, conclusion: string | null, name = WALK_STEP) => ({
  name,
  status,
  conclusion,
});
// An unrelated spec step failed: the job is red, the walk step is not.
const unrelatedRed = step(
  'completed',
  'failure',
  'Scoring persistence, paperwork and time-display parity'
);

describe('walkVerdict', () => {
  it('is green when the walk step passed, even if an unrelated spec failed the job', () => {
    expect(walkVerdict([walkRun('fail')], [step('completed', 'success'), unrelatedRed]).code).toBe(
      0
    );
    expect(walkVerdict([walkRun('pass')], [step('completed', 'success')]).code).toBe(0);
  });

  it('is red when the walk step failed or was cancelled, whatever the others did', () => {
    expect(walkVerdict([walkRun('fail')], [step('completed', 'failure')]).code).toBe(1);
    expect(walkVerdict([walkRun('cancel')], [step('completed', 'cancelled')]).code).toBe(1);
    expect(
      walkVerdict([walkRun('fail')], [step('completed', 'timed_out'), unrelatedRed]).code
    ).toBe(1);
  });

  it('is red when the walk step was skipped in a finished job (setup failed before it)', () => {
    expect(walkVerdict([walkRun('fail')], [step('completed', 'skipped')]).code).toBe(1);
  });

  it('is not a verdict while the walk has not finished', () => {
    expect(walkVerdict([walkRun('pending')], [step('in_progress', null)]).code).toBe(3);
    expect(walkVerdict([walkRun('pending')], [step('pending', null)]).code).toBe(3);
    expect(walkVerdict([walkRun('pending')], []).code).toBe(3);
    expect(walkVerdict([]).code).toBe(3);
  });

  it('fails closed: unreadable steps or a missing walk step in a finished job is code 2', () => {
    expect(walkVerdict([walkRun('pass')], null).code).toBe(2);
    expect(walkVerdict([walkRun('pass')]).code).toBe(2);
    expect(walkVerdict([walkRun('pass')], [unrelatedRed]).code).toBe(2);
    expect(walkVerdict([walkRun('pass')], []).code).toBe(2);
  });

  it('ignores a job of the same name in another workflow', () => {
    const other = { name: WALK_JOB, workflow: 'CI', bucket: 'pass', link: LINK };
    expect(walkVerdict([other], [step('completed', 'success')]).code).toBe(3);
  });

  it('judges the newest attempt of the job (highest job id)', () => {
    const oldRed = walkRun('fail', 'https://github.com/o/r/actions/runs/10/job/20');
    const newGreen = walkRun('pass', 'https://github.com/o/r/actions/runs/10/job/30');
    expect(currentWalkRun([oldRed, newGreen])).toBe(newGreen);
  });
});

describe('parseJobLink', () => {
  it('reads the repo and job id, and rejects anything else', () => {
    expect(parseJobLink(LINK)).toEqual({ repo: 'o/r', jobId: '20' });
    expect(parseJobLink('https://example.com/x')).toBeNull();
    expect(parseJobLink(undefined)).toBeNull();
  });
});

describe('workflowRunsWalkStep', () => {
  it('is true for the workflow CI runs today', () => {
    expect(workflowRunsWalkStep(readFileSync(resolve(root, WALK_WORKFLOW_FILE), 'utf8'))).toBe(
      true
    );
  });

  it('is false when the step is renamed, or no longer runs the walk spec', () => {
    const base = `      - name: ${WALK_STEP}\n        run: pnpm exec playwright test ringsidePhoneWalk\n      - name: next\n`;
    expect(workflowRunsWalkStep(base)).toBe(true);
    expect(workflowRunsWalkStep(base.replace(WALK_STEP, 'Walk'))).toBe(false);
    expect(workflowRunsWalkStep(base.replace('ringsidePhoneWalk', 'batch3Scoring'))).toBe(false);
    expect(
      workflowRunsWalkStep(
        base.replace('run: pnpm exec playwright test ringsidePhoneWalk', '# ringsidePhoneWalk')
      )
    ).toBe(false);
  });

  it('is false when the step may fail without failing (continue-on-error)', () => {
    const base = `      - name: ${WALK_STEP}\n        run: pnpm exec playwright test ringsidePhoneWalk\n      - name: next\n`;
    const withCoe = base.replace('        run:', '        continue-on-error: true\n        run:');
    expect(workflowRunsWalkStep(withCoe)).toBe(false);
  });
});
