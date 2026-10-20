import { describe, expect, it } from 'vitest';
import { comparePostmasterStart } from './loadPostmasterRestart';

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
