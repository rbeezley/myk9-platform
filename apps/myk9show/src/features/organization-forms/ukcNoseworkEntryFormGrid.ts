import { isSupersededMoveUpEntry } from '@/features/financial/moneyRoot';
import { getEntryStatusKind, isRemovedStatus } from '@/services/entryDisplay/entryDisplaySelectors';
import type { EntryFormDog, EntryFormTrial } from '@/lib/reports/entryFormTypes';

/**
 * MYK9-828: the UKC Nosework entry form template (`docs/UKC-forms/NW-Entry.pdf`)
 * has no AcroForm fields for the Trial 1/2 bracket, the Section A/B letters, or
 * the element-by-level grid — they are static print, meant to be hand-checked.
 * These coordinates (read from the template with `pdftotext -bbox`) let us draw
 * our own marks on top of the correct row/column instead, so the form actually
 * shows which trial and class the dog is entered in.
 *
 * All Y values are in pdftotext's top-down convention (distance from the top of
 * the page); `toPdfBaseline` converts to pdf-lib's bottom-up page coordinates.
 */

// The template is landscape Letter: 792pt wide, 612pt tall.
const PAGE_HEIGHT = 612;

// Vertical distance between one grid row-block and the next, measured from the
// six repetitions of the "Trial 1 [" line.
const ROW_PITCH = 45.0462;
export const MAX_GRID_ROWS = 6;

interface TopBand {
  yMinTop: number;
  yMaxTop: number;
}

const TRIAL_BRACKET_X_MID = (69.397376 + 85.142688) / 2;
const TRIAL1_BRACKET: TopBand = { yMinTop: 221.688436, yMaxTop: 232.153308 };
const TRIAL2_BRACKET: TopBand = { yMinTop: 236.122336, yMaxTop: 246.587208 };

const SECTION_BAND: TopBand = { yMinTop: 228.385636, yMaxTop: 239.923134 };
// The blank underline sits just after each letter — mark there, on the
// letter's own baseline, rather than on top of the letter itself.
const SECTION_X: Record<'A' | 'B', number> = {
  A: 160,
  B: 187,
};

const ELEMENT_COLUMN_X = new Map<string, number>([
  ['container', 235.5508],
  ['exterior', 309.9199],
  ['interior', 384.289],
  ['vehicle', 458.6581],
  ['handler discrimination', 533.0273],
]);

// The gutter between one column's level words and the next column's start
// (or, for Container, the Section letters) is wide enough for a small mark.
const GUTTER_OFFSET = 15;

const STANDARD_LEVEL_BANDS = new Map<string, TopBand>([
  ['novice', { yMinTop: 213.9094, yMaxTop: 222.3024 }],
  ['advanced', { yMinTop: 221.9094, yMaxTop: 230.3024 }],
  ['superior', { yMinTop: 229.9094, yMaxTop: 238.3024 }],
  ['master', { yMinTop: 237.9094, yMaxTop: 246.3024 }],
  ['elite', { yMinTop: 245.9094, yMaxTop: 254.3024 }],
]);

// Handler Discrimination only goes to "Excellent", one level short of the
// other four elements, and its rows sit 4pt lower than theirs.
const HANDLER_DISCRIMINATION_LEVEL_BANDS = new Map<string, TopBand>([
  ['novice', { yMinTop: 217.9094, yMaxTop: 226.3024 }],
  ['advanced', { yMinTop: 225.9094, yMaxTop: 234.3024 }],
  ['excellent', { yMinTop: 233.9094, yMaxTop: 242.3024 }],
  ['master', { yMinTop: 241.9094, yMaxTop: 250.3024 }],
]);

/** Trims and lowercases so a stray space or an inconsistently-cased value in
 * `classes.element`/`classes.level` (e.g. "Novice " or "novice") still finds
 * its column/row instead of silently dropping the mark. */
function normalizeGridKey(value: string): string {
  return value.trim().toLowerCase();
}

function levelBandsFor(element: string): Map<string, TopBand> {
  return normalizeGridKey(element) === 'handler discrimination'
    ? HANDLER_DISCRIMINATION_LEVEL_BANDS
    : STANDARD_LEVEL_BANDS;
}

function toPdfBaseline(band: TopBand, rowIndex: number): number {
  return PAGE_HEIGHT - (band.yMaxTop + rowIndex * ROW_PITCH) + 1;
}

export interface EntryFormGridMark {
  x: number;
  y: number;
  text: string;
  size: number;
}

/**
 * `trials.trial_number` is a free-text label ("Trial 1", "Friday Trial 2" —
 * see MYK9-282/MYK9-610), never the bare digit, so matching the string
 * against `'1'`/`'2'` never matched real data. Read the trailing number
 * instead; a trial numbered beyond what the template offers (3+) has no
 * bracket to mark, so it is left unmarked rather than guessed.
 */
function trialBracketNumber(label: string | undefined): '1' | '2' | undefined {
  const match = label?.trim().match(/(\d+)\s*$/);
  return match?.[1] === '1' || match?.[1] === '2' ? (match[1] as '1' | '2') : undefined;
}

/**
 * MYK9-845: an entry that will never produce a normal run (withdrawn,
 * scratched, not accepted) or that has been superseded by a move-up
 * (`entry_status = 'moved'`) is not actually entered in that class anymore —
 * marking it would print a class the dog is not really running. Reuses the
 * same predicates `ukcNoseworkTrialReport.ts`'s entry counting and the
 * exhibitor-facing status surfaces already use, rather than inventing a new
 * status rule for the entry form alone.
 */
