import { describe, expect, it, vi } from 'vitest';
import { latestManifest } from './latest-manifest';
import { createManifest } from './export-model';
import { exportPrefix, exportSchedule } from './export-config';

describe('bounded latest manifest lookup', () => {
  it('accepts an empty successful listing', () => {
    expect(latestManifest(() => '', 'bucket', 'exports', 'fixture', [])).toBeUndefined();
  });
  it('downloads only the newest marker across a full retention window', () => {
    const timestamps = Array.from({ length: 352 }, (_, index) =>
      new Date(Date.UTC(2020, 0, 1, index)).toISOString()
    );
    const keys = timestamps.map(time => `exports/${time.replace(/[:.]/g, '-')}/manifest.json`);
    const createdAt = timestamps.at(-1)!;
    const stem = keys.at(-1)!.replace('manifest.json', '');
    const manifest = createManifest({
      projectRef: 'fixture',
      createdAt,
      completedAt: createdAt,
      dumpBytes: 99,
      globalsBytes: 99,
      dumpSha256: 'a'.repeat(64),
      globalsSha256: 'b'.repeat(64),
      dumpKey: `${stem}database.dump.enc`,
      globalsKey: `${stem}globals.sql.enc`,
      pgDumpVersion: '18.3',
      pgDumpallVersion: '18.3',
    });
    const aws = vi.fn((args: string[]) => {
      if (args[1] === 'list-objects-v2')
        return JSON.stringify({ Contents: keys.map(Key => ({ Key })) });
      expect(args[2]).toBe(`s3://bucket/${keys.at(-1)}`);
      return JSON.stringify(manifest);
    });
    expect(latestManifest(aws, 'bucket', 'exports', 'fixture', [])).toEqual(manifest);
    expect(aws).toHaveBeenCalledTimes(2);
    expect(() => latestManifest(aws, 'bucket', 'exports', 'wrong-project', [])).toThrow(
      'another project'
    );
  });

  it('fails closed on a malformed newest marker', () => {
    const aws = vi
      .fn()
      .mockReturnValueOnce(
        JSON.stringify({ Contents: [{ Key: 'exports/2020-01-01T00-00-00-000Z/manifest.json' }] })
      )
      .mockReturnValueOnce('{');
    expect(() => latestManifest(aws, 'bucket', 'exports', 'fixture', [])).toThrow();
  });
});

describe('shared export configuration', () => {
  it.each(['', '   '])('uses the same default prefix for empty input %j', value => {
    expect(exportPrefix(value)).toBe('myk9/database');
  });
  it('normalizes a configured prefix and rejects root-only scope', () => {
    expect(exportPrefix(' /myk9-platform/ ')).toBe('myk9-platform');
    expect(() => exportPrefix('///')).toThrow('BACKUP_PREFIX');
  });
  it('validates the schedule before any backup or freshness decision', () => {
    expect(exportSchedule({ BACKUP_NIGHTLY_HOUR: '0' }).nightlyHour).toBe(0);
    expect(() => exportSchedule({ BACKUP_WEEKEND_DAYS: 'Fri,Sat,Sun' })).toThrow(
      'BACKUP_WEEKEND_DAYS'
    );
    expect(() => exportSchedule({ BACKUP_TIME_ZONE: 'bad-zone' })).toThrow('BACKUP_TIME_ZONE');
    expect(() => exportSchedule({ BACKUP_NIGHTLY_HOUR: '-1' })).toThrow('BACKUP_NIGHTLY_HOUR');
  });
});
