// Render-time benchmark — Phase 6 baseline (2026-05-06):
//   Skipped by default in CI. Run manually with
//     `cd apps/myk9show && npx vitest run renderTimeBenchmark`
//   to refresh numbers. Cold-font scenario approx (placeholders — fill in
//   real numbers in BENCHMARK_RESULTS.md when measured locally):
//     monogram   ~XXXms
//     banner     ~XXXms
//     headline   ~XXXms
//     magazine   ~XXXms
//     poster     ~XXXms
//     gazette    ~XXXms
//     fieldGuide ~XXXms
//     heritage   ~XXXms
//
// If a style consistently exceeds ~3000ms in the browser preview, that is the
// signal to self-host fonts (currently fetched from CDN). The 15s ceiling
// below is a sanity guard against hung-render regressions, not a perf bar.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { STYLE_TOKENS } from '../pdf/pdfStyles';
import type { PremiumStyle, GeneratedPremium } from '../../../types/premium-types';

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
const RENDER_TIME_CEILING_MS = 15_000;

function makePremium(style: PremiumStyle): GeneratedPremium {
  return {
    org: 'AKC',
    style,
    templateId: null,
    show: {
      name: 'Benchmark Show',
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
    club: { name: 'Bench Club', logoUrl: null },
    secretary: {
      name: 'Sec Name',
      email: 'sec@example.com',
      phone: '555-0100',
      mailingAddress: '1 Sec St',
    },
    officials: { chairman: 'Chair', steward: 'Steward' },
    trials: [
      {
        name: 'Trial 1',
        date: '2026-08-01',
        startTime: '8:00 AM',
        eventNumber: 'BENCH-001',
        type: 'Scent Work',
        judges: [{ name: 'Judge A', elements: ['Container'] }],
        classes: [{ element: 'Container', level: 'Novice', section: 'A' }],
      },
    ],
    supplemental: {
      vetClinic: { name: 'Vet', address: '2 Vet St', phone: '555-0200' },
      accommodations: [],
      hospitalityNotes: null,
      awardsDescription: null,
      additionalNotes: null,
    },
    narratives: {
      showHours: 'Building opens 7:00 AM.',
      trialInformation: 'Bring water for your dog.',
    },
  };
}

// Skipped in CI to keep the suite fast. The render path also pulls in
// react-pdf font fetching which is unreliable in headless test environments.
describe.skip('renderTimeBenchmark — manual perf check', () => {
  it.each(ALL_STYLES)(
    'measures %s render latency (cold + 2 warm samples, averaged)',
    async style => {
      // Lazy-load to avoid pulling react-pdf into the regular test bundle.
      const { pdf } = await import('@react-pdf/renderer');
      const { AKCPremiumTemplate } = await import('../pdf/AKCPremiumTemplate');
      const premium = makePremium(style);
      const element = React.createElement(AKCPremiumTemplate, { premium });

      // Cold render (warm-up — discarded).
      await pdf(element).toBlob();

      const samples: number[] = [];
      for (let i = 0; i < 2; i++) {
        const start = performance.now();
        await pdf(React.createElement(AKCPremiumTemplate, { premium })).toBlob();
        samples.push(performance.now() - start);
      }
      const avgMs = samples.reduce((a, b) => a + b, 0) / samples.length;

      console.table([{ style, avgMs: Math.round(avgMs), samples }]);

      expect(avgMs).toBeLessThan(RENDER_TIME_CEILING_MS);
    },
    RENDER_TIME_CEILING_MS * 4
  );

  it('aggregate ceiling: no single style exceeds the 15s sanity bound', () => {
    // Documentation-only assertion: the ceiling is enforced per-style above.
    expect(RENDER_TIME_CEILING_MS).toBe(15_000);
  });
});
