import { describe, expect, it } from 'vitest';
import { buildFieldGuideHtml, type FieldGuideEmailData } from './fieldGuide-email';

function makeData(overrides: Partial<FieldGuideEmailData> = {}): FieldGuideEmailData {
  return {
    showCode: 'BCKC.2026.SS',
    clubName: 'Bexar County Kennel Club',
    clubCity: 'San Antonio, TX',
    showTitle: 'Spring Scent Work Trial',
    dateRange: 'Jun 12–14, 2026',
    salutation: 'Sarah',
    dogName: "GCh. Ridgeway's Wandering Cooper, CGC",
    dogCallName: 'Cooper',
    dogBreed: 'GSP',
    dogSex: 'F',
    runs: [
      {
        numeral: '01',
        dayLabel: 'FRI JUN 12',
        classLabel: 'EX · Containers',
        judgeName: 'C. Beagles',
        armband: '247',
      },
    ],
    runCount: 1,
    totalFeesFormatted: '$25.00',
    receiptNumber: '2026-0137',
    armbandNumber: '247',
    venue: null,
    doorsTime: null,
    firstClassTime: null,
    parkingNotes: null,
    hospitalityNotes: null,
    cratingNotes: null,
    secretaryEmail: 'secretary@bckc.org',
    secretaryPhone: null,
    trialUrl: null,
    trialChairName: null,
    trialChairTitle: null,
    memberClubLanguage: 'A member club of the American Kennel Club',
    ...overrides,
  };
}

