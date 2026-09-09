import { execFileSync } from 'node:child_process';
import { exportSchedule, secureDatabaseUrl } from './export-config';
import { weekendShowWindow } from './export-model';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const { timeZone, weekendDays } = exportSchedule();
const force = process.env.BACKUP_FORCE_RUN === 'true';
const window = weekendShowWindow(new Date(), timeZone, weekendDays, 6, 22);

if (force) {
  console.log('run');
  process.exit(0);
}
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
