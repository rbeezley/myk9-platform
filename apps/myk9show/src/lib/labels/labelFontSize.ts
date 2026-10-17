const MIN_FONT_PX = 24;
const POINTS_PER_INCH = 72;
const FIELD_HEIGHT_FRACTION = 0.1;

const CSS_PX_PER_INCH = 96;
/** Left + right padding of `.label-cell` (0.12in each side). */
const CELL_PADDING_X_IN = 0.24;
/** Bold Arial digits are about 0.6em wide. */
const DIGIT_WIDTH_EM = 0.6;
/** The number never takes more than this share of the cell's content width. */
const MAX_NUMBER_WIDTH_SHARE = 0.5;
const MIN_SIDE_FONT_PX = 11;
const MAX_SIDE_FONT_PX = 16;

/**
 * Font size (px) for the armband number. Sized by height, then capped by width so the right-hand
 * column keeps at least half the cell's content width for a number of up to `digits` digits
 * (never fewer than 3, so one sheet's numbers stay one size).
 */
export function getArmbandFontSize(
  labelHeightInches: number,
  activeFieldCount: number,
  width?: { labelWidthInches: number; digits: number }
): number {
  const byHeight = sizeByHeight(labelHeightInches, activeFieldCount);
  if (!width) return byHeight;
  const contentPx = (width.labelWidthInches - CELL_PADDING_X_IN) * CSS_PX_PER_INCH;
  const digits = Math.max(3, width.digits);
  const byWidth = Math.floor((contentPx * MAX_NUMBER_WIDTH_SHARE) / (digits * DIGIT_WIDTH_EM));
  return Math.min(byHeight, byWidth);
}

/** Secondary text size (px): grows a little on taller labels, always below the number. */
export function getArmbandSideFontSize(labelHeightInches: number): number {
  const size = Math.round(labelHeightInches * POINTS_PER_INCH * 0.08);
  return Math.max(MIN_SIDE_FONT_PX, Math.min(size, MAX_SIDE_FONT_PX));
}

function sizeByHeight(labelHeightInches: number, activeFieldCount: number): number {
  const totalPt = labelHeightInches * POINTS_PER_INCH;
  const fieldSpace = totalPt * FIELD_HEIGHT_FRACTION * activeFieldCount;
  const padding = totalPt * 0.15;
  const available = totalPt - fieldSpace - padding;
  const size = Math.floor(available * 0.6);
  return Math.max(MIN_FONT_PX, Math.min(size, totalPt));
}
