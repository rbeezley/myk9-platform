import { afterEach, expect, it, vi } from 'vitest';
import { run } from './export';
import { runRetention } from './retention';
import { createManifest } from './export-model';

vi.mock('./export', () => ({ run: vi.fn() }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it('refuses applied retention when an older marker belongs to another project', () => {
  for (const [key, value] of Object.entries({
    BACKUP_BUCKET: 'bucket',
    BACKUP_PREFIX: 'exports',
    BACKUP_PROJECT_REF: 'expected',
    BACKUP_RETENTION_APPLY: 'true',
    BACKUP_RETENTION_CONFIRM: 'DELETE bucket/exports',
  }))
    vi.stubEnv(key, value);
  const times = ['2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z'];
  const manifests = times.map((createdAt, index) => {
    const stem = `exports/${createdAt.replace(/[:.]/g, '-')}/`;
    return createManifest({
      projectRef: index === 0 ? 'foreign' : 'expected',
      createdAt,
      completedAt: createdAt,
      dumpKey: `${stem}database.dump.enc`,
      globalsKey: `${stem}globals.sql.enc`,
      dumpBytes: 99,
      globalsBytes: 99,
      dumpSha256: 'a'.repeat(64),
      globalsSha256: 'b'.repeat(64),
      pgDumpVersion: '18.3',
      pgDumpallVersion: '18.3',
    });
  });
  vi.mocked(run).mockImplementation((_command, args) => {
    if (args[1] === 'list-objects-v2')
      return JSON.stringify({
        Contents: manifests.flatMap(manifest =>
          [
            manifest.dumpKey,
            manifest.globalsKey,
            manifest.dumpKey.replace('database.dump.enc', 'manifest.json'),
          ].map(Key => ({ Key, LastModified: manifest.createdAt }))
        ),
      });
    if (args[1] === 'cp') return JSON.stringify(manifests[0]);
    throw new Error('unexpected deletion');
  });
  expect(() => runRetention()).toThrow('another project');
  expect(vi.mocked(run).mock.calls.some(([, args]) => args[1] === 'delete-object')).toBe(false);
});
