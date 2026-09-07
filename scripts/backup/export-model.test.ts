import { describe, expect, it } from 'vitest';
import {
  assertManifest,
  cadenceForDay,
  decryptPayload,
  encryptPayload,
  isPastDue,
  latestDueSlot,
  parseEncryptionKey,
  redactError,
  sha256,
} from './export-model';

describe('scheduled export model', () => {
  it('round trips authenticated encryption and detects tampering', () => {
    const key = Buffer.alloc(32, 7);
    const payload = encryptPayload(Buffer.from('score data'), key, Buffer.alloc(12, 2));
    expect(decryptPayload(payload, key).toString()).toBe('score data');
    payload.ciphertext[0] ^= 1;
    expect(() => decryptPayload(payload, key)).toThrow();
  });

  it('requires exactly a 32-byte base64 key', () => {
    expect(parseEncryptionKey(Buffer.alloc(32, 1).toString('base64'))).toHaveLength(32);
    expect(() => parseEncryptionKey(Buffer.alloc(31, 1).toString('base64'))).toThrow(/32 bytes/);
    expect(() => parseEncryptionKey(undefined)).toThrow(/required/);
  });

  it('uses configured weekend cadence', () => {
    expect(cadenceForDay(5)).toBe('hourly');
    expect(cadenceForDay(1)).toBe('nightly');
  });

  it('computes local due slots across weekday transitions and DST', () => {
    const fridayNoon = new Date('2026-09-11T17:00:00.000Z'); // 12:00 CDT Friday
    const fridayDue = latestDueSlot(fridayNoon, 'America/Chicago');
    expect(fridayDue.toISOString()).toBe('2026-09-11T16:00:00.000Z');
    expect(isPastDue('2026-09-11T15:00:00.000Z', fridayDue)).toBe(true);
    const thursdayLate = new Date('2026-09-11T05:00:00.000Z'); // Thu 00:00 CDT; Friday 00:00 not due until 00:30
    expect(latestDueSlot(thursdayLate, 'America/Chicago').toISOString()).toBe(
      '2026-09-10T08:00:00.000Z'
    );
    const mondayEarly = new Date('2026-09-14T06:00:00.000Z'); // 01:00 CDT Monday
    expect(latestDueSlot(mondayEarly, 'America/Chicago').toISOString()).toBe(
      '2026-09-14T04:00:00.000Z'
    );
    const dstSunday = new Date('2026-03-08T20:15:00.000Z'); // 15:15 CDT after spring-forward
    expect(latestDueSlot(dstSunday, 'America/Chicago').toISOString()).toBe(
      '2026-03-08T19:00:00.000Z'
    );
  });

  it('validates manifests and keeps secrets out of errors', () => {
    expect(sha256(Buffer.from('x'))).toBe(
      '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881'
    );
    expect(() => assertManifest({ format: 'wrong' })).toThrow(/format/);
    expect(() =>
      assertManifest({
        format: 'myk9-postgres-export-v1',
        projectRef: 'fixture',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        dumpBytes: 29,
        globalsBytes: 29,
        dumpSha256: 'a'.repeat(64),
        globalsSha256: 'b'.repeat(64),
        dumpKey: 'dump',
        globalsKey: 'globals',
        pgDumpVersion: 'pg_dump (PostgreSQL) 18.3',
        pgDumpallVersion: 'pg_dumpall (PostgreSQL) 18.3',
      })
    ).not.toThrow();
    expect(() =>
      assertManifest({
        format: 'myk9-postgres-export-v1',
        projectRef: 'fixture',
        createdAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        completedAt: new Date().toISOString(),
        dumpBytes: 29,
        globalsBytes: 29,
        dumpSha256: 'a'.repeat(64),
        globalsSha256: 'b'.repeat(64),
        dumpKey: 'dump',
        globalsKey: 'globals',
        pgDumpVersion: '18',
        pgDumpallVersion: '18',
      })
    ).toThrow(/future/);
    expect(
      redactError('postgresql://postgres:secret@example.test/x SUPABASE_DB_PASSWORD=secret')
    ).toBe('postgresql://[redacted]@example.test/x SUPABASE_DB_PASSWORD=[redacted]');
  });
});
