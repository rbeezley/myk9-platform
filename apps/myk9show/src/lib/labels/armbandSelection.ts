/** An inclusive armband range; a single armband is `[n, n]`. */
export type ArmbandRange = readonly [number, number];

type ArmbandSelection = { ranges: ArmbandRange[] } | { invalid: string };

const PIECE = /^(\d+)(?:\s*[-–]\s*(\d+))?$/;

/**
 * Reads armbands typed the way a print dialog takes pages: `101, 105, 110-115`. Ranges are kept,
 * not expanded, so `1-99999` costs nothing. Blank text selects nothing; the first piece that is
 * not a positive number or range is returned so the field can name it.
 */
export function parseArmbandSelection(text: string): ArmbandSelection {
  const ranges: ArmbandRange[] = [];
  for (const piece of text.split(',').map(part => part.trim())) {
    if (!piece) continue;
    const match = PIECE.exec(piece);
    const low = Number(match?.[1]);
    const high = Number(match?.[2] ?? match?.[1]);
    if (!(low > 0 && high > 0)) return { invalid: piece };
    ranges.push([Math.min(low, high), Math.max(low, high)]);
  }
  return { ranges };
}

/**
 * The ranges a label run prints for the typed text: null (no limit) when blank, none at all when
 * a piece cannot be read, so a typo never prints every armband.
 */
export function printRangesFor(text: string): readonly ArmbandRange[] | null {
  const selection = parseArmbandSelection(text);
  if ('invalid' in selection) return [];
  return selection.ranges.length > 0 ? selection.ranges : null;
}

export function armbandInSelection(armband: number, ranges: readonly ArmbandRange[]): boolean {
  return ranges.some(([low, high]) => armband >= low && armband <= high);
}
