import { fileURLToPath } from 'node:url';
export function exportPrefix(value = process.env.BACKUP_PREFIX): string {
  const prefix = (value?.trim() || 'myk9/database').replace(/^\/+|\/+$/g, '');
  if (!prefix) throw new Error('BACKUP_PREFIX must not be only slashes');
  return prefix;
}

export function exportSchedule(env: NodeJS.ProcessEnv = process.env) {
  const timeZone = env.BACKUP_TIME_ZONE || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch {
    throw new Error('BACKUP_TIME_ZONE must be a valid IANA timezone');
  }
  const rawDays = env.BACKUP_WEEKEND_DAYS || '0,5,6';
  if (!/^[0-6](,[0-6])*$/.test(rawDays))
    throw new Error('BACKUP_WEEKEND_DAYS must be comma-separated numbers from 0 through 6');
  const rawHour = env.BACKUP_NIGHTLY_HOUR || '3';
  if (!/^\d{1,2}$/.test(rawHour) || Number(rawHour) > 23)
    throw new Error('BACKUP_NIGHTLY_HOUR must be an integer from 0 through 23');
  return { timeZone, weekendDays: rawDays.split(',').map(Number), nightlyHour: Number(rawHour) };
}

/** Pin the public Supabase CA and verify the server hostname; never fall back to plaintext. */
export function secureDatabaseUrl(value: string): string {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('BACKUP_DATABASE_URL must be a PostgreSQL URI');
  url.searchParams.set('sslmode', 'verify-full');
  url.searchParams.set(
    'sslrootcert',
    fileURLToPath(new URL('./supabase-prod-ca-2021.crt', import.meta.url))
  );
  return url.toString();
}

/** Keep bounded in-memory encryption comfortably below the runner's memory limit. */
export function assertExportSize(bytes: number): void {
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 256 * 1024 * 1024)
    throw new Error(
      'Export exceeds the 256 MiB in-memory limit; streaming encryption is required before retrying'
    );
}
