/**
 * MYK9-1045: the fingerprint of a class's scoring results, as the client sends it with
 * "results checked against the paper" (`mark_class_results_verified`).
 *
 * The server refuses the check when the class's results no longer hash to the value the
 * secretary was looking at, so an offline check that replays after a correction cannot
 * re-stamp results nobody checked. That only works if this function and the SQL
 * `private.class_results_fingerprint` (migration 20261008014300) agree byte for byte:
 * both are pinned to one fixture hash (`__tests__/classResultsFingerprint.test.ts` and
 * `supabase/tests/myk9_1045_results_verified_test.sql`). Change one, change both, and
 * bump the version tag.
 *
 * Pass the class's entries as the replica holds them (snake_case server columns). Values
 * may be numbers or numeric strings; `null` and `undefined` both mean "no value".
 */

export const CLASS_RESULTS_FINGERPRINT_VERSION = 'myk9-class-results-v1';

type NumericValue = number | string | null | undefined;

/** The entry columns the fingerprint reads. Anything else on the row is ignored. */
export interface ClassResultsFingerprintEntry {
  id: string;
  deleted_at?: string | null | undefined;
  is_scored?: boolean | null | undefined;
  result_status?: string | null | undefined;
  search_time_seconds?: NumericValue;
  area1_time_seconds?: NumericValue;
  area2_time_seconds?: NumericValue;
  area3_time_seconds?: NumericValue;
  area4_time_seconds?: NumericValue;
  total_correct_finds?: NumericValue;
  total_incorrect_finds?: NumericValue;
  total_faults?: NumericValue;
  no_finish_count?: NumericValue;
  total_score?: NumericValue;
  points_earned?: NumericValue;
  final_placement?: NumericValue;
  disqualification_reason?: string | null | undefined;
}

const NULL_TOKEN = '\\N';

function textField(value: string | null | undefined): string {
  if (value == null) return NULL_TOKEN;
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, '\\n');
}

function toNumber(value: NumericValue): number | null {
  if (value == null) return null;
  return typeof value === 'number' ? value : Number(value);
}

/** Matches `trim_scale(numeric)::text` for the values PostgREST hands the client. */
function numberField(value: NumericValue): string {
  const n = toNumber(value);
  return n == null ? NULL_TOKEN : String(n);
}

/** 0 and "no placement" are the same thing: the column defaults to 0, the ranker writes null. */
function placement(value: NumericValue): number | null {
  const n = toNumber(value);
  return n == null || n === 0 ? null : n;
}

/** One entry's canonical results line, or null when it is deleted or has no result. */
export function entryResultsLine(entry: ClassResultsFingerprintEntry): string | null {
  if (entry.deleted_at != null) return null;
  const isScored = entry.is_scored === true;
  const resultStatus = entry.result_status ?? null;
  const place = placement(entry.final_placement);
  if (!isScored && (resultStatus ?? 'pending') === 'pending' && place == null) return null;

  return [
    entry.id.toLowerCase(),
    isScored ? '1' : '0',
    textField(resultStatus),
    numberField(entry.search_time_seconds),
    numberField(entry.area1_time_seconds),
    numberField(entry.area2_time_seconds),
    numberField(entry.area3_time_seconds),
    numberField(entry.area4_time_seconds),
    numberField(entry.total_correct_finds),
    numberField(entry.total_incorrect_finds),
    numberField(entry.total_faults),
    numberField(entry.no_finish_count),
    numberField(entry.total_score),
    numberField(entry.points_earned),
    numberField(place),
    textField(entry.disqualification_reason),
  ].join('|');
}

/**
 * The canonical text from lines already built by {@link entryResultsLine} (entries with no result
 * contribute none). Lets a row carry its own line, so a fingerprint can be hashed later from
 * exactly the rows that were on screen.
 */
export function classResultsCanonicalTextFromLines(lines: readonly string[]): string {
  const keyed = lines.map(line => ({ id: line.slice(0, line.indexOf('|')), line }));
  keyed.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return `${CLASS_RESULTS_FINGERPRINT_VERSION}\n${keyed.map(row => row.line).join('\n')}`;
}

/** The exact string the fingerprint hashes. Exported for the agreement test. */
export function classResultsCanonicalText(
  entries: readonly ClassResultsFingerprintEntry[]
): string {
  return classResultsCanonicalTextFromLines(
    entries.map(entryResultsLine).filter((line): line is string => line != null)
  );
}

/** sha256 hex of a canonical results text: the value `mark_class_results_verified` expects. */
export async function hashClassResultsText(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** sha256 hex of the class's canonical results text: the value `mark_class_results_verified` expects. */
export async function classResultsFingerprint(
  entries: readonly ClassResultsFingerprintEntry[]
): Promise<string> {
  return hashClassResultsText(classResultsCanonicalText(entries));
}
