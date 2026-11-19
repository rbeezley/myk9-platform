import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import type { GeneratedPremium, PremiumStyle } from '../../../types/premium-types';
import { STYLE_TOKENS } from '../pdf/pdfStyles';

const toBlobMock = vi.fn();
vi.mock('@react-pdf/renderer', () => ({
  pdf: () => ({ toBlob: toBlobMock }),
  Document: () => null,
  Font: { register: vi.fn() },
  StyleSheet: { create: (s: unknown) => s },
}));
vi.mock('@/services/database/supabaseClient', () => ({ supabase: {} }));
vi.mock('../pdf/AKCPremiumTemplate', () => ({ AKCPremiumTemplate: () => null }));
vi.mock('../pdf/UKCPremiumTemplate', () => ({ UKCPremiumTemplate: () => null }));

import { renderPremiumPdf } from '../publishPremium';
import { appendAkcEntryForm, premiumHasAkcEntryForm } from '../akcEntryFormAppendix';

// jsdom's Blob has no arrayBuffer(); browsers do.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

const TEMPLATE_BYTES = new Uint8Array(
  readFileSync(join(__dirname, '../../../../../../docs/AKC-forms/SW-EntryForm.pdf'))
);
const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
const PREMIUM_PAGES = 3;

async function fakePremiumBlob(): Promise<Blob> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < PREMIUM_PAGES; i++) doc.addPage([612, 792]);
  return new Blob([(await doc.save()) as BlobPart], { type: 'application/pdf' });
}

async function pageCount(blob: Blob): Promise<number> {
  return (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();
}

function makePremium(org: string, style: PremiumStyle, trialType = 'Scent Work'): GeneratedPremium {
  return {
    org: org as GeneratedPremium['org'],
    style,
    trials: [{ type: trialType }],
  } as unknown as GeneratedPremium;
}

let templatePages: number;

beforeEach(async () => {
  templatePages = (await PDFDocument.load(TEMPLATE_BYTES)).getPageCount();
  toBlobMock.mockReset();
  toBlobMock.mockImplementation(fakePremiumBlob);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(TEMPLATE_BYTES as BlobPart, { status: 200 }))
  );
});

describe('premium PDF ends with the official AKC entry form (MYK9-2057)', () => {
  it('appends the template pages after the last premium page', async () => {
    const out = await appendAkcEntryForm(await fakePremiumBlob(), async () => TEMPLATE_BYTES);
    expect(await pageCount(out)).toBe(PREMIUM_PAGES + templatePages);
    expect(templatePages).toBeGreaterThan(0);
  });

  it.each(ALL_STYLES)('an AKC premium in the %s style ends with the entry form', async style => {
    const out = await renderPremiumPdf('show-1', makePremium('AKC', style), false);
    expect(await pageCount(out)).toBe(PREMIUM_PAGES + templatePages);
  });

  it.each(ALL_STYLES)('a UKC premium in the %s style is unchanged', async style => {
    const out = await renderPremiumPdf('show-1', makePremium('UKC', style), false);
    expect(await pageCount(out)).toBe(PREMIUM_PAGES);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('an ASCA premium is unchanged', async () => {
    const out = await renderPremiumPdf('show-1', makePremium('ASCA', 'monogram'), false);
    expect(await pageCount(out)).toBe(PREMIUM_PAGES);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('an AKC premium with no Scent Work trial is unchanged (the form is the Scent Work one)', () => {
    expect(premiumHasAkcEntryForm(makePremium('AKC', 'monogram', 'Fast CAT'))).toBe(false);
    expect(premiumHasAkcEntryForm(makePremium('AKC', 'monogram'))).toBe(true);
  });

  it('keeps the entry form fillable: its fields survive, and one fills, saves and reopens', async () => {
    const templateFields = (await PDFDocument.load(TEMPLATE_BYTES)).getForm().getFields();
    expect(templateFields.length).toBeGreaterThan(0);

    const out = await appendAkcEntryForm(await fakePremiumBlob(), async () => TEMPLATE_BYTES);
    const doc = await PDFDocument.load(await out.arrayBuffer());
    const form = doc.getForm();
    expect(form.getFields().map(f => f.getName())).toEqual(templateFields.map(f => f.getName()));

    const textField = form.getFields().find(f => f.constructor.name === 'PDFTextField');
    if (!textField) throw new Error('template has no text field');
    form.getTextField(textField.getName()).setText('Willow');
    const reopened = await PDFDocument.load(await doc.save());
    expect(reopened.getForm().getTextField(textField.getName()).getText()).toBe('Willow');
  });

  it('puts the premium first and the entry form last', async () => {
    const premium = await PDFDocument.create();
    for (let i = 0; i < PREMIUM_PAGES; i++) premium.addPage([500 + i, 700]);
    const out = await appendAkcEntryForm(
      new Blob([(await premium.save()) as BlobPart], { type: 'application/pdf' }),
      async () => TEMPLATE_BYTES
    );
    const widths = (await PDFDocument.load(await out.arrayBuffer()))
      .getPages()
      .map(p => Math.round(p.getWidth()));
    expect(widths.slice(0, PREMIUM_PAGES)).toEqual([500, 501, 502]);
    expect(widths).toHaveLength(PREMIUM_PAGES + templatePages);
  });

  it('reads the trial types as stored (most AKC trials are `scent_work`)', () => {
    for (const type of ['scent_work', 'Scent Work', 'Scent Work Nationals', 'scent-work']) {
      expect(premiumHasAkcEntryForm(makePremium('AKC', 'monogram', type))).toBe(true);
    }
    expect(premiumHasAkcEntryForm(makePremium('AKC', 'monogram', 'nosework'))).toBe(false);
  });
});
