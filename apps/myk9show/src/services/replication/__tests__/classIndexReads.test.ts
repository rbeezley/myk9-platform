/**
 * MYK9-1366: getEntriesByClass and getClassesByTrial filtered a whole-table
 * read in JS, so a scoresheet open deserialised every entry of every show on a
 * secretary or judge device to find about twenty. They read through the class
 * and trial indexes now. The assertions count rows the replica returned to the
 * reader (deterministic); the wall-clock figures are logged, never asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplicatedTableCacheManager, databaseManager } from '@myk9/replication';
import { replicatedClassesTable } from '../ReplicatedClassesTable';
import { replicatedEntriesTable } from '../ReplicatedEntriesTable';

// '@myk9/replication' does not export the constants; DatabaseManager names them.
const CLASS_ID_INDEX = 'tableName_classId';
const TRIAL_ID_INDEX = 'tableName_trialId';
const WHOLE_TABLE_INDEX = 'tableName';

const CLASS_COUNT = 150;
const ENTRIES_PER_CLASS = 20;
const TARGET_CLASS = 'class-77';
const TIMING_RUNS = 10;

function entryRows() {
  const rows: Array<Record<string, unknown>> = [];
  for (let cls = 0; cls < CLASS_COUNT; cls++) {
    for (let n = 0; n < ENTRIES_PER_CLASS; n++) {
      rows.push({
        id: `entry-${cls}-${n}`,
        classId: `class-${cls}`,
        showId: `show-${cls % 5}`,
        armband: `${100 + n}`,
      });
    }
  }
  return rows;
}

/** Total rows every IndexedDB index read hands back while `run` executes. */
async function countRowsRead<T>(run: () => Promise<T>): Promise<{ result: T; rowsRead: number }> {
  let rowsRead = 0;
  const original = IDBIndex.prototype.getAll;
  const spy = vi.spyOn(IDBIndex.prototype, 'getAll').mockImplementation(function (
    this: IDBIndex,
    ...args: Parameters<IDBIndex['getAll']>
  ) {
    const request = original.apply(this, args);
    request.addEventListener('success', () => {
      rowsRead += (request.result as unknown[]).length;
    });
    return request;
  });
  try {
    const result = await run();
    return { result, rowsRead };
  } finally {
    spy.mockRestore();
  }
}

async function averageMs(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  for (let i = 0; i < TIMING_RUNS; i++) await run();
  return (performance.now() - started) / TIMING_RUNS;
}

describe('class and trial index readers (MYK9-1366)', () => {
  beforeEach(async () => {
    await databaseManager.reset();
    // A trailing listener notification reads the whole table inside a later
    // index-spy window and would be counted as the reader's (MYK9-978).
    vi.spyOn(ReplicatedTableCacheManager.prototype, 'notifyListeners').mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await databaseManager.reset();
  });

  it('getEntriesByClass reads one class of a 3,000-entry replica, not the table', async () => {
    await replicatedEntriesTable.batchSet(entryRows() as never[]);
    const total = CLASS_COUNT * ENTRIES_PER_CLASS;
    const scan = async () =>
      (await replicatedEntriesTable.getAllOrThrow()).filter(e => e.classId === TARGET_CLASS);

    const scanned = await countRowsRead(scan);
    const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');
    const indexed = await countRowsRead(() =>
      replicatedEntriesTable.getEntriesByClass(TARGET_CLASS)
    );
    const opened = indexSpy.mock.calls.map(call => call[0]);

    // Positive control: the old scan really did read every row.
    expect(scanned.rowsRead).toBe(total);
    expect(indexed.rowsRead).toBe(ENTRIES_PER_CLASS);
    expect(opened).toContain(CLASS_ID_INDEX);
    expect(opened).not.toContain(WHOLE_TABLE_INDEX);
    expect(indexed.result.map(e => e.id).sort()).toEqual(scanned.result.map(e => e.id).sort());
    expect(indexed.result).toHaveLength(ENTRIES_PER_CLASS);

    const scanMs = await averageMs(scan);
    const indexMs = await averageMs(() => replicatedEntriesTable.getEntriesByClass(TARGET_CLASS));
    console.log(
      `[MYK9-1366] ${total} entries / ${CLASS_COUNT} classes, one class: ` +
        `scan read ${scanned.rowsRead} rows in ${scanMs.toFixed(1)}ms avg; ` +
        `class index read ${indexed.rowsRead} rows in ${indexMs.toFixed(1)}ms avg ` +
        `(${TIMING_RUNS} runs each)`
    );
  }, 120_000);

  it('getClassesByTrial reads one trial through the trial index', async () => {
    await replicatedClassesTable.batchSet(
      Array.from({ length: 60 }, (_, n) => ({
        id: `class-${n}`,
        trialId: `trial-${n % 6}`,
      })) as never[]
    );
    const indexSpy = vi.spyOn(IDBObjectStore.prototype, 'index');

    const { result, rowsRead } = await countRowsRead(() =>
      replicatedClassesTable.getClassesByTrial('trial-2')
    );

    expect(result.map(c => c.id).sort()).toEqual(
      Array.from({ length: 10 }, (_, n) => `class-${n * 6 + 2}`).sort()
    );
    expect(rowsRead).toBe(10);
    const opened = indexSpy.mock.calls.map(call => call[0]);
    expect(opened).toContain(TRIAL_ID_INDEX);
    expect(opened).not.toContain(WHOLE_TABLE_INDEX);
  });
});
