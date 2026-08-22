import { describe, expect, it, vi } from 'vitest';
import {
  runWithBestEffortCronCheckIn,
  type CronCheckIn,
  type CronCheckInClient,
} from './sentryCronCheckIn';

const MONITOR_SLUG = 'test-monitor';

function createClient(overrides: Partial<CronCheckInClient> = {}) {
  const checkIns: CronCheckIn[] = [];
  const captureCheckIn = vi.fn((checkIn: CronCheckIn) => {
    checkIns.push(checkIn);
    return 'check-in-123';
  });
  const flush = vi.fn(async () => true);

  return {
    checkIns,
    captureCheckIn,
    flush,
    client: { captureCheckIn, flush, ...overrides } satisfies CronCheckInClient,
  };
}

describe('runWithBestEffortCronCheckIn', () => {
  it('correlates in-progress and success around snapshot persistence', async () => {
    const events: string[] = [];
    const { client, checkIns, flush } = createClient({
      captureCheckIn: checkIn => {
        checkIns.push(checkIn);
        events.push(checkIn.status);
        return 'check-in-123';
      },
      flush: async timeoutMs => {
        events.push(`flush:${timeoutMs}`);
        return true;
      },
    });

    const result = await runWithBestEffortCronCheckIn(
      client,
      MONITOR_SLUG,
      async () => {
        events.push('snapshot-inserted');
        return 'persisted';
      },
      { now: vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(2_500) }
    );

    expect(result).toBe('persisted');
    expect(events).toEqual(['in_progress', 'snapshot-inserted', 'ok', 'flush:2000']);
    expect(checkIns).toEqual([
      { monitorSlug: MONITOR_SLUG, status: 'in_progress' },
      {
        checkInId: 'check-in-123',
        monitorSlug: MONITOR_SLUG,
        status: 'ok',
        duration: 1.5,
      },
    ]);
    expect(flush).not.toHaveBeenCalled();
  });

  it('emits error and rethrows the original snapshot failure', async () => {
    const snapshotError = new Error('snapshot insert failed');
    const { client, checkIns, flush } = createClient();

    await expect(
      runWithBestEffortCronCheckIn(client, MONITOR_SLUG, async () => {
        throw snapshotError;
      })
    ).rejects.toBe(snapshotError);

    expect(checkIns.map(checkIn => checkIn.status)).toEqual(['in_progress', 'error']);
    expect(checkIns[1]).toMatchObject({ checkInId: 'check-in-123' });
    expect(flush).toHaveBeenCalledWith(2000);
  });

  it('still persists the snapshot when the in-progress check-in throws', async () => {
    const persistSnapshot = vi.fn(async () => 'persisted');
    const logger = { warn: vi.fn() };
    const { client, flush } = createClient({
      captureCheckIn: () => {
        throw new Error('Sentry unavailable');
      },
    });

    await expect(
      runWithBestEffortCronCheckIn(client, MONITOR_SLUG, persistSnapshot, { logger })
    ).resolves.toBe('persisted');

    expect(persistSnapshot).toHaveBeenCalledOnce();
    expect(flush).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Sentry Cron in_progress check-in failed:',
      'Sentry unavailable'
    );
  });

  it('preserves a successful snapshot when the terminal check-in throws', async () => {
    const logger = { warn: vi.fn() };
    const flush = vi.fn(async () => true);
    let captureCount = 0;
    const client: CronCheckInClient = {
      captureCheckIn: () => {
        captureCount += 1;
        if (captureCount === 1) return 'check-in-123';
        throw new Error('terminal delivery failed');
      },
      flush,
    };

    await expect(
      runWithBestEffortCronCheckIn(client, MONITOR_SLUG, async () => 'persisted', {
        logger,
      })
    ).resolves.toBe('persisted');

    expect(flush).toHaveBeenCalledWith(2000);
    expect(logger.warn).toHaveBeenCalledWith(
      'Sentry Cron ok check-in failed:',
      'terminal delivery failed'
    );
  });

  it.each([
    ['returns false', async () => false],
    ['rejects', async () => Promise.reject(new Error('flush failed'))],
  ])('preserves a successful snapshot when flush %s', async (_label, flushImpl) => {
    const logger = { warn: vi.fn() };
    const { client } = createClient({ flush: flushImpl });

    await expect(
      runWithBestEffortCronCheckIn(client, MONITOR_SLUG, async () => 'persisted', {
        logger,
      })
    ).resolves.toBe('persisted');

    expect(logger.warn).toHaveBeenCalled();
  });

  it('runs snapshot work when no Sentry client is configured', async () => {
    const persistSnapshot = vi.fn(async () => 'persisted');

    await expect(
      runWithBestEffortCronCheckIn(null, MONITOR_SLUG, persistSnapshot)
    ).resolves.toBe('persisted');
    expect(persistSnapshot).toHaveBeenCalledOnce();
  });
});
