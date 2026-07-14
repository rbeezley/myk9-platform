export const DAILY_HEALTH_MONITOR_SLUG = 'daily-health-check';
const SENTRY_FLUSH_TIMEOUT_MS = 2_000;

export type CronCheckIn =
  | {
      monitorSlug: string;
      status: 'in_progress';
    }
  | {
      monitorSlug: string;
      status: 'ok' | 'error';
      checkInId: string;
      duration?: number;
    };

export type CronCheckInClient = {
  captureCheckIn: (checkIn: CronCheckIn) => string;
  flush: (timeoutMs: number) => Promise<boolean>;
};

type CronCheckInOptions = {
  logger?: Pick<Console, 'warn'>;
  now?: () => number;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function flushBestEffort(
  client: CronCheckInClient,
  logger: Pick<Console, 'warn'>
): Promise<void> {
  try {
    const flushed = await client.flush(SENTRY_FLUSH_TIMEOUT_MS);
    if (!flushed) logger.warn('Sentry Cron flush did not complete before timeout');
  } catch (error) {
    logger.warn('Sentry Cron flush failed:', errorMessage(error));
  }
}

export async function runWithBestEffortCronCheckIn<T>(
  client: CronCheckInClient | null,
  monitorSlug: string,
  work: () => Promise<T>,
  options: CronCheckInOptions = {}
): Promise<T> {
  if (!client) return work();

  const logger = options.logger ?? console;
  const now = options.now ?? Date.now;
  const startedAt = now();
  let checkInId: string | null = null;

  try {
    checkInId = client.captureCheckIn({ monitorSlug, status: 'in_progress' });
  } catch (error) {
    logger.warn('Sentry Cron in_progress check-in failed:', errorMessage(error));
  }

  if (!checkInId) return work();
  const activeCheckInId = checkInId;

  const finish = async (status: 'ok' | 'error'): Promise<void> => {
    try {
      client.captureCheckIn({
        checkInId: activeCheckInId,
        monitorSlug,
        status,
        duration: Math.max(0, now() - startedAt) / 1_000,
      });
    } catch (error) {
      logger.warn(`Sentry Cron ${status} check-in failed:`, errorMessage(error));
    }

    await flushBestEffort(client, logger);
  };

  try {
    const result = await work();
    await finish('ok');
    return result;
  } catch (error) {
    await finish('error');
    throw error;
  }
}
