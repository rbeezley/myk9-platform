import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

/**
 * MYK9-2102: publishing a premium failed on myk9show.com twice, each time on a
 * resource the production CSP blocked (yoga's wasm, then the CDN fonts), because
 * dev and e2e never apply the vercel.json headers. This renders every premium
 * style in a browser page that carries the real production CSP, so the next
 * blocked resource fails here instead of on the live site. Hermetic: no sign-in,
 * no Supabase call; it imports the app's own render function from the dev server.
 */

const vercelConfig = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../vercel.json', import.meta.url)), 'utf8')
) as {
  headers: Array<{ headers: Array<{ key: string; value: string }> }>;
};
const productionCsp = vercelConfig.headers
  .flatMap(entry => entry.headers)
  .find(header => header.key === 'Content-Security-Policy')?.value;

const PROBE_PATH = '/__premium-csp-probe';

const premiumFor = (style: string) => ({
  org: 'AKC',
  style,
  templateId: null,
  show: {
    name: 'CSP Probe Show',
    startDate: '2026-08-01',
    endDate: '2026-08-02',
    venue: '1 Test Way',
    entryOpenDate: '2026-07-01',
    entryCloseDate: '2026-07-20',
    preEntryFee: 25,
    dayOfFee: 30,
    acceptChecks: true,
    acceptCash: true,
  },
  club: { name: 'Probe Club', logoUrl: null },
  secretary: {
    name: 'Jordan Ellis',
    email: 'sec@example.com',
    phone: '555-0100',
    mailingAddress: '1 Sec St',
  },
  officials: { chairman: { name: 'Alex Whitfield', email: null, phone: null } },
  trials: [
    {
      name: 'Trial 1',
      date: '2026-08-01',
      startTime: '8:00 AM',
      eventNumber: 'PROBE-001',
      type: 'Scent Work',
      judges: [{ name: 'Judge A', classes: ['Container'] }],
      classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
    },
  ],
  supplemental: {
    vetClinic: { name: 'Vet', address: '2 Vet St', phone: '555-0200' },
    accommodations: [],
    coverImageUrl: null,
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  },
  narratives: { showHours: 'Building opens 7:00 AM.', trialInformation: 'Bring water.' },
});

test.describe('Premium PDF under the production CSP', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'one engine is enough for a CSP check'
  );

  test('renders every premium style with nothing blocked', async ({ page }) => {
    test.setTimeout(180_000);
    expect(productionCsp).toBeDefined();

    await page.route(`**${PROBE_PATH}`, route =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        headers: { 'Content-Security-Policy': productionCsp! },
        body: '<!doctype html><html><head><title>probe</title></head><body></body></html>',
      })
    );
    // Chrome logs every CSP refusal to the console; Vite's HMR websocket is a
    // dev-only connection on another port, so it is not a production finding.
    const blocked: string[] = [];
    page.on('console', message => {
      const text = message.text();
      if (text.includes('Content Security Policy') && !text.includes('ws://')) blocked.push(text);
    });
    await page.goto(PROBE_PATH);

    const sizes = await page.evaluate(async makePremiumSource => {
      // The dev server's React refresh preamble is an inline script in index.html,
      // which this page does not have; stub it so .tsx modules load.
      const w = window as unknown as Record<string, unknown>;
      w.$RefreshReg$ = () => {};
      w.$RefreshSig$ = () => (type: unknown) => type;
      w.__vite_plugin_react_preamble_installed__ = true;

      const makePremium = new Function(`return ${makePremiumSource}`)() as (s: string) => unknown;
      const { STYLE_TOKENS } = await import('/src/features/premium/pdf/pdfStyles.ts');
      const { renderPremiumPdf } = await import('/src/features/premium/publishPremium.tsx');

      const rendered: Record<string, number | string> = {};
      for (const style of Object.keys(STYLE_TOKENS)) {
        try {
          const blob: Blob = await renderPremiumPdf('csp-probe', makePremium(style), false);
          rendered[style] = blob.size;
        } catch (err) {
          rendered[style] = err instanceof Error ? err.message : String(err);
        }
      }
      return rendered;
    }, premiumFor.toString());

    expect(blocked).toEqual([]);
    const styles = Object.keys(sizes);
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) {
      expect(sizes[style], `${style} rendered`).toEqual(expect.any(Number));
      expect(sizes[style] as number).toBeGreaterThan(1000);
    }
  });
});
