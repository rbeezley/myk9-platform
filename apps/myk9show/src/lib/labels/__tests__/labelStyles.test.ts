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

  it('keeps @page margin at zero so Chrome Margins None and Default print the same', () => {
    for (const args of [
      [0, 0, 0],
      [0, 20, 50],
      [5, -20, -50],
    ] as const) {
      expect(buildLabelStylesheet(template18262, ...args)).toMatch(/@page\s*{[^}]*margin: 0;/);
    }
  });

  it('carries the template margins as sheet padding', () => {
    const css = buildLabelStylesheet(template18262);
    expect(css).toContain('padding: 0.875in 0 0 0.15625in;');
  });

  it('adds positive offsetTop and offsetLeft to the sheet padding', () => {
    const css = buildLabelStylesheet(template18262, 0, 20, 50);
    expect(css).toContain('padding: 0.895in 0 0 0.20625in;');
  });

  it('subtracts negative offsets from the sheet padding', () => {
    const css = buildLabelStylesheet(template18262, 0, -20, -50);
    expect(css).toContain('padding: 0.855in 0 0 0.10625in;');
  });

  it('clamps sheet padding at 0 for a zero-margin template', () => {
    const css = buildLabelStylesheet(template8387, 0, -20, -20);
    expect(css).toContain('padding: 0in 0 0 0in;');
  });

  it('shifts a zero-margin template with positive offsets', () => {
    const css = buildLabelStylesheet(template8387, 0, 20, 30);
    expect(css).toContain('padding: 0.02in 0 0 0.03in;');
  });

  it('pitch unaffected by offsets', () => {
    const css = buildLabelStylesheet(template18262, 5, 20, 50);
    expect(css).toContain('row-gap: 0.005in;');
  });
});
