import type { LabelTemplate } from './labelTemplates';

/**
 * @param template - Avery label template
 * @param pitchAdjustment - thousandths of an inch added to vertical row gap
 */
export function buildLabelStylesheet(
  template: LabelTemplate,
  pitchAdjustment = 0
): string {
  const {
    labelWidth,
    labelHeight,
    columns,
    pageMarginTop,
    pageMarginBottom,
    pageMarginLeft,
    pageMarginRight,
    gapX,
    gapY,
  } = template;
  const adjustedGapY = gapY + pitchAdjustment / 1000;

  return `
@page {
  size: letter;
  margin: ${pageMarginTop}in ${pageMarginRight}in ${pageMarginBottom}in ${pageMarginLeft}in;
}

body {
  margin: 0;
  padding: 0;
  font-family: Arial, sans-serif;
}

.label-sheet {
  display: grid;
  grid-template-columns: repeat(${columns}, ${labelWidth}in);
  column-gap: ${gapX}in;
  row-gap: ${adjustedGapY}in;
  padding: 0;
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
  padding: 0.08in 0.12in;
}

.armband-label {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  padding: 0.04in 0;
}

.armband-label__top {
  display: flex;
  align-items: flex-start;
  gap: 0.15in;
}

.armband-label__number {
  font-weight: bold;
  line-height: 1;
}

.armband-label__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding-top: 0.02in;
}

.armband-label__call-name {
  font-weight: 600;
}

.armband-label__handler {
  color: #444;
}

.armband-label__bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 0.1in;
}

.armband-label__date {
  color: #333;
}

.armband-label__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  color: #555;
}

@media print {
  body { margin: 0; padding: 0; }
  .label-sheet { padding: 0; }
}
`.trim();
}
