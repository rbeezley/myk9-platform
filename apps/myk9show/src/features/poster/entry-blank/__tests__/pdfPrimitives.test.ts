import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Critical guard: the PDF code path must NOT reference Archivo Black.
 *
 * Why: @react-pdf's CFF glyph parser crashes on Archivo Black's outlines.
 * Web surfaces (landing, wizard, email) can use Archivo Black freely
 * because they render in the browser. The entry-blank PDF runs through
 * @react-pdf and must use Inter Tight 800/900 as the visual substitute.
 *
 * If a future edit slips an Archivo Black reference into any PDF
 * primitive or section, this test fails and protects production from a
 * silent server-side crash.
 */

const PDF_FILES = [
  'pdfPrimitives.tsx',
  'EntryBlankHeader.tsx',
  'DogParticularsSection.tsx',
  'ClassesEnteredSection.tsx',
  'OwnerHandlerSection.tsx',
  'FeesSection.tsx',
  'AgreementSection.tsx',
  'MailToPanel.tsx',
];

const SECTIONS_DIR = join(
  __dirname,
  '..',
  'sections'
);

describe('Poster entry-blank PDF — Archivo Black guard', () => {
  for (const file of PDF_FILES) {
    it(`${file} does not reference Archivo Black`, () => {
      const path = join(SECTIONS_DIR, file);
      const src = readFileSync(path, 'utf8');
      // Allow the word in comments only when wrapped in the explicit
      // "substitute for Archivo Black" / "Archivo Black substitute"
      // documentation phrases. Strip commented documentation lines, then
      // assert the resulting source contains no other mention.
      const stripped = src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(stripped).not.toMatch(/['"]Archivo Black['"]/);
      expect(stripped).not.toMatch(/family=Archivo\+Black/);
    });
  }
});

describe('Poster entry-blank PDF primitives', () => {
  it('exports DISPLAY = Inter Tight (Archivo Black substitute)', async () => {
    const { DISPLAY } = await import('../sections/pdfPrimitives');
    expect(DISPLAY).toBe('Inter Tight');
  });

  it('exports BODY = Inter', async () => {
    const { BODY } = await import('../sections/pdfPrimitives');
    expect(BODY).toBe('Inter');
  });

  it('exports MONO = IBM Plex Mono', async () => {
    const { MONO } = await import('../sections/pdfPrimitives');
    expect(MONO).toBe('IBM Plex Mono');
  });

  it('exports the cream / ink / red palette constants', async () => {
    const { PAPER, INK, RED } = await import('../sections/pdfPrimitives');
    expect(PAPER).toBe('#f3ede0');
    expect(INK).toBe('#1f1d18');
    expect(RED).toBe('#c83b1a');
  });
});
