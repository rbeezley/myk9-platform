import { describe, expect, it } from 'vitest';
import { retentionCandidates as selectCandidates, type StoredObject } from './retention-model';

function retentionCandidates(objects: StoredObject[], cutoff: number) {
  const snapshots = new Map(
    objects
      .filter(item => item.Key?.endsWith('/manifest.json'))
      .map(item => [
        item.Key!.slice(0, -'/manifest.json'.length),
        Date.parse(item.LastModified ?? ''),
      ])
  );
  return selectCandidates(objects, cutoff, snapshots);
}

const group = (name: string, date: string) =>
  ['manifest.json', 'database.dump.enc', 'globals.sql.enc'].map(file => ({
    Key: `${name}/${file}`,
    LastModified: date,
  }));

describe('retention safety', () => {
  it('protects the newest snapshot even if an older payload was reuploaded later', () => {
    const old = group('old', '2026-01-01T00:00:00Z');
    old[1].LastModified = '2026-04-01T00:00:00Z';
    const newer = group('newer', '2026-03-01T00:00:00Z');
    expect(retentionCandidates([...old, ...newer], Date.parse('2026-05-01T00:00:00Z'))).toEqual(
      old.map(item => item.Key)
    );
  });
  it('fails closed if a marker has missing modification metadata', () => {
    const objects = [
      ...group('old', '2026-01-01T00:00:00Z'),
      ...group('new', '2026-09-01T00:00:00Z'),
    ];
    expect(() =>
      retentionCandidates(
        objects.map(item => (item.Key === 'old/manifest.json' ? { Key: item.Key } : item)),
        Date.now()
      )
    ).toThrow('metadata');
  });
  it('removes the success marker before payloads regardless of listing order', () => {
    const old = group('old', '2026-01-01T00:00:00Z').sort((a, b) => a.Key.localeCompare(b.Key));
    const newest = group('newest', '2026-09-01T00:00:00Z');
    expect(retentionCandidates([...old, ...newest], Date.parse('2026-08-01T00:00:00Z'))[0]).toBe(
      'old/manifest.json'
    );
  });
  it('preserves the newest incomplete set when no complete backup exists', () => {
    const old = group('old', '2026-01-01T00:00:00Z').slice(1);
    const newest = group('newest', '2026-01-02T00:00:00Z').slice(1);
    expect(retentionCandidates([...old, ...newest], Date.parse('2026-09-01T00:00:00Z'))).toEqual(
      old.map(item => item.Key)
    );
  });
  it('preserves the newest complete set even when every backup exceeds retention', () => {
    const old = group('old', '2026-01-01T00:00:00Z');
    const newest = group('newest', '2026-01-02T00:00:00Z');
    expect(retentionCandidates([...old, ...newest], Date.parse('2026-09-01T00:00:00Z'))).toEqual(
      old.map(item => item.Key)
    );
  });
  it('reclaims aged incomplete sets but keeps fresh and boundary sets intact', () => {
    const boundary = group('boundary', '2026-01-01T00:00:00Z');
    boundary[0].LastModified = '2026-02-01T00:00:00Z';
    const incomplete = group('partial', '2026-01-01T00:00:00Z').slice(0, 2);
    const freshIncomplete = group('fresh-partial', '2026-02-01T00:00:00Z').slice(0, 2);
    expect(
      retentionCandidates(
        [
          ...boundary,
          ...incomplete,
          ...freshIncomplete,
          ...group('latest', '2026-03-01T00:00:00Z'),
        ],
        Date.parse('2026-01-15T00:00:00Z')
      )
    ).toEqual(incomplete.map(item => item.Key));
  });

  it('keeps groups containing unknown objects for operator inspection', () => {
    const unknown = [
      ...group('unknown', '2026-01-01T00:00:00Z'),
      {
        Key: 'unknown/notes.txt',
        LastModified: '2026-01-01T00:00:00Z',
      },
    ];
    expect(
      retentionCandidates(
        [...unknown, ...group('latest', '2026-03-01T00:00:00Z')],
        Date.parse('2026-02-01T00:00:00Z')
      )
    ).toEqual([]);
  });
});
