const CSS_PX_PER_INCH = 96;
const POINTS_PER_INCH = 72;
/** Left + right padding of `.label-cell` (0.12in each side). */
const CELL_PADDING_X_IN = 0.24;
/** Top + bottom padding of `.label-cell` (0.08in each) and `.armband-label` (0.04in each). */
const CELL_PADDING_Y_IN = 0.24;
/** Arial Bold digits advance 0.556em; rounded up so a near-metric fallback still fits. */
const DIGIT_WIDTH_EM = 0.58;
/**
 * Arial digits stand 0.716em tall. A 0.75em line box holds them with no dead space under the
 * baseline, so the number can fill the label's height instead of 72% of it.
 */
export const ARMBAND_NUMBER_LINE_HEIGHT = 0.75;
/** Side by side, the number never takes more than this share of the content width. */
const ROW_NUMBER_WIDTH_SHARE = 0.5;
/** Stacked, the number never takes more than this share of the content height. */
const STACKED_NUMBER_HEIGHT_SHARE = 0.55;
const MIN_FONT_PX = 24;
const MIN_SIDE_FONT_PX = 11;
const MAX_SIDE_FONT_PX = 16;

/**
 * `row`: number left, details in a right-hand column (wide labels). `stacked`: number across the
 * top, details under it, for labels tall enough that a side-by-side number would leave most of
 * the label empty.
 */
export type ArmbandLayout = 'row' | 'stacked';

export function getArmbandLayout(
  labelWidthInches: number,
  labelHeightInches: number
): ArmbandLayout {
  return labelHeightInches >= labelWidthInches * 0.75 ? 'stacked' : 'row';
}

/**
 * Font size (px) for the armband number: as large as the label allows for a number of `digits`
 * digits. Pass the longest armband in the print run so one run's numbers stay one size.
 */
export function getArmbandFontSize(
  labelWidthInches: number,
  labelHeightInches: number,
  digits: number
): number {
  const stacked = getArmbandLayout(labelWidthInches, labelHeightInches) === 'stacked';
  const contentW = (labelWidthInches - CELL_PADDING_X_IN) * CSS_PX_PER_INCH;
  const contentH = (labelHeightInches - CELL_PADDING_Y_IN) * CSS_PX_PER_INCH;
  const byWidth =
    (contentW * (stacked ? 1 : ROW_NUMBER_WIDTH_SHARE)) / (Math.max(1, digits) * DIGIT_WIDTH_EM);
  const byHeight =
    (contentH * (stacked ? STACKED_NUMBER_HEIGHT_SHARE : 1)) / ARMBAND_NUMBER_LINE_HEIGHT;
  return Math.max(MIN_FONT_PX, Math.floor(Math.min(byWidth, byHeight)));
}

/** Secondary text size (px): grows a little on taller labels, always below the number. */
export function getArmbandSideFontSize(labelHeightInches: number): number {
  const size = Math.round(labelHeightInches * POINTS_PER_INCH * 0.08);
  return Math.max(MIN_SIDE_FONT_PX, Math.min(size, MAX_SIDE_FONT_PX));
}
