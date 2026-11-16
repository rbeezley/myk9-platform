/**
 * What each armband label's print record says, per dog and day (MYK9-2073).
 *
 * Label prints are routinely partial (one dog, a day, only what was added), so no record speaks
 * for a whole class. A label is judged by the NEWEST non-voided armband print that holds its
 * dog-day key: printed when that record's fingerprint is the one the label would print now,
 * changed when it differs, not printed when no record holds it.
 */
export interface ArmbandPrintRecordLike {
  reportId: string;
  coverage: Record<string, unknown>;
  printedAt: string;
  voidedAt?: string | undefined;
}

export interface PrintedLabel<R extends ArmbandPrintRecordLike> {
  fingerprint: string;
  record: R;
}

export type PrintedLabelIndex<R extends ArmbandPrintRecordLike> = ReadonlyMap<
  string,
  PrintedLabel<R>
>;

export type LabelPrintStatus = 'printed' | 'changed' | 'not-printed';

export function buildPrintedLabelIndex<R extends ArmbandPrintRecordLike>(
  records: readonly R[]
): PrintedLabelIndex<R> {
  const index = new Map<string, PrintedLabel<R>>();
  const newestFirst = records
    .filter(record => record.reportId === 'armband-labels' && !record.voidedAt)
    .sort((left, right) => right.printedAt.localeCompare(left.printedAt));
  for (const record of newestFirst) {
    const fingerprints = record.coverage.subjectFingerprints;
    if (!fingerprints || typeof fingerprints !== 'object' || Array.isArray(fingerprints)) continue;
    for (const [key, fingerprint] of Object.entries(fingerprints)) {
      if (typeof fingerprint === 'string' && !index.has(key))
        index.set(key, { fingerprint, record });
    }
  }
  return index;
}

export function labelPrintStatus<R extends ArmbandPrintRecordLike>(
  index: PrintedLabelIndex<R>,
  key: string,
  fingerprint: string
): LabelPrintStatus {
  const held = index.get(key);
  if (!held) return 'not-printed';
  return held.fingerprint === fingerprint ? 'printed' : 'changed';
}
