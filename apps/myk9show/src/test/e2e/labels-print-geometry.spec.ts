import { test, expect } from '@playwright/test';
import { buildLabelStylesheet } from '../../lib/labels/labelStyles';
import { buildCalibrationTestSheetHtml } from '../../lib/labels/calibrationTestSheet';
import { buildLabelPages } from '../../lib/labels/labelLayout';
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

/**
 * Builds one sheet the way ArmbandLabelsReport does: buildLabelPages decides
 * which slots are skipped, skipped/empty slots render as empty cells, and only
 * real labels carry the `#n` armband number.
 */
function sheetHtml(template: LabelTemplate, extraCss = '', skip = 0): string {
  const items = Array.from({ length: template.labelsPerSheet - skip }, () => '101');
  const [page] = buildLabelPages(template, items, skip);
  const cells = page.cells
    .map(cell =>
      cell.type === 'item'
        ? '<div class="label-cell"><div class="armband-label"><span id="n">101</span></div></div>'
        : `<div class="label-cell label-cell--${cell.type}"></div>`
    )
    .join('');
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

  // MYK9-1771 follow-up: skipping labels must move the first real label to that
  // slot's die-cut position, and its text must keep clear of the left edge.
  // skip 0 is the positive control that the expected-position math is right.
  for (const skip of [0, 3]) {
    for (const mode of MODES) {
      test(`${template.id}: skip ${skip} puts the first label in slot ${skip + 1} (${mode.name})`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 8.5 * DPI, height: 11 * DPI });
        await page.emulateMedia({ media: 'print' });
        await page.setContent(sheetHtml(template, mode.css, skip));

        const geometry = await page.evaluate(() => {
          const text = document.querySelector('#n')!.getBoundingClientRect();
          const cell = document
            .querySelector('#n')!
            .closest('.label-cell')!
            .getBoundingClientRect();
          return {
            cellTop: cell.top,
            cellLeft: cell.left,
            textLeft: text.left,
            realLabels: document.querySelectorAll('#n').length,
          };
        });

        const column = skip % template.columns;
        const row = Math.floor(skip / template.columns);
        const expectedLeft =
          template.pageMarginLeft + column * (template.labelWidth + template.gapX);
        const expectedTop = template.pageMarginTop + row * (template.labelHeight + template.gapY);

        expect(geometry.realLabels).toBe(template.labelsPerSheet - skip);
        expect(Math.abs(geometry.cellLeft / DPI - expectedLeft)).toBeLessThan(TOLERANCE_IN);
        expect(Math.abs(geometry.cellTop / DPI - expectedTop)).toBeLessThan(TOLERANCE_IN);
        expect(
          (geometry.textLeft - geometry.cellLeft) / DPI,
          'text clearance from the left die-cut'
        ).toBeGreaterThanOrEqual(MIN_TEXT_CLEARANCE_IN - 1e-6);
      });
    }
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
  test(`${template.id}: first calibration cell's text sits inside its cell`, async ({ page }) => {
    await page.setViewportSize({ width: 8.5 * DPI, height: 11 * DPI });
    await page.emulateMedia({ media: 'print' });
    await page.setContent(buildCalibrationTestSheetHtml(template, 0, 0, 0));
    const geometry = await page.evaluate(() => {
      const cell = document.querySelector('.label-cell')!.getBoundingClientRect();
      const guide = document.querySelector('.calibration-guide')!.getBoundingClientRect();
      return {
        cell: { left: cell.left, top: cell.top, right: cell.right, bottom: cell.bottom },
        guide: { left: guide.left, top: guide.top, right: guide.right, bottom: guide.bottom },
        extras: document.querySelectorAll('.calibration-ruler-wrap, .calibration-corner-mark')
          .length,
      };
    });
    expect(geometry.extras).toBe(0);
    expect(geometry.guide.left).toBeGreaterThanOrEqual(geometry.cell.left - 0.5);
    expect(geometry.guide.top).toBeGreaterThanOrEqual(geometry.cell.top - 0.5);
    expect(geometry.guide.right).toBeLessThanOrEqual(geometry.cell.right + 0.5);
    expect(geometry.guide.bottom).toBeLessThanOrEqual(geometry.cell.bottom + 0.5);
  });
}
