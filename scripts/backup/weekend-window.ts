import { execFileSync } from 'node:child_process';
import { exportSchedule, secureDatabaseUrl } from './export-config';
import { timeZoneParts, weekdayInTimeZone, weekendShowWindow } from './export-model';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const { timeZone, weekendDays, nightlyHour } = exportSchedule();
const force = process.env.BACKUP_FORCE_RUN === 'true';
const now = new Date();
const local = timeZoneParts(now, timeZone);
const day = weekdayInTimeZone(now, timeZone);

if (force) {
  console.log('run');
  process.exit(0);
}
// Do not carry an overdue weekend slot into the overnight period before the
// next weekday nightly slot. The next scheduled run is the weekday nightly
// export, so an early-Monday invocation must remain a no-op.
if (!weekendDays.includes(day) && local.hour < nightlyHour) {
  console.log('skip:before-weekday-nightly');
  process.exit(0);
}
const window = weekendShowWindow(now, timeZone, weekendDays, 6, 22);
if (!window.shouldCheckShow) {
  console.log(`skip:${window.reason}`);
  process.exit(0);
}

const databaseUrl = secureDatabaseUrl(required('BACKUP_DATABASE_URL'));
const sql = `SELECT EXISTS (
  SELECT 1 FROM public.shows
  WHERE start_date <= DATE '${window.endDate}'
    AND end_date >= DATE '${window.startDate}'
)`;
const result = execFileSync(
  'psql',
  [
    databaseUrl,
    '--no-psqlrc',
    '--set=ON_ERROR_STOP=1',
    '--tuples-only',
    '--no-align',
    '--command',
    sql,
  ],
  { env: { ...process.env, PGPASSWORD: required('BACKUP_DATABASE_PASSWORD') }, encoding: 'utf8' }
).trim();

if (result !== 't' && result !== 'f')
  throw new Error('show calendar query returned an invalid result');
console.log(result === 't' ? 'run' : 'skip:no-show');
