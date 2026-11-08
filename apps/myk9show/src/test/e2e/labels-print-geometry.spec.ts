import { test, expect } from '@playwright/test';
import { buildLabelStylesheet } from '../../lib/labels/labelStyles';
import { buildCalibrationTestSheetHtml } from '../../lib/labels/calibrationTestSheet';
import { getAllTemplates, type LabelTemplate } from '../../lib/labels/labelTemplates';

/**
 * MYK9-1771: labels printed into the Avery 18262 top margin because the sheet
 * offset lived in `@page { margin }`, which Chrome's "Margins: None" discards.
 * The offset is now carried by the content, so it must land at the template's
 * top/left margin whether the page margin is honored or zeroed. Hermetic: no
 * app or sign-in, it renders the generated stylesheet directly.
 */

const DPI = 96;
const TOLERANCE_IN = 0.02;
const MIN_TEXT_CLEARANCE_IN = 0.15;

function sheetHtml(template: LabelTemplate, extraCss = ''): string {
  const cells = Array.from(
    { length: template.labelsPerSheet },
    () => '<div class="label-cell"><div class="armband-label"><span id="n">101</span></div></div>'
  ).join('');
  return `<!DOCTYPE html><html><head><style>${buildLabelStylesheet(template)}${extraCss}</style></head><body><div class="label-sheet">${cells}</div></body></html>`;
}

// Mode 1: page margin as the stylesheet declares it. Mode 2: a user who picked
// Chrome "Margins: None" (page margin forced to 0, which is also what the
// stylesheet declares; the extra rule makes the simulation explicit).
const MODES = [
  { name: 'margins honored', css: '' },
  { name: 'Margins: None', css: '@page { margin: 0 !important; }' },
] as const;

for (const template of getAllTemplates()) {
  for (const mode of MODES) {
    test(`${template.id}: first label sits at the template offset (${mode.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 8.5 * DPI, height: 11 * DPI });
      await page.emulateMedia({ media: 'print' });
      await page.setContent(sheetHtml(template, mode.css));

      const geometry = await page.evaluate(() => {
        const cell = document.querySelector('.label-cell')!.getBoundingClientRect();
        const text = document.querySelector('#n')!.getBoundingClientRect();
        const sheet = document.querySelector('.label-sheet')!.getBoundingClientRect();
        const last = [...document.querySelectorAll('.label-cell')].at(-1)!.getBoundingClientRect();
        return {
          cellTop: cell.top,
          cellLeft: cell.left,
          textLeft: text.left,
          sheetHeight: sheet.height,
          lastBottom: last.bottom,
          lastRight: last.right,
        };
      });

      expect(Math.abs(geometry.cellTop / DPI - template.pageMarginTop)).toBeLessThan(TOLERANCE_IN);
      expect(Math.abs(geometry.cellLeft / DPI - template.pageMarginLeft)).toBeLessThan(
        TOLERANCE_IN
      );
      expect(
        (geometry.textLeft - geometry.cellLeft) / DPI,
        'content clearance from the left die-cut'
      ).toBeGreaterThanOrEqual(MIN_TEXT_CLEARANCE_IN - 1e-6);
      expect(geometry.lastBottom / DPI).toBeLessThanOrEqual(11 + 1e-6);
      expect(geometry.lastRight / DPI).toBeLessThanOrEqual(8.5 + 1e-6);
    });
  }

  test(`${template.id}: a full sheet prints on one page`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'page.pdf is Chromium only');
    await page.setContent(sheetHtml(template));
    const pdf = await page.pdf({ preferCSSPageSize: true });
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(1);
  });
}

test('two sheets print on two pages (positive control for the page count)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'page.pdf is Chromium only');
  const [template] = getAllTemplates();
  const html = sheetHtml(template);
  const second = html
    .match(/<div class="label-sheet">.*<\/div><\/body>/s)![0]
    .replace('</body>', '');
  await page.setContent(html.replace('</body>', `${second}</body>`));
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).toHaveLength(2);
});

for (const template of getAllTemplates()) {
  test(`${template.id}: calibration ruler and corner marks stay 0.25 in inside the page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 8.5 * DPI, height: 11 * DPI });
    await page.emulateMedia({ media: 'print' });
    await page.setContent(buildCalibrationTestSheetHtml(template, 0, 0, 0));
    const rects = await page.evaluate(() =>
      [...document.querySelectorAll('.calibration-corner-mark, .calibration-ruler-wrap')].map(
        el => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        }
      )
    );
    // 4 marks + the ruler: guards against the selector drifting to nothing.
    expect(rects).toHaveLength(5);
    const minEdge = 0.25 * DPI - 0.5;
    for (const r of rects) {
      expect(r.left).toBeGreaterThanOrEqual(minEdge);
      expect(r.top).toBeGreaterThanOrEqual(minEdge);
      expect(8.5 * DPI - r.right).toBeGreaterThanOrEqual(minEdge);
      expect(11 * DPI - r.bottom).toBeGreaterThanOrEqual(minEdge);
    }
  });
}
