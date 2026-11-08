import type { LabelTemplate } from './labelTemplates';
import { buildLabelStylesheet } from './labelStyles';

function formatCalibrationValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Builds a standalone, printable HTML document that helps a user calibrate
 * their printer against a real label sheet. It renders the same label grid
 * geometry as the live reports (via `buildLabelStylesheet`) plus dashed label
 * outlines, row/column-numbered cells,
 * and a short diagnosis guide — all printed on the sheet so a physical
 * printout is self-describing.
 */
export function buildCalibrationTestSheetHtml(
  template: LabelTemplate,
  pitchAdjustment: number,
  offsetTop: number,
  offsetLeft: number
): string {
  const css = buildLabelStylesheet(template, pitchAdjustment, offsetTop, offsetLeft);

  const guideStyles = `
.calibration-guide {
  font-size: 7pt;
  line-height: 1.3;
  color: #000;
}
.calibration-guide ol {
  margin: 2px 0;
  padding-left: 14px;
}
.calibration-guide__values {
  font-weight: bold;
  margin-top: 2px;
}

.calibration-cell-marker {
  position: absolute;
  top: 2px;
  left: 2px;
  font-size: 7pt;
  color: #000;
}
`;

  const calibrationSummary = `Calibration: top ${formatCalibrationValue(offsetTop)}, left ${formatCalibrationValue(offsetLeft)}, pitch ${formatCalibrationValue(pitchAdjustment)} (thousandths of an inch)`;

  const diagnosisGuideHtml = `
<div class="calibration-guide">
  <div class="calibration-guide__values">${calibrationSummary}</div>
  <ol>
    <li>Labels look the wrong size? In the print dialog, set Scale to 100% (not "Fit to page").</li>
    <li>Whole grid shifted the same amount everywhere? Adjust Top/Left offset.</li>
    <li>Rows drift further off toward the bottom? Adjust Row pitch.</li>
  </ol>
</div>
`;

  const cellsHtml = Array.from({ length: template.rows }, (_, rowIndex) =>
    Array.from({ length: template.columns }, (_, colIndex) => {
      const isFirstCell = rowIndex === 0 && colIndex === 0;
      // The first cell holds the diagnosis guide, which already occupies the
      // top-left corner where the row/col marker would render — omit the
      // marker there to avoid overlapping text (row/col 1,1 is implied).
      const cellMarkerHtml = isFirstCell
        ? ''
        : `<div class="calibration-cell-marker">Row ${rowIndex + 1}, Col ${colIndex + 1}</div>`;
      return `<div class="label-cell" style="border: 1px dashed #000;">
${isFirstCell ? diagnosisGuideHtml : ''}
${cellMarkerHtml}
</div>`;
    }).join('')
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label Calibration Test Sheet</title><style>${css}${guideStyles}</style></head><body><div class="label-sheet">${cellsHtml}</div></body></html>`;
}