describe('buildFieldGuideHtml', () => {
  it('produces an HTML document with the show title', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Spring Scent Work Trial');
  });

  it('puts the showCode in the top dark ID strip with the orange accent', () => {
    const html = buildFieldGuideHtml(makeData({ showCode: 'BCKC.2026.SS' }));
    expect(html).toContain('BCKC.2026.SS');
    expect(html).toContain('#c96442'); // orange accent on the showCode
  });

  it('uses the Field Guide indicator-orange (#c96442) for the CONFIRMED chip', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).toContain('background:#c96442');
    expect(html).toContain('CONFIRMED');
  });

  it('renders the parchment background (#f6f1e6) on the email shell', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).toContain('background:#f6f1e6');
  });

  it('emits ZERO font-style:italic declarations (Field Guide discipline)', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).not.toContain('font-style:italic');
    expect(html).not.toContain('font-style: italic');
  });

  it('emits NO display-serif font families anywhere in the HTML', () => {
    const html = buildFieldGuideHtml(makeData());
    // The email surface has no welcome-prose or agreement block, so the
    // single allowed serif (IBM Plex Serif) must NOT appear here.
    expect(html).not.toContain('IBM Plex Serif');
    expect(html).not.toContain('Cormorant Garamond');
    expect(html).not.toContain('Playfair');
    expect(html).not.toContain('Bodoni');
    expect(html).not.toContain('EB Garamond');
    expect(html).not.toContain('Source Serif');
  });

  it('uses IBM Plex Sans + IBM Plex Mono and nothing else for type', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).toContain('IBM Plex Sans');
    expect(html).toContain('IBM Plex Mono');
    // Sanity check: other styles' families must not leak in.
    expect(html).not.toContain('Inter Tight');
    expect(html).not.toContain('Archivo Black');
  });

  it('escapes user-controlled fields against HTML injection', () => {
    const html = buildFieldGuideHtml(
      makeData({
        clubName: '<script>alert(1)</script>',
        showTitle: '"OnLoad" trial & co.',
      })
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;OnLoad&quot;');
    expect(html).toContain('co.');
  });

  it('renders receipt number in the top strip when supplied', () => {
    const html = buildFieldGuideHtml(makeData({ receiptNumber: '2026-0137' }));
    expect(html).toContain('RECEIPT 2026-0137');
  });

  it('omits the receipt strip text entirely when registration number is null', () => {
    const html = buildFieldGuideHtml(makeData({ receiptNumber: null }));
    expect(html).not.toContain('RECEIPT 2026-0137');
  });

  it('renders the armband chip when armbandNumber is supplied', () => {
    const html = buildFieldGuideHtml(makeData({ armbandNumber: '247' }));
    expect(html).toContain('ARMBAND');
    expect(html).toContain('#247');
  });

  it('omits the armband chip text when armbandNumber is explicitly null', () => {
    const html = buildFieldGuideHtml(makeData({ armbandNumber: null }));
    expect(html).not.toContain('ARMBAND');
  });

  it('derives armbandNumber from the first non-null run armband when omitted', () => {
    // The dispatcher in index.ts doesn't know Field-Guide-specific
    // projections, so the builder pulls the chip value from `runs` by
    // default. Single dog → single armband per show.
    const data = makeData({
      runs: [
        { numeral: '01', dayLabel: 'FRI JUN 12', classLabel: 'EX · Containers', judgeName: 'CB', armband: '142' },
        { numeral: '03', dayLabel: 'SAT JUN 13', classLabel: 'EX · Interiors', judgeName: 'CB', armband: '142' },
      ],
    });
    // Strip the explicit override so the derivation path runs.
    delete (data as Partial<FieldGuideEmailData>).armbandNumber;
    const html = buildFieldGuideHtml(data);
    expect(html).toContain('ARMBAND');
    expect(html).toContain('#142');
  });

  it('skips the chip when armbandNumber is omitted and no run has an armband yet', () => {
    const data = makeData({
      runs: [
        { numeral: '01', dayLabel: 'FRI JUN 12', classLabel: 'EX · Containers', judgeName: 'CB', armband: null },
      ],
    });
    delete (data as Partial<FieldGuideEmailData>).armbandNumber;
    const html = buildFieldGuideHtml(data);
    expect(html).not.toContain('ARMBAND');
  });

  it('singularises the run-count label when only one run', () => {
    const html = buildFieldGuideHtml(makeData({ runCount: 1 }));
    expect(html).toContain('1 RUN');
    expect(html).not.toContain('1 RUNS');
  });

  it('pluralises the run-count label when multiple runs', () => {
    const html = buildFieldGuideHtml(makeData({ runCount: 3 }));
    expect(html).toContain('3 RUNS');
  });

  it('paints alternating data-table rows with paper-warm background', () => {
    const html = buildFieldGuideHtml(
      makeData({
        runs: [
          { numeral: '01', dayLabel: 'FRI JUN 12', classLabel: 'EX · Containers', judgeName: 'CB', armband: '247' },
          { numeral: '03', dayLabel: 'SAT JUN 13', classLabel: 'EX · Interiors', judgeName: 'CB', armband: '247' },
          { numeral: '05', dayLabel: 'SUN JUN 14', classLabel: 'EX · Buried', judgeName: 'CB', armband: '247' },
        ],
        runCount: 3,
      })
    );
    // The 2nd row is alternating — paper-warm.
    expect(html).toContain('background:#ebe4cf');
  });

  it('falls back to em-dash for missing armband on a run', () => {
    const html = buildFieldGuideHtml(
      makeData({
        runs: [
          {
            numeral: '01',
            dayLabel: 'FRI JUN 12',
            classLabel: 'EX · Containers',
            judgeName: 'CB',
            armband: null,
          },
        ],
      })
    );
    expect(html).toContain('—');
  });

  it('uses "Hi {salutation}" not "Dear ..." (Field Guide voice)', () => {
    const html = buildFieldGuideHtml(makeData({ salutation: 'Sarah' }));
    expect(html).toContain('Hi <strong');
    expect(html).toContain('Sarah');
    expect(html).not.toContain('Dear Sarah');
  });

  it('renders the signoff "See you ringside," when chair name is supplied', () => {
    const html = buildFieldGuideHtml(
      makeData({ trialChairName: 'Sarah Whitman', trialChairTitle: 'Trial Chair' })
    );
    expect(html).toContain('See you ringside');
    expect(html).toContain('Sarah Whitman');
  });

  it('escapes the secretary email in the withdraw line', () => {
    const html = buildFieldGuideHtml(makeData({ secretaryEmail: 'a&b@bckc.org' }));
    expect(html).toContain('a&amp;b@bckc.org');
  });

  it('renders no background-clip:text (Outlook safety)', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).not.toContain('background-clip:text');
    expect(html).not.toContain('-webkit-background-clip');
  });

  it('uses no color-mix() / OKLCH (Outlook safety)', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).not.toContain('color-mix(');
    expect(html).not.toContain('oklch(');
  });

  it('includes the §-numbered folios in section headers', () => {
    const html = buildFieldGuideHtml(makeData());
    expect(html).toContain('§01 · THE DOG');
    expect(html).toContain('§02 · ON THE DAY');
    expect(html).toContain('§03 · WITHDRAW');
  });
});
