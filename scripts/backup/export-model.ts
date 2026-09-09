import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const EXPORT_FORMAT = 'myk9-postgres-export-v1';

export interface ExportManifest {
  format: typeof EXPORT_FORMAT;
  projectRef: string;
  createdAt: string;
  completedAt: string;
  dumpBytes: number;
  globalsBytes: number;
  dumpSha256: string;
  globalsSha256: string;
  dumpKey: string;
  globalsKey: string;
  pgDumpVersion: string;
  pgDumpallVersion: string;
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

export function parseEncryptionKey(value: string | undefined): Buffer {
  if (!value) throw new Error('BACKUP_ENCRYPTION_KEY is required');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32)
    throw new Error('BACKUP_ENCRYPTION_KEY must be base64 for exactly 32 bytes');
  return key;
}

export function encryptPayload(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv = randomBytes(12)
): EncryptedPayload {
  if (key.length !== 32) throw new Error('AES-256-GCM requires a 32-byte key');
  if (iv.length !== 12) throw new Error('AES-GCM requires a 12-byte IV');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { ciphertext, iv: Buffer.from(iv), authTag: cipher.getAuthTag() };
}

export function decryptPayload(payload: EncryptedPayload, key: Uint8Array): Buffer {
  if (key.length !== 32) throw new Error('AES-256-GCM requires a 32-byte key');
  const decipher = createDecipheriv('aes-256-gcm', key, payload.iv);
  decipher.setAuthTag(payload.authTag);
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
}

export function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createManifest(input: Omit<ExportManifest, 'format'>): ExportManifest {
  return { format: EXPORT_FORMAT, ...input };
}

export function assertManifest(manifest: unknown): asserts manifest is ExportManifest {
  if (!manifest || typeof manifest !== 'object') throw new Error('manifest must be an object');
  const candidate = manifest as Partial<ExportManifest>;
  if (candidate.format !== EXPORT_FORMAT) throw new Error('unsupported export manifest format');
  for (const field of [
    'projectRef',
    'createdAt',
    'completedAt',
    'dumpSha256',
    'globalsSha256',
    'dumpKey',
    'globalsKey',
    'pgDumpVersion',
    'pgDumpallVersion',
  ] as const) {
    if (typeof candidate[field] !== 'string' || candidate[field] === '')
      throw new Error(`manifest ${field} is required`);
  }
  for (const field of ['dumpSha256', 'globalsSha256'] as const) {
    if (typeof candidate[field] !== 'string' || !/^[a-f0-9]{64}$/.test(candidate[field]))
      throw new Error(`manifest ${field} is invalid`);
  }
  const createdAt = Date.parse(candidate.createdAt ?? '');
  if (!Number.isFinite(createdAt) || createdAt > Date.now() + 5 * 60_000)
    throw new Error('manifest createdAt is invalid or in the future');
  for (const field of ['dumpBytes', 'globalsBytes'] as const) {
    if (
      typeof candidate[field] !== 'number' ||
      !Number.isSafeInteger(candidate[field]) ||
      candidate[field] <= 28
    )
      throw new Error(`manifest ${field} is invalid`);
  }
}

export function redactError(message: string): string {
  return message
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@')
    .replace(
      /(SUPABASE_DB_PASSWORD|BACKUP_DATABASE_PASSWORD|PGPASSWORD|BACKUP_ENCRYPTION_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID)=([^\s]+)/gi,
      '$1=[redacted]'
    );
}

export function cadenceForDay(day: number, weekendDays = [0, 5, 6]): 'hourly' | 'nightly' {
  return weekendDays.includes(day) ? 'hourly' : 'nightly';
}

export function weekdayInTimeZone(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

export function timeZoneParts(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour') };
}

export type WeekendShowWindow =
  | { shouldCheckShow: false; reason: 'weekday' | 'outside-daytime-window' }
  | { shouldCheckShow: true; startDate: string; endDate: string };

function dateKey(year: number, month: number, day: number): string {
  const value = new Date(Date.UTC(year, month - 1, day));
  return value.toISOString().slice(0, 10);
}

export function weekendShowWindow(
  now: Date,
  timeZone = 'UTC',
  weekendDays = [0, 5, 6],
  dayStartHour = 6,
  dayEndHour = 22
): WeekendShowWindow {
  const local = timeZoneParts(now, timeZone);
  const day = weekdayInTimeZone(now, timeZone);
  if (!weekendDays.includes(day)) return { shouldCheckShow: false, reason: 'weekday' };
  if (local.hour < dayStartHour || local.hour >= dayEndHour)
    return { shouldCheckShow: false, reason: 'outside-daytime-window' };
  const daysSinceFriday = day === 5 ? 0 : day === 6 ? 1 : 2;
  return {
    shouldCheckShow: true,
    startDate: dateKey(local.year, local.month, local.day - daysSinceFriday),
    endDate: dateKey(local.year, local.month, local.day - daysSinceFriday + 2),
  };
}

export function latestDueSlot(
  now: Date,
  timeZone = 'UTC',
  weekendDays = [0, 5, 6],
  nightlyHour = 3,
  graceMinutes = 30
): Date {
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0) throw new Error('invalid grace period');
  const candidate = new Date(
    Math.floor((now.getTime() - graceMinutes * 60_000) / 3_600_000) * 3_600_000
  );
  for (let offset = 0; offset <= 72; offset += 1) {
    const slot = new Date(candidate.getTime() - offset * 3_600_000);
    const local = timeZoneParts(slot, timeZone);
    const day = weekdayInTimeZone(slot, timeZone);
    if (weekendDays.includes(day) || local.hour === nightlyHour) return slot;
    const previous = timeZoneParts(new Date(slot.getTime() - 3_600_000), timeZone);
    const dayChanged =
      previous.year !== local.year || previous.month !== local.month || previous.day !== local.day;
    // Spring-forward can erase the configured hour. The first available hour after
    // the gap is that day's due slot, shared by the exporter and freshness check.
    if (local.hour > nightlyHour && (dayChanged || previous.hour < nightlyHour)) return slot;
  }
  throw new Error('unable to find a due export slot in the previous 72 hours');
}

export function isPastDue(createdAt: string, dueSlot: Date): boolean {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) throw new Error('invalid manifest timestamp');
  return timestamp < dueSlot.getTime();
}
