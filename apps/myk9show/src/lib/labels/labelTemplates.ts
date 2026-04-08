export interface LabelTemplate {
  id: string;
  name: string;
  labelWidth: number; // inches
  labelHeight: number; // inches
  columns: number;
  rows: number;
  labelsPerSheet: number;
  pageMarginTop: number;
  pageMarginBottom: number;
  pageMarginLeft: number;
  pageMarginRight: number;
  gapX: number;
  gapY: number;
}

export const LABEL_TEMPLATES: Record<string, LabelTemplate> = {
  '18262': {
    id: '18262',
    name: '1-1/3" × 4" (Avery #18262)',
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
  },
  '18163': {
    id: '18163',
    name: '2" × 4" (Avery #18163)',
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
  },
  '8387': {
    id: '8387',
    name: '4-1/4" × 5-1/2" (Avery #8387)',
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
  },
};

export const DEFAULT_TEMPLATE_ID = '18262';

export function getLabelTemplate(id: string): LabelTemplate | undefined {
  return LABEL_TEMPLATES[id];
}

export function getAllTemplates(): LabelTemplate[] {
  return Object.values(LABEL_TEMPLATES);
}
