/**
 * A run timer's progress, kept on the device so a reload mid-run does not lose it
 * (MYK9-2007). The record is a checkpoint: the elapsed time and whether the timer
 * was running, stamped with the wall clock. Reading it back after a reload can
 * only trust the wall clock for the gap since the stamp, so a gap that is negative
 * or implausibly long is clamped, never believed.
 */
import { formatMsAsMSSCC } from '@myk9/core';

const KEY_PREFIX = 'myk9.scoresheetRun.v1:';
/** A record older than this belongs to a day that is over. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** A reload takes seconds. Longer than this and the gap cannot be told from a lost run. */
const MAX_RELOAD_GAP_MS = 2 * 60 * 1000;

interface SavedRunRecord {
  v: 1;
  elapsedMs: number;
  running: boolean;
  wallMs: number;
  slot?: number;
}

export interface RestoredRun {
  elapsedMs: number;
  /** True when the timer was running at the reload and carries on running. */
  running: boolean;
  /** Which of several timed slots (Nationals area) the run belongs to. */
  slot?: number;
  /** `intact` was stopped (exact); `estimated` carries on across the reload; `uncertain` is a floor. */
  outcome: 'intact' | 'estimated' | 'uncertain';
  /** What to tell the judge, or null when the time is exactly what it was. */
  notice: string | null;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function writeSavedRun(
  key: string,
  run: { elapsedMs: number; running: boolean; slot?: number | undefined }
): void {
  try {
    const record: SavedRunRecord = {
      v: 1,
      elapsedMs: Math.max(0, Math.round(run.elapsedMs)),
      running: run.running,
      wallMs: Date.now(),
      ...(run.slot !== undefined && { slot: run.slot }),
    };
    storage()?.setItem(KEY_PREFIX + key, JSON.stringify(record));
  } catch {
    // Storage full or blocked: the timer still works, it just cannot survive a reload.
  }
}

export function clearSavedRun(key: string): void {
  try {
    storage()?.removeItem(KEY_PREFIX + key);
  } catch {
    // Nothing to clear.
  }
}

function readRecord(key: string): SavedRunRecord | null {
  try {
    const raw = storage()?.getItem(KEY_PREFIX + key);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<SavedRunRecord>;
    if (
      record.v !== 1 ||
      typeof record.elapsedMs !== 'number' ||
      !Number.isFinite(record.elapsedMs) ||
      record.elapsedMs < 0 ||
      typeof record.wallMs !== 'number' ||
      typeof record.running !== 'boolean'
    ) {
      return null;
    }
    return record as SavedRunRecord;
  } catch {
    return null;
  }
}

/** The slot a saved run belongs to, for a sheet that must open on that slot. */
export function savedRunSlot(key: string | undefined): number | undefined {
  return key ? readRecord(key)?.slot : undefined;
}

/** What a reload finds for this timer, or null when there is nothing to restore. */
export function restoreRun(key: string | undefined, now = Date.now()): RestoredRun | null {
  if (!key) return null;
  const record = readRecord(key);
  if (!record) return null;
  const age = now - record.wallMs;
  if (age > MAX_AGE_MS) {
    clearSavedRun(key);
    return null;
  }
  const slot = record.slot === undefined ? {} : { slot: record.slot };
  if (!record.running) {
    return {
      elapsedMs: record.elapsedMs,
      running: false,
      outcome: 'intact',
      notice: null,
      ...slot,
    };
  }
  if (age >= 0 && age <= MAX_RELOAD_GAP_MS) {
    return {
      elapsedMs: record.elapsedMs + age,
      running: true,
      outcome: 'estimated',
      notice:
        'The page reloaded during this run and the timer kept counting. Check the time against your watch.',
      ...slot,
    };
  }
  return {
    elapsedMs: record.elapsedMs,
    running: false,
    outcome: 'uncertain',
    notice: `The page reloaded during this run and its time was lost. The timer shows the last time saved, ${formatMsAsMSSCC(record.elapsedMs, 'floor')}, which is probably short. Type the time, tap Use max time, or Reset and run the dog again.`,
    ...slot,
  };
}
