import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportDatabase } from './export';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

function fixture(failure?: 'dump' | 'upload' | 'corrupt') {
  for (const [name, value] of Object.entries({
    BACKUP_FORCE_RUN: 'true',
    BACKUP_DATABASE_URL: 'postgresql://postgres.fixture@aws-fixture.pooler.supabase.com/postgres',
    BACKUP_DATABASE_PASSWORD: 'fixture-password',
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
      if (args[1] === 'list-objects-v2')
        return JSON.stringify({
          Contents: [...objects.keys()].map(key => ({ Key: key.replace('s3://fixture/', '') })),
        });
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
      if (destination === '-') return bytes.toString();
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
  vi.useRealTimers();
});

describe('export success publication', () => {
  it('rejects a database URL for another project before storage or database access', () => {
    fixture();
    vi.stubEnv(
      'BACKUP_DATABASE_URL',
      'postgresql://postgres.other@aws-fixture.pooler.supabase.com/postgres'
    );
    expect(() => exportDatabase()).toThrow('does not match');
    expect(execFileSync).not.toHaveBeenCalled();
  });
  it.each(['true', 'false'])('rejects a project mismatch with force=%s', force => {
    const { objects, events } = fixture();
    exportDatabase();
    vi.stubEnv('BACKUP_FORCE_RUN', 'false');
    vi.stubEnv('BACKUP_FORCE_RUN', force);
    vi.stubEnv('BACKUP_PROJECT_REF', 'other-project');
    vi.stubEnv(
      'BACKUP_DATABASE_URL',
      'postgresql://postgres.other-project@aws-fixture.pooler.supabase.com/postgres'
    );
    const before = events.length;
    expect(() => exportDatabase()).toThrow('another project');
    expect(events.slice(before).filter(event => event.startsWith('upload:'))).toEqual([]);
    expect(objects.size).toBe(3);
  });
  it('bootstraps a scheduled export after an empty successful listing', () => {
    const { objects } = fixture();
    vi.stubEnv('BACKUP_FORCE_RUN', 'false');
    vi.mocked(execFileSync).mockReturnValueOnce('');
    exportDatabase();
    expect(objects.size).toBe(3);
  });
  it.each([
    ['BACKUP_ENCRYPTION_KEY', 'invalid'],
    ['BACKUP_DATABASE_PASSWORD', ''],
    ['BACKUP_PG_CLIENT_MAJOR', 'invalid'],
  ])('rejects invalid %s even when a recent backup covers the slot', (name, value) => {
    fixture();
    vi.stubEnv('BACKUP_FORCE_RUN', 'false');
    exportDatabase();
    vi.stubEnv(name, value);
    expect(() => exportDatabase()).toThrow();
  });

  it('does not dump the database when the schedule lookup cannot access R2', () => {
    fixture();
    vi.stubEnv('BACKUP_FORCE_RUN', 'false');
    vi.mocked(execFileSync).mockImplementationOnce(() => {
      throw new Error('AccessDenied');
    });
    expect(() => exportDatabase()).toThrow('AccessDenied');
    expect(
      vi.mocked(execFileSync).mock.calls.some(([command]) => String(command).startsWith('pg_dump'))
    ).toBe(false);
  });
  it('creates a new scheduled export when the newest marker cannot be validated', () => {
    const { objects } = fixture();
    vi.stubEnv('BACKUP_FORCE_RUN', 'false');
    vi.stubEnv('BACKUP_TIME_ZONE', 'UTC');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T04:07:00Z'));
    exportDatabase();
    const marker = [...objects.entries()].find(([key]) => key.endsWith('/manifest.json'))!;
    marker[1].bytes = Buffer.from('{');
    vi.setSystemTime(new Date('2026-09-09T05:07:00Z'));
    exportDatabase();
    expect(objects.size).toBe(6);
  });
  it('catches up a nightly export when the scheduler starts after the due hour', () => {
    const { objects } = fixture();
    vi.stubEnv('BACKUP_FORCE_RUN', 'false');
    vi.stubEnv('BACKUP_TIME_ZONE', 'UTC');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T04:07:00Z'));
    exportDatabase();
    expect(objects.size).toBe(3);
    vi.setSystemTime(new Date('2026-09-09T05:07:00Z'));
    exportDatabase();
    expect(objects.size).toBe(3);
    vi.setSystemTime(new Date('2026-09-10T04:07:00Z'));
    exportDatabase();
    expect(objects.size).toBe(6);
  });

  it.each([
    ['BACKUP_WEEKEND_DAYS', 'Fri,Sat,Sun'],
    ['BACKUP_WEEKEND_DAYS', '7'],
    ['BACKUP_NIGHTLY_HOUR', '24'],
  ])('rejects invalid schedule setting %s before exporting', (name, value) => {
    const { events } = fixture();
    vi.stubEnv(name, value);
    expect(() => exportDatabase()).toThrow(name);
    expect(events).toEqual([]);
  });
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