function isActiveGridEntry(entry: Pick<EntryFormDog['entries'][number], 'entryStatus'>): boolean {
  if (isSupersededMoveUpEntry(entry)) return false;
  return !isRemovedStatus(getEntryStatusKind(entry.entryStatus));
}

/**
 * Computes an "X" mark for every one of this dog's ACTIVE entries (up to the
 * six rows the template offers) whose trial number, section, element and
 * level we can match against the printed grid. A withdrawn, scratched,
 * not-accepted, or superseded-move-up entry is skipped entirely — see
 * {@link isActiveGridEntry}. Among the remaining entries, one that does not
 * match anything on the template (an unrecognized element/level string, or a
 * trial numbered beyond "2") is silently skipped rather than guessing — never
 * invent a mark.
 */
export function computeUKCEntryFormGridMarks(
  dog: Pick<EntryFormDog, 'entries'>,
  trials: readonly EntryFormTrial[]
): EntryFormGridMark[] {
  const trialById = new Map(trials.map(trial => [trial.id, trial]));
  const marks: EntryFormGridMark[] = [];

  dog.entries
    .filter(isActiveGridEntry)
    .slice(0, MAX_GRID_ROWS)
    .forEach((entry, rowIndex) => {
      const trialNumber = trialBracketNumber(trialById.get(entry.trialId)?.trialNumber);
      if (trialNumber === '1') {
        marks.push({
          x: TRIAL_BRACKET_X_MID - 2,
          y: toPdfBaseline(TRIAL1_BRACKET, rowIndex),
          text: 'X',
          size: 8,
        });
      } else if (trialNumber === '2') {
        marks.push({
          x: TRIAL_BRACKET_X_MID - 2,
          y: toPdfBaseline(TRIAL2_BRACKET, rowIndex),
          text: 'X',
          size: 8,
        });
      }

      const section = entry.section?.trim().toUpperCase();
      if (section === 'A' || section === 'B') {
        marks.push({
          x: SECTION_X[section],
          y: toPdfBaseline(SECTION_BAND, rowIndex),
          text: 'X',
          size: 8,
        });
      }

      const columnX = ELEMENT_COLUMN_X.get(normalizeGridKey(entry.element));
      const band =
        columnX !== undefined
          ? levelBandsFor(entry.element).get(normalizeGridKey(entry.level))
          : undefined;
      if (columnX !== undefined && band) {
        marks.push({
          x: columnX - GUTTER_OFFSET,
          y: toPdfBaseline(band, rowIndex),
          text: 'X',
          size: 7,
        });
      }
    });

  return marks;
}

// The "Date of Birth  __ / __ / [[undefined_2 field]]" and
// "Telephone: ( __ ) __ - [[undefined_3 field]]" lines each print their own
// slashes/parens/dash, but give the fillable AcroForm field only the LAST
// segment (year; subscriber number) — a box too narrow for the whole value,
// which is why filling it with the full date/phone shrank to illegible type
// "in the margin" (MYK9-828). Filling the two AcroForm fields for just their
// own segment fixes that; these marks draw the segments the template left
// with no field at all (month/day; area code/exchange), in the blank space
// before each punctuation mark.
const DOB_LINE_BAND: TopBand = { yMinTop: 77.2, yMaxTop: 89.2 };
const DOB_MONTH_X = 681;
const DOB_DAY_X = 704;

const PHONE_LINE_BAND: TopBand = { yMinTop: 167.2, yMaxTop: 179.2 };
const PHONE_AREA_CODE_X = 100;
const PHONE_EXCHANGE_X = 119;

function lineBaseline(band: TopBand): number {
  return PAGE_HEIGHT - band.yMaxTop + 2;
}

/**
/**
 * Strips a stored phone value to its 10 US digits, tolerating a leading "1"
 * country code (`+1 (555) 123-4567` is 11 digits after stripping punctuation).
 * Anything else — an extension, an international number, too few digits — is
 * not a US phone number this template's three-blank layout can represent, so
 * it returns undefined rather than guessing a split (MYK9-828 review: this
 * used to require exactly 10 digits and print nothing for the common
 * `+1`-prefixed case).
 */
export function normalizeUSPhoneDigits(value: string | null | undefined): string | undefined {
  const digits = value?.replace(/\D/g, '') ?? '';
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return undefined;
}

export function computeUKCEntryFormDobMarks(
  dateOfBirth: string | null | undefined
): EntryFormGridMark[] {
  const match = dateOfBirth?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return [];
  const [, , month, day] = match;

  return [
    { x: DOB_MONTH_X, y: lineBaseline(DOB_LINE_BAND), text: month, size: 8 },
    { x: DOB_DAY_X, y: lineBaseline(DOB_LINE_BAND), text: day, size: 8 },
  ];
}

export function computeUKCEntryFormPhoneMarks(
  phone: string | null | undefined
): EntryFormGridMark[] {
  const digits = normalizeUSPhoneDigits(phone);
  if (!digits) return [];
  const areaCode = digits.slice(0, 3);
  const exchange = digits.slice(3, 6);

  return [
    { x: PHONE_AREA_CODE_X, y: lineBaseline(PHONE_LINE_BAND), text: areaCode, size: 7 },
    { x: PHONE_EXCHANGE_X, y: lineBaseline(PHONE_LINE_BAND), text: exchange, size: 7 },
  ];
}
