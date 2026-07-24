import type { LabelTemplate } from './labelTemplates';
import { buildLabelStylesheet } from './labelStyles';

function formatCalibrationValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Builds a standalone, printable HTML document that helps a user calibrate
 * their printer against a real label sheet. It renders the same label grid
 * geometry as the live reports (via `buildLabelStylesheet`) plus corner
 * registration marks, a 1-inch reference ruler, row/column-numbered cells,
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

  const cornerMarkStyles = `
.calibration-corner-mark {
  position: fixed;
  width: 0.25in;
  height: 0.25in;
}
.calibration-corner-mark::before,
.calibration-corner-mark::after {
  content: '';
  position: absolute;
  background: #000;
}
.calibration-corner-mark::before {
  width: 0.25in;
  height: 1px;
}
.calibration-corner-mark::after {
  width: 1px;
  height: 0.25in;
}
.calibration-corner-mark--top-left { top: 0; left: 0; }
.calibration-corner-mark--top-left::before { top: 0; left: 0; }
.calibration-corner-mark--top-left::after { top: 0; left: 0; }
.calibration-corner-mark--top-right { top: 0; right: 0; }
.calibration-corner-mark--top-right::before { top: 0; right: 0; }
.calibration-corner-mark--top-right::after { top: 0; right: 0; }
.calibration-corner-mark--bottom-left { bottom: 0; left: 0; }
.calibration-corner-mark--bottom-left::before { bottom: 0; left: 0; }
.calibration-corner-mark--bottom-left::after { bottom: 0; left: 0; }
.calibration-corner-mark--bottom-right { bottom: 0; right: 0; }
.calibration-corner-mark--bottom-right::before { bottom: 0; right: 0; }
.calibration-corner-mark--bottom-right::after { bottom: 0; right: 0; }

.calibration-ruler-wrap {
  position: fixed;
  top: 0.05in;
  right: 0.05in;
  text-align: right;
}
.calibration-ruler {
  width: 1in;
  height: 0.1in;
  background: #000;
}
.calibration-ruler-caption {
  font-size: 8pt;
  margin-top: 2px;
}

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

  const cornerMarksHtml = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    .map(pos => `<div class="calibration-corner-mark calibration-corner-mark--${pos}"></div>`)
    .join('');

  const calibrationSummary = `Calibration: top ${formatCalibrationValue(offsetTop)}, left ${formatCalibrationValue(offsetLeft)}, pitch ${formatCalibrationValue(pitchAdjustment)} (thousandths of an inch)`;

  const diagnosisGuideHtml = `
<div class="calibration-guide">
  <div class="calibration-guide__values">${calibrationSummary}</div>
  <ol>
    <li>Ruler not exactly 1 inch? In the print dialog, set Scale to 100% (not "Fit to page").</li>
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

  // Out-of-flow (position: fixed) so it overlays the page without shifting
  // .label-sheet down — the sheet must land at the exact same coordinates as
  // a real label report, which requires .label-sheet to be the first
  // in-flow element in <body>.
  const rulerHtml = `
<div class="calibration-ruler-wrap">
  <div class="calibration-ruler"></div>
  <div class="calibration-ruler-caption">This bar must measure exactly 1 inch</div>
</div>
`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Label Calibration Test Sheet</title><style>${css}${cornerMarkStyles}</style></head><body><div class="label-sheet">${cellsHtml}</div>${cornerMarksHtml}${rulerHtml}</body></html>`;
}
