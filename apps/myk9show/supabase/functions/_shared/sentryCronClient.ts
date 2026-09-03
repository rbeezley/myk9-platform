import type { CronCheckInClient } from './sentryCronCheckIn.ts';

interface SentryCronSdk extends CronCheckInClient {
  init(options: {
    dsn: string;
    environment: string | undefined;
    defaultIntegrations: false;
    sendDefaultPii: false;
  }): unknown;
}

/** Optional telemetry must never prevent a scheduled job from starting. */
export function createSentryCronClient(
  sdk: SentryCronSdk,
  config: { dsn?: string; environment?: string },
  logger: Pick<Console, 'warn'> = console
): CronCheckInClient | null {
  if (!config.dsn) return null;
  try {
    sdk.init({
      dsn: config.dsn,
      environment: config.environment || undefined,
      defaultIntegrations: false,
      sendDefaultPii: false,
    });
    return {
      captureCheckIn: checkIn => sdk.captureCheckIn(checkIn),
      flush: timeoutMs => sdk.flush(timeoutMs),
    };
  } catch (error) {
    logger.warn(
      'Sentry Cron initialization failed:',
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}
