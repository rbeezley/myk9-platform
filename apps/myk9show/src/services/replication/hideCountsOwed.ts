/**
 * MYK9-1451 / MYK9-1458: classes whose hide count could not be looked up when they last synced.
 *
 * A failed lookup keeps the count the device already saved, but the sync watermark still moves
 * past those classes, so an unchanged class would never be asked again. Each owed class is
 * recorded here (class id -> trial id) and the next sync fetches it by id until a lookup answers.
 * Kept in localStorage so a reload between the failure and the retry does not forget it.
 */
const STORAGE_KEY = 'myk9:classHideCountsOwed';

/** Owed ids per by-id read: well under URL limits (~37 chars a UUID) and PostgREST's row cap. */
export const OWED_CLASS_FETCH_CHUNK = 100;

type OwedMap = Record<string, string>;

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

function read(): OwedMap {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as OwedMap) : {};
  } catch {
    return {};
  }
}

function write(owed: OwedMap): void {
  try {
    if (Object.keys(owed).length === 0) storage()?.removeItem(STORAGE_KEY);
    else storage()?.setItem(STORAGE_KEY, JSON.stringify(owed));
  } catch {
    // Storage full or blocked: the class still keeps its saved count; only the retry is lost.
  }
}

/** Owed class ids, limited to one trial when the sync is scoped to it ('' means every trial). */
export function owedHideCountClassIds(trialId: string | undefined): string[] {
  return Object.entries(read())
    .filter(([, owedTrialId]) => !trialId || owedTrialId === trialId)
    .map(([classId]) => classId);
}

export function markHideCountsOwed(rows: ReadonlyArray<{ id: string; trial_id: string }>): void {
  if (rows.length === 0) return;
  const owed = read();
  for (const row of rows) owed[String(row.id)] = String(row.trial_id);
  write(owed);
}

export function settleHideCountsOwed(classIds: Iterable<string>): void {
  const owed = read();
  let changed = false;
  for (const id of classIds) {
    if (id in owed) {
      delete owed[id];
      changed = true;
    }
  }
  if (changed) write(owed);
}

/** At an account boundary the watermarks reset, so every class is fetched again anyway. */
export function clearHideCountsOwed(): void {
  write({});
}
