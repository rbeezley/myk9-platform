import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasQuietRollbackWindow, isScoringWorkerQuery } from './loadTeardown';

describe('load teardown safety', () => {
  it('recognizes only the controlled scoring RPC as a scoring worker', () => {
    expect(isScoringWorkerQuery('SELECT public.ringside_update_entry($1, $2, $3)')).toBe(true);
    expect(isScoringWorkerQuery('SELECT public.entries_replica($1)')).toBe(false);
  });

  it('requires zero workers and three unchanged rollback samples', () => {
    expect(
      hasQuietRollbackWindow([
        { scoringWorkers: 2, rollbackCount: 100 },
        { scoringWorkers: 0, rollbackCount: 101 },
        { scoringWorkers: 0, rollbackCount: 101 },
        { scoringWorkers: 0, rollbackCount: 101 },
      ])
    ).toBe(true);
  });

  it('rejects an active worker or changing rollback counter', () => {
    expect(
      hasQuietRollbackWindow([
        { scoringWorkers: 0, rollbackCount: 100 },
        { scoringWorkers: 1, rollbackCount: 100 },
        { scoringWorkers: 0, rollbackCount: 100 },
        { scoringWorkers: 0, rollbackCount: 100 },
      ])
    ).toBe(false);
    expect(
      hasQuietRollbackWindow([
        { scoringWorkers: 0, rollbackCount: 100 },
        { scoringWorkers: 0, rollbackCount: 101 },
        { scoringWorkers: 0, rollbackCount: 102 },
        { scoringWorkers: 0, rollbackCount: 103 },
      ])
    ).toBe(false);
  });

  it('uses the typed drain helper on the workflow cleanup path', () => {
    const cleanupSource = readFileSync(
      resolve(__dirname, '../../../scripts/load-cleanup.ts'),
      'utf8'
    );

    expect(cleanupSource).toContain('hasQuietRollbackWindow');
    expect(cleanupSource).toContain('SCORING_WORKER_QUERY_FRAGMENT');
    expect(cleanupSource).toContain('cancelScoringWorkers');
    expect(cleanupSource).toContain('pg_cancel_backend');
    expect(cleanupSource).toContain('SUPABASE_DB_URL');
    expect(cleanupSource).toContain('process.exitCode = 1');
  });
});
