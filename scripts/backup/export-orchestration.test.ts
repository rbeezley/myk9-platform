import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportDatabase } from './export';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

function fixture(failure?: 'dump' | 'upload' | 'corrupt') {
  for (const [name, value] of Object.entries({
    BACKUP_FORCE_RUN: 'true',
    BACKUP_DATABASE_URL: 'postgresql://fixture.invalid/db',
    BACKUP_PROJECT_REF: 'fixture',
    BACKUP_BUCKET: 'fixture',
    BACKUP_PREFIX: 'exports',
    BACKUP_PG_CLIENT_MAJOR: '18',
    BACKUP_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  }))
    vi.stubEnv(name, value);
  const objects = new Map<string, { bytes: Buffer; digest: string }>();
  const events: string[] = [];
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.mocked(execFileSync).mockImplementation(((command: string, args: string[]) => {
    if (command.startsWith('pg_dump')) {
      if (args[0] === '--version') return `${command} (PostgreSQL) 18.3`;
      if (failure === 'dump') throw new Error('synthetic dump failure');
      writeFileSync(args[args.indexOf('--file') + 1], `synthetic ${command} payload`);
      return '';
    }
    if (command !== 'aws') throw new Error('unexpected command');
    if (args[0] === 's3api') {
      const key = `s3://${args[args.indexOf('--bucket') + 1]}/${args[args.indexOf('--key') + 1]}`;
      const object = objects.get(key);
      if (!object) throw new Error('missing object');
      return JSON.stringify({
        ContentLength: object.bytes.length,
        Metadata: { sha256: object.digest },
      });
    }
    const [, , source, destination] = args;
    if (source.startsWith('s3://')) {
      const object = objects.get(source);
      if (!object) throw new Error('missing object');
      const bytes = Buffer.from(object.bytes);
      if (failure === 'corrupt') bytes[bytes.length - 1] ^= 1;
      events.push(`download:${source.split('/').at(-1)}`);
      writeFileSync(destination, bytes);
    } else {
      if (failure === 'upload') throw new Error('synthetic upload failure');
      events.push(`upload:${destination.split('/').at(-1)}`);
      objects.set(destination, {
        bytes: readFileSync(source),
        digest: args[args.indexOf('--metadata') + 1].slice(7),
      });
    }
    return '';
  }) as typeof execFileSync);
  return { events, objects };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('export success publication', () => {
  it.each(['dump', 'upload', 'corrupt'] as const)(
    'does not publish success after %s failure',
    failure => {
      const { events, objects } = fixture(failure);
      expect(() => exportDatabase()).toThrow();
      expect(events).not.toContain('upload:manifest.json');
      expect([...objects.keys()].some(key => key.endsWith('/manifest.json'))).toBe(false);
    }
  );

  it('publishes success only after downloading and validating both payloads', () => {
    const { events, objects } = fixture();
    exportDatabase();
    const publish = events.indexOf('upload:manifest.json');
    expect(publish).toBeGreaterThan(events.indexOf('download:database.dump.enc'));
    expect(publish).toBeGreaterThan(events.indexOf('download:globals.sql.enc'));
    expect(objects.size).toBe(3);
    const manifest = [...objects.entries()].find(([key]) => key.endsWith('/manifest.json'));
    expect(manifest).toBeDefined();
    const parsed = JSON.parse(manifest![1].bytes.toString());
    expect(Date.parse(parsed.createdAt)).toBeLessThanOrEqual(Date.parse(parsed.completedAt));
  });
});
