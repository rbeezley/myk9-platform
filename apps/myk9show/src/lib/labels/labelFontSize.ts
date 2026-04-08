const MIN_FONT_PX = 24;
const POINTS_PER_INCH = 72;
const FIELD_HEIGHT_FRACTION = 0.1;

export function getArmbandFontSize(
  labelHeightInches: number,
  activeFieldCount: number
): number {
  const totalPt = labelHeightInches * POINTS_PER_INCH;
  const fieldSpace = totalPt * FIELD_HEIGHT_FRACTION * activeFieldCount;
  const padding = totalPt * 0.15;
  const available = totalPt - fieldSpace - padding;
  const size = Math.floor(available * 0.6);
  return Math.max(MIN_FONT_PX, Math.min(size, totalPt));
}
