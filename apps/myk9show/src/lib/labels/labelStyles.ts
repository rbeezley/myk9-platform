import type { LabelTemplate } from './labelTemplates';

const PAGE_WIDTH_IN = 8.5;
const PAGE_HEIGHT_IN = 11;
/** Keeps a full-height sheet a hair under the page so rounding never adds a blank page. */
const PAGE_SLACK_IN = 0.01;
/** Space between a label's die-cut edge and its text (armband number clear of the left edge). */
const CELL_SIDE_PADDING_IN = 0.17;

/**
 * @param template - Avery label template
 * @param pitchAdjustment - thousandths of an inch added to vertical row gap
 * @param offsetTop - thousandths of an inch added to the top page margin (calibration shift)
 * @param offsetLeft - thousandths of an inch added to the left page margin (calibration shift)
 */
export function buildLabelStylesheet(
  template: LabelTemplate,
  pitchAdjustment = 0,
  offsetTop = 0,
  offsetLeft = 0
): string {
  const { labelWidth, labelHeight, columns, pageMarginTop, pageMarginLeft, gapX, gapY } = template;
  const adjustedGapY = gapY + pitchAdjustment / 1000;

  const round = (value: number): number => Math.round(value * 1e6) / 1e6;

  const effectiveTop = Math.max(0, round(pageMarginTop + offsetTop / 1000));
  const effectiveLeft = Math.max(0, round(pageMarginLeft + offsetLeft / 1000));
  const inset = template.cellInset ?? 0;
  const padTop = Math.max(0.08, inset);
  const padSide = Math.max(CELL_SIDE_PADDING_IN, inset);

  // MYK9-1771: the sheet geometry is carried by the content, not by @page.
  // Chrome's "Margins: None" discards @page margins, so the page box is
  // margin-free and each .label-sheet is a page-sized box whose padding is the
  // template's top/left margin. Default and None margins then print the same.
  return `
@page {
  size: letter;
  margin: 0;
}

/* The sheet renders in an iframe. Pin a light canvas: in dark mode the iframe
   otherwise inherits a dark background, and the black label text disappears. */
html,
body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
  background: #fff;
  color-scheme: light;
}

.label-sheet {
  display: grid;
  box-sizing: border-box;
  width: ${PAGE_WIDTH_IN}in;
  height: ${PAGE_HEIGHT_IN - PAGE_SLACK_IN}in;
  overflow: hidden;
  align-content: start;
  justify-content: start;
  padding: ${effectiveTop}in 0 0 ${effectiveLeft}in;
  grid-template-columns: repeat(${columns}, ${labelWidth}in);
  grid-auto-rows: ${labelHeight}in;
  column-gap: ${gapX}in;
  row-gap: ${adjustedGapY}in;
  margin: 0;
}

.label-sheet + .label-sheet {
  page-break-before: always;
}

.label-cell {
  width: ${labelWidth}in;
  height: ${labelHeight}in;
  box-sizing: border-box;
  overflow: hidden;
  position: relative;
  padding: ${padTop}in ${padSide}in;
}

.armband-label {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 0.04in 0;
}

.armband-label__call-name {
  font-weight: 600;
}

.armband-label__handler {
  color: #444;
}

.armband-label__date {
  color: #333;
}

.armband-label__show-code {
  font-weight: 600;
  color: #222;
}

.armband-label__actions {
  color: #555;
}

@media print {
  body { margin: 0; padding: 0; }
}
`.trim();
}
