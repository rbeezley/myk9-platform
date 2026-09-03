import { afterEach, describe, expect, it } from 'vitest';
import {
  buildDiagnosticBundle,
  captureSupportClientError,
  clearSupportClientErrors,
  getSupportClientErrors,
  installSupportErrorCapture,
} from './supportDiagnostics';

const uuid = '11111111-1111-4111-8111-111111111111';

afterEach(() => {
  clearSupportClientErrors();
});

describe('support diagnostics', () => {
  it('builds a populated diagnostic bundle', () => {
    const bundle = buildDiagnosticBundle({
      userId: uuid,
      databaseUserId: '22222222-2222-4222-8222-222222222222',
      role: 'secretary',
      route: '/shows/33333333-3333-4333-8333-333333333333',
      showId: '33333333-3333-4333-8333-333333333333',
      trialId: '44444444-4444-4444-8444-444444444444',
      entryId: '55555555-5555-4555-8555-555555555555',
      appVersion: '0.0.1',
      online: false,
      replication: {
        status: 'pending',
        lastSyncAt: new Date('2026-07-05T01:00:00.000Z'),
        queueSize: 3,
        conflictCount: 1,
        errorCount: 2,
        watermark: 123,
      },
      clientErrors: [
        {
          message: 'Failed to sync',
          timestamp: '2026-07-05T01:01:00.000Z',
          source: 'test',
        },
      ],
    });

    expect(bundle.user).toStrictEqual({
      authUserId: uuid,
      databaseUserId: '22222222-2222-4222-8222-222222222222',
      role: 'secretary',
    });
    expect(bundle.route).toBe('/shows/33333333-3333-4333-8333-333333333333');
    expect(bundle.context.showId).toBe('33333333-3333-4333-8333-333333333333');
    expect(bundle.connectivity.online).toBe(false);
    expect(bundle.connectivity.replication).toMatchObject({
      status: 'pending',
      lastSyncAt: '2026-07-05T01:00:00.000Z',
      queueSize: 3,
      conflictCount: 1,
      errorCount: 2,
      watermark: 123,
    });
    expect(bundle.clientErrors).toHaveLength(1);
  });

  it('records unavailable context as nulls instead of throwing', () => {
    const bundle = buildDiagnosticBundle({
      userId: 'not-a-uuid',
      role: '',
      route: null,
      online: null,
      replication: {
        lastSyncAt: 'not-a-date',
        queueSize: Number.NaN,
      },
    });

    expect(bundle.user.authUserId).toBeNull();
    expect(bundle.user.role).toBeNull();
    expect(bundle.route).toBeNull();
    expect(bundle.context).toStrictEqual({ showId: null, trialId: null, entryId: null });
    expect(bundle.connectivity.online).toBeNull();
    expect(bundle.connectivity.replication.lastSyncAt).toBeNull();
    expect(bundle.connectivity.replication.queueSize).toBeNull();
  });

  it('sanitizes client errors and keeps only the last ten', () => {
    for (let index = 0; index < 12; index += 1) {
      captureSupportClientError(
        new Error(`Failure ${index} access_token=secret-${index} Bearer abc123`),
        'unit-test'
      );
    }

    const errors = getSupportClientErrors();
    expect(errors).toHaveLength(10);
    expect(errors[0]?.message).toContain('Failure 2');
    expect(errors.at(-1)?.message).toContain('access_token=[redacted]');
    expect(errors.at(-1)?.message).toContain('Bearer [redacted]');
  });

  it('redacts bare JWTs and auth token params before storing diagnostics', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.signature_123';
    captureSupportClientError(
      new Error(
        `Failed to refresh session ${jwt} id_token=bare-id-token token=bare-token https://app/#id_token=${jwt}&token=plain`
      ),
      'auth-flow'
    );

    const message = getSupportClientErrors().at(-1)?.message ?? '';
    expect(message).not.toContain(jwt);
    expect(message).not.toContain('plain');
    expect(message).not.toContain('bare-id-token');
    expect(message).not.toContain('bare-token');
    expect(message).toContain('id_token=[redacted]');
    expect(message).toContain('token=[redacted]');
    expect(message).toContain('#id_token=[redacted]');
    expect(message).toContain('&token=[redacted]');
  });

  it('includes a dispatched window error in the next diagnostic bundle', () => {
    const teardown = installSupportErrorCapture();

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('Scores failed to save') }));

    expect(buildDiagnosticBundle({}).clientErrors).toEqual([
      expect.objectContaining({
        message: 'Scores failed to save',
        source: 'window.error',
      }),
    ]);

    teardown();
  });

  it('survives hostile inputs', () => {
    const input = {
      get userId(): string {
        throw new Error('getter exploded');
      },
    };

    expect(() => buildDiagnosticBundle(input)).not.toThrow();
    expect(getSupportClientErrors().at(-1)?.source).toBe('buildDiagnosticBundle');
  });
});
