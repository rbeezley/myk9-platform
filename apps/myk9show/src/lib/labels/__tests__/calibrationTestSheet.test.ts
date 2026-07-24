import { buildCalibrationTestSheetHtml } from '../calibrationTestSheet';
import type { LabelTemplate } from '../labelTemplates';

const template18262: LabelTemplate = {
  id: '18262',
  name: 'test',
  labelWidth: 4,
  labelHeight: 1.333,
  columns: 2,
  rows: 7,
  labelsPerSheet: 14,
  pageMarginTop: 0.875,
  pageMarginBottom: 0.875,
  pageMarginLeft: 0.15625,
  pageMarginRight: 0.15625,
  gapX: 0.1875,
  gapY: 0,
};

const template8387: LabelTemplate = {
  id: '8387',
  name: 'test',
  labelWidth: 4.25,
  labelHeight: 5.5,
  columns: 2,
  rows: 2,
  labelsPerSheet: 4,
  pageMarginTop: 0,
  pageMarginBottom: 0,
  pageMarginLeft: 0,
  pageMarginRight: 0,
  gapX: 0,
  gapY: 0,
};

describe('buildCalibrationTestSheetHtml', () => {
  it('includes corner registration marks at all four corners', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 0, 0, 0);
    expect(html).toContain('calibration-corner-mark--top-left');
    expect(html).toContain('calibration-corner-mark--top-right');
    expect(html).toContain('calibration-corner-mark--bottom-left');
    expect(html).toContain('calibration-corner-mark--bottom-right');
  });

  it('includes a 1-inch reference ruler with caption', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 0, 0, 0);
    expect(html).toContain('width: 1in');
    expect(html).toContain('This bar must measure exactly 1 inch');
  });

  it('renders one grid cell per template cell with row numbers, for template 18262', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 0, 0, 0);
    const cellCount = (html.match(/class="label-cell"/g) ?? []).length;
    expect(cellCount).toBe(template18262.rows * template18262.columns);
    for (let row = 1; row <= template18262.rows; row++) {
      expect(html).toContain(`Row ${row}`);
    }
  });

  it('renders one grid cell per template cell with row numbers, for template 8387', () => {
    const html = buildCalibrationTestSheetHtml(template8387, 0, 0, 0);
    const cellCount = (html.match(/class="label-cell"/g) ?? []).length;
    expect(cellCount).toBe(template8387.rows * template8387.columns);
    for (let row = 1; row <= template8387.rows; row++) {
      expect(html).toContain(`Row ${row}`);
    }
  });

  it('includes all three diagnosis lines', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 0, 0, 0);
    expect(html).toContain(
      'Ruler not exactly 1 inch? In the print dialog, set Scale to 100% (not "Fit to page").'
    );
    expect(html).toContain(
      'Whole grid shifted the same amount everywhere? Adjust Top/Left offset.'
    );
    expect(html).toContain('Rows drift further off toward the bottom? Adjust Row pitch.');
  });

  it('includes the current calibration values, formatted', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 3, 5, 0);
    expect(html).toContain('Calibration: top +5, left 0, pitch +3 (thousandths of an inch)');
  });

  it('formats negative calibration values without a leading plus', () => {
    const html = buildCalibrationTestSheetHtml(template18262, -3, -5, -1);
    expect(html).toContain('Calibration: top -5, left -1, pitch -3 (thousandths of an inch)');
  });

  it('stylesheet portion reflects passed calibration (offsetTop applied to margin)', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 0, 20, 0);
    // pageMarginTop 0.875 + 0.02 = 0.895; pageMarginBottom 0.875 - 0.02 = 0.855
    expect(html).toContain('margin: 0.895in 0.15625in 0.855in 0.15625in;');
  });

  it('stylesheet portion reflects passed pitch adjustment (row-gap)', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 5, 0, 0);
    expect(html).toContain('row-gap: 0.005in;');
  });

  it('returns a complete standalone HTML document', () => {
    const html = buildCalibrationTestSheetHtml(template18262, 0, 0, 0);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html>');
    expect(html).toContain('</html>');
  });
});
