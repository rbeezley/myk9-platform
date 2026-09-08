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
