import { describe, expect, it, vi } from 'vitest';
import {
  comparePostmasterStart,
  POSTMASTER_READ_TIMEOUT_MS,
  postmasterRestartFailure,
  readPostmasterStart,
} from './loadPostmasterRestart';

const BEFORE = '2026-10-19T14:02:11.123456Z';

describe('postgres restart detection', () => {
  it('passes when the start time did not move', () => {
    expect(comparePostmasterStart(BEFORE, BEFORE).status).toBe('unchanged');
    // Whitespace from psql output must not read as a restart.
    expect(comparePostmasterStart(BEFORE, `${BEFORE}\n`).status).toBe('unchanged');
  });

  it('fails with the before and after times when it moved', () => {
    const after = '2026-10-19T14:31:50.654321Z';
    const result = comparePostmasterStart(BEFORE, after);
    expect(result.status).toBe('restarted');
    expect(result.message).toBe(
      `Postgres restarted during the run (before ${BEFORE}, after ${after}): no numbers.`
    );
  });

  it('detects a sub-second move', () => {
    expect(
      comparePostmasterStart('2026-10-19T14:02:11.100Z', '2026-10-19T14:02:11.900Z').status
    ).toBe('restarted');
  });

  it.each([
    [undefined, BEFORE],
    ['', BEFORE],
    [BEFORE, undefined],
    [BEFORE, 'not a time'],
  ])('cannot verify with before=%j after=%j, and says so instead of passing', (before, after) => {
    const result = comparePostmasterStart(before, after);
    expect(result.status).toBe('unverifiable');
    expect(result.message).toContain('no numbers');
  });
});

describe('bounded postmaster read', () => {
  const env = { SUPABASE_DB_URL: 'postgresql://u@h/db', SUPABASE_DB_PASSWORD: 'pw' };

  it('kills the child after a hard deadline and sets connect and statement deadlines', async () => {
    const run = vi.fn().mockResolvedValue({ stdout: `${BEFORE}\n` });
    expect(await readPostmasterStart(env, run)).toBe(BEFORE);
    const [file, args, options] = run.mock.calls[0];
    expect(file).toBe('psql');
    expect(args).toContain('SET statement_timeout = 10000');
    expect(options.timeout).toBe(POSTMASTER_READ_TIMEOUT_MS);
    expect(options.killSignal).toBe('SIGKILL');
    expect(options.env.PGCONNECT_TIMEOUT).toBe('10');
  });

  it('resolves undefined when psql times out or is killed, never throws', async () => {
    const run = vi.fn().mockRejectedValue(Object.assign(new Error('timed out'), { killed: true }));
    expect(await readPostmasterStart(env, run)).toBeUndefined();
    expect(await readPostmasterStart({}, run)).toBeUndefined();
  });

  it('turns a timed-out read into an unverifiable gating failure', () => {
    expect(postmasterRestartFailure({ postmaster: { before: BEFORE } })).toContain('no numbers');
    expect(postmasterRestartFailure({})).toContain('no numbers');
    expect(
      postmasterRestartFailure({ postmaster: { before: BEFORE, after: BEFORE } })
    ).toBeUndefined();
    expect(
      postmasterRestartFailure({
        postmaster: { before: BEFORE, after: '2026-10-19T15:00:00.000000Z' },
      })
    ).toBe(
      `Postgres restarted during the run (before ${BEFORE}, after 2026-10-19T15:00:00.000000Z): no numbers.`
    );
  });
});
