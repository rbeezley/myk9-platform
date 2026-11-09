import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from '@playwright/test';
import { renderReportToHtml } from '../../lib/reports/reportRenderer';
import type { ReportProps } from '../../lib/reports/types';
import { AKCSetupCheatSheetReport } from '../../components/reports/AKCSetupCheatSheetReport';
import { UKCSetupCheatSheetReport } from '../../components/reports/UKCSetupCheatSheetReport';

/**
 * MYK9-1772: the judge setup cheat sheet's header clipped under Chrome's "Margins: None"
 * because its quarter inch lived in `@page { margin }`. The inset is now carried by the
 * content, so it must hold whether the page margin is honored or zeroed, and each sheet must
 * still fit one landscape Letter page. Hermetic: the report markup is rendered here and loaded
 * with setContent, so there is no app, sign-in or database.
 */

const props: ReportProps = { showName: 'Any Show', entries: [], sortOrder: '' };
const INSET_PX = 0.25 * 96;

const SHEETS = [
  { name: 'UKC', pages: 3, component: UKCSetupCheatSheetReport },
  { name: 'AKC', pages: 3, component: AKCSetupCheatSheetReport },
] as const;

// Default: the sheet's own @page. None: Chrome discards the page margin, simulated by forcing it to 0.
const MODES = [
  { name: 'Margins: Default', css: '' },
  { name: 'Margins: None', css: '@page { margin: 0 !important; }' },
] as const;

for (const sheet of SHEETS) {
  const html = renderReportToHtml(renderToStaticMarkup(createElement(sheet.component, props)));

  for (const mode of MODES) {
    test(`${sheet.name} setup cheat sheet keeps a quarter inch inset on one landscape page per sheet (${mode.name})`, async ({
      page,
      browserName,
    }) => {
      await page.setContent(
        mode.css ? html.replace('</head>', `<style>${mode.css}</style></head>`) : html
      );
      await page.emulateMedia({ media: 'print' });

      const sheets = await page.$$eval('.setup-page', els =>
        els.map(el => {
          const box = el.getBoundingClientRect();
          const header = el.querySelector('.setup-header')!.getBoundingClientRect();
          return {
            top: box.top,
            left: box.left,
            headerTop: header.top,
            headerLeft: header.left,
            overflow: el.scrollHeight - el.clientHeight,
          };
        })
      );
      expect(sheets).toHaveLength(sheet.pages);
      for (const s of sheets) {
        expect(s.headerLeft - s.left).toBeGreaterThanOrEqual(INSET_PX - 0.5);
        expect(s.headerTop - s.top).toBeGreaterThanOrEqual(INSET_PX - 0.5);
        expect(s.overflow).toBeLessThanOrEqual(0);
      }
      expect(sheets[0].left).toBeGreaterThanOrEqual(0);
      expect(sheets[0].top).toBeGreaterThanOrEqual(0);

      // page.pdf() exists only in Chromium; the geometry above runs in every project.
      if (browserName !== 'chromium') return;
      const pdf = await page.pdf({
        preferCSSPageSize: true,
        margin: { top: 0, left: 0, right: 0, bottom: 0 },
      });
      const text = pdf.toString('latin1');
      expect((text.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBe(sheet.pages);
      const mediaBox = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
      expect(Number(mediaBox?.[1])).toBeCloseTo(792, 0);
      expect(Number(mediaBox?.[2])).toBeCloseTo(612, 0);
    });
  }
}
