import { describe, expect, it } from 'vitest';
import { retentionCandidates } from './retention-model';

const group = (name: string, date: string) =>
  ['manifest.json', 'database.dump.enc', 'globals.sql.enc'].map(file => ({
    Key: `${name}/${file}`,
    LastModified: date,
  }));

describe('retention safety', () => {
  it('preserves the newest complete set even when every backup exceeds retention', () => {
    const old = group('old', '2026-01-01T00:00:00Z');
    const newest = group('newest', '2026-01-02T00:00:00Z');
    expect(retentionCandidates([...old, ...newest], Date.parse('2026-09-01T00:00:00Z'))).toEqual(
      old.map(item => item.Key)
    );
  });
  it('keeps incomplete sets and sets straddling the cutoff intact', () => {
    const boundary = group('boundary', '2026-01-01T00:00:00Z');
    boundary[0].LastModified = '2026-02-01T00:00:00Z';
    const incomplete = group('partial', '2026-01-01T00:00:00Z').slice(0, 2);
    expect(
      retentionCandidates(
        [...boundary, ...incomplete, ...group('latest', '2026-03-01T00:00:00Z')],
        Date.parse('2026-01-15T00:00:00Z')
      )
    ).toEqual([]);
  });
});
