import { LABEL_TEMPLATES, getLabelTemplate } from '../labelTemplates';

describe('labelTemplates', () => {
  it('defines three Avery templates', () => {
    expect(Object.keys(LABEL_TEMPLATES)).toHaveLength(3);
  });

  it('18262 is 2x7 grid with correct dimensions', () => {
    const t = LABEL_TEMPLATES['18262'];
    expect(t.columns).toBe(2);
    expect(t.rows).toBe(7);
    expect(t.labelWidth).toBeCloseTo(4);
    expect(t.labelHeight).toBeCloseTo(1.333, 2);
  });

  it('18163 is 2x5 grid', () => {
    const t = LABEL_TEMPLATES['18163'];
    expect(t.columns).toBe(2);
    expect(t.rows).toBe(5);
    expect(t.labelWidth).toBe(4);
    expect(t.labelHeight).toBe(2);
  });

  it('8387 is 2x2 grid', () => {
    const t = LABEL_TEMPLATES['8387'];
    expect(t.columns).toBe(2);
    expect(t.rows).toBe(2);
    expect(t.labelWidth).toBe(4.25);
    expect(t.labelHeight).toBe(5.5);
  });

  it('getLabelTemplate returns template by id', () => {
    expect(getLabelTemplate('18262')).toBeDefined();
    expect(getLabelTemplate('18262')!.name).toContain('18262');
  });

  it('getLabelTemplate returns undefined for unknown id', () => {
    expect(getLabelTemplate('99999')).toBeUndefined();
  });

  it('every template has labelsPerSheet = columns * rows', () => {
    for (const t of Object.values(LABEL_TEMPLATES)) {
      expect(t.labelsPerSheet).toBe(t.columns * t.rows);
    }
  });

  it('every template fits on a Letter sheet (11 in tall, 8.5 in wide)', () => {
    for (const t of Object.values(LABEL_TEMPLATES)) {
      const height = t.pageMarginTop + t.rows * t.labelHeight + t.pageMarginBottom;
      const width =
        t.pageMarginLeft + t.columns * t.labelWidth + (t.columns - 1) * t.gapX + t.pageMarginRight;
      expect(height, `${t.id} height`).toBeLessThanOrEqual(11 + 1e-9);
      expect(width, `${t.id} width`).toBeLessThanOrEqual(8.5 + 1e-9);
    }
  });

  it('18262 uses Avery top/bottom margin of 0.83 in', () => {
    expect(LABEL_TEMPLATES['18262'].pageMarginTop).toBe(0.83);
    expect(LABEL_TEMPLATES['18262'].pageMarginBottom).toBe(0.83);
  });
});
