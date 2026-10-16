import { describe, expect, it } from 'vitest';
import { detectDirtyRowConflict, type DirtyRowComparePolicy } from './detectDirtyRowConflict';

const policy: DirtyRowComparePolicy = {
  normalizeRemoteComparison: (_field, value) => (value === null ? undefined : value),
};

type Row = { id: string; note?: string | null };
const detect = (base: Row, local: Row, remote: Row) =>
  detectDirtyRowConflict({ base, local, remote, comparePolicy: policy });

describe('normalizeRemoteComparison (MYK9-1236)', () => {
  it('reads a null base and an undefined remote as the server not changing the field', () => {
    expect(detect({ id: '1', note: null }, { id: '1', note: 'x' }, { id: '1' }).hasConflict).toBe(
      false
    );
  });

  it('never reads the device’s own null as unchanged against an undefined base', () => {
    const result = detect({ id: '1' }, { id: '1', note: null }, { id: '1', note: 'Good dog' });
    expect(result.fields).toEqual(['note']);
  });

  it('is off without the option', () => {
    expect(
      detectDirtyRowConflict({
        base: { id: '1', note: null },
        local: { id: '1', note: 'x' },
        remote: { id: '1' } as Row,
      }).fields
    ).toEqual(['note']);
  });
});
