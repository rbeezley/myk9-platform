import { existsSync, writeFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyBackup } from './verify';
import { latestManifest } from './latest-manifest';
import { run } from './export';
import { createManifest, sha256 } from './export-model';

vi.mock('./latest-manifest', () => ({ latestManifest: vi.fn() }));
vi.mock('./export', () => ({ run: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function fixture(createdAt = '2026-09-09T03:07:00.000Z', damage?: 'size' | 'digest' | 'download') {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T04:22:00.000Z'));
  for (const [key, value] of Object.entries({
    BACKUP_BUCKET: 'bucket',
    BACKUP_PREFIX: 'exports',
    BACKUP_PROJECT_REF: 'fixture',
    BACKUP_TIME_ZONE: 'UTC',
    BACKUP_GRACE_MINUTES: '30',
    BACKUP_WEEKEND_DAYS: '0,5,6',
    BACKUP_NIGHTLY_HOUR: '3',
  }))
    vi.stubEnv(key, value);
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const dump = Buffer.alloc(100, 1),
    globals = Buffer.alloc(50, 2);
  vi.mocked(latestManifest).mockReturnValue(
    createManifest({
      projectRef: 'fixture',
      createdAt,
      completedAt: createdAt,
      dumpKey: 'dump.enc',
      globalsKey: 'globals.enc',
      dumpBytes: dump.length,
      globalsBytes: globals.length,
      dumpSha256: sha256(dump),
      globalsSha256: sha256(globals),
      pgDumpVersion: '18.3',
      pgDumpallVersion: '18.3',
    })
  );
  const targets: string[] = [];
  vi.mocked(run).mockImplementation((_command, args) => {
    targets.push(args[3]);
    if (damage === 'download') throw new Error('AccessDenied');
    const payload = args[2].endsWith('/dump.enc') ? dump : globals;
    writeFileSync(
      args[3],
      damage === 'size'
        ? Buffer.alloc(1)
        : damage === 'digest'
          ? Buffer.alloc(payload.length, 9)
          : payload
    );
    return '';
  });
  return targets;
}

it('accepts a fresh backup only after validating the distinct dump and globals payloads', () => {
  const targets = fixture();
  expect(() => verifyBackup()).not.toThrow();
  expect(targets).toHaveLength(2);
  expect(targets.every(path => !existsSync(path))).toBe(true);
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"status":"fresh"'));
});
it('raises an alarm for stale but intact payloads', () => {
  fixture('2026-09-08T03:07:00.000Z');
  expect(() => verifyBackup()).toThrow('missed due slot');
  expect(console.log).not.toHaveBeenCalled();
});
it('raises an alarm when no successful backup exists', () => {
  fixture();
  vi.mocked(latestManifest).mockReturnValue(undefined);
  expect(() => verifyBackup()).toThrow('no successful manifest');
  expect(run).not.toHaveBeenCalled();
});
it.each(['size', 'digest', 'download'] as const)(
  'raises an alarm and cleans up after %s failure',
  damage => {
    const targets = fixture(undefined, damage);
    expect(() => verifyBackup()).toThrow(
      damage === 'download' ? 'AccessDenied' : 'payload verification failed'
    );
    expect(console.log).not.toHaveBeenCalled();
    expect(targets.every(path => !existsSync(path))).toBe(true);
  }
);
