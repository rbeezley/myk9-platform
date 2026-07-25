import { buildLabelStylesheet } from '../labelStyles';
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
const template18163: LabelTemplate = {
  id: '18163',
  name: 'test',
  labelWidth: 4,
  labelHeight: 2,
  columns: 2,
  rows: 5,
  labelsPerSheet: 10,
  pageMarginTop: 0.5,
  pageMarginBottom: 0.5,
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

describe('buildLabelStylesheet', () => {
  it('returns a non-empty CSS string', () => {
    const css = buildLabelStylesheet(template18262);
    expect(css.length).toBeGreaterThan(0);
  });

  it('contains @page rule with letter size', () => {
    const css = buildLabelStylesheet(template18262);
    expect(css).toContain('@page');
    expect(css).toContain('size: letter');
  });

  it('sets grid columns matching template', () => {
    const css = buildLabelStylesheet(template18262);
    expect(css).toContain('grid-template-columns: repeat(2');
  });

  it('sets label cell dimensions from template', () => {
    const css = buildLabelStylesheet(template18163);
    expect(css).toContain('4in');
    expect(css).toContain('2in');
  });

  it('includes page-break-before for multi-page support', () => {
    const css = buildLabelStylesheet(template18262);
    expect(css).toContain('page-break-before');
  });

  it('applies pitch adjustment to row gap', () => {
    const css = buildLabelStylesheet(template18262, 5);
    expect(css).toContain('0.005in');
  });

  it('handles negative pitch adjustment', () => {
    const css = buildLabelStylesheet(template18262, -3);
    expect(css).toContain('-0.003in');
  });

  it('defaults to zero pitch adjustment', () => {
    const cssDefault = buildLabelStylesheet(template18262);
    const cssZero = buildLabelStylesheet(template18262, 0);
    expect(cssDefault).toBe(cssZero);
  });

  it('default output unchanged when offsets are 0', () => {
    const cssDefault = buildLabelStylesheet(template18262);
    const cssExplicit = buildLabelStylesheet(template18262, 0, 0, 0);
    expect(cssDefault).toBe(cssExplicit);
  });

  it('applies positive offsetTop to top margin and compensates bottom margin', () => {
    const css = buildLabelStylesheet(template18262, 0, 20, 0);
    // pageMarginTop 0.875 + 0.02 = 0.895; pageMarginBottom 0.875 - 0.02 = 0.855
    expect(css).toContain('margin: 0.895in 0.15625in 0.855in 0.15625in;');
  });

  it('applies negative offsetTop to top margin and compensates bottom margin', () => {
    const css = buildLabelStylesheet(template18262, 0, -20, 0);
    // pageMarginTop 0.875 - 0.02 = 0.855; pageMarginBottom 0.875 + 0.02 = 0.895
    expect(css).toContain('margin: 0.855in 0.15625in 0.895in 0.15625in;');
  });

  it('applies positive offsetLeft to left margin and compensates right margin', () => {
    const css = buildLabelStylesheet(template18262, 0, 0, 50);
    // pageMarginLeft 0.15625 + 0.05 = 0.20625; pageMarginRight 0.15625 - 0.05 = 0.10625
    expect(css).toContain('margin: 0.875in 0.10625in 0.875in 0.20625in;');
  });

  it('applies negative offsetLeft to left margin and compensates right margin', () => {
    const css = buildLabelStylesheet(template18262, 0, 0, -50);
    // pageMarginLeft 0.15625 - 0.05 = 0.10625; pageMarginRight 0.15625 + 0.05 = 0.20625
    expect(css).toContain('margin: 0.875in 0.20625in 0.875in 0.10625in;');
  });

  it('clamps effective top margin at 0 for zero-margin template, no compensation possible', () => {
    const css = buildLabelStylesheet(template8387, 0, -20, 0);
    expect(css).toContain('margin: 0in 0in 0in 0in;');
  });

  it('shifts zero-margin template with positive offsetTop and no compensation', () => {
    const css = buildLabelStylesheet(template8387, 0, 20, 0);
    // effectiveTop 0.02, bottom compensation 0 - 0.02 clamped to 0
    expect(css).toContain('margin: 0.02in 0in 0in 0in;');
  });

  it('clamps effective left margin at 0 for zero-margin template, no compensation possible', () => {
    const css = buildLabelStylesheet(template8387, 0, 0, -20);
    expect(css).toContain('margin: 0in 0in 0in 0in;');
  });

  it('shifts zero-margin template with positive offsetLeft and no compensation', () => {
    const css = buildLabelStylesheet(template8387, 0, 0, 20);
    expect(css).toContain('margin: 0in 0in 0in 0.02in;');
  });

  it('pitch unaffected by offsets', () => {
    const css = buildLabelStylesheet(template18262, 5, 20, 50);
    expect(css).toContain('row-gap: 0.005in;');
  });
});
