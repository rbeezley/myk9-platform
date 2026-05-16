import { describe, expect, it } from 'vitest';
import { buildGazetteHtml, type GazetteEmailData } from './gazette-email';

function makeData(overrides: Partial<GazetteEmailData> = {}): GazetteEmailData {
  return {
    clubName: 'Bexar County Kennel Club',
    clubEstablished: 'Established 1947',
    clubCity: 'San Antonio, TX',
    showTitle: 'Spring Scent Work Trial',
    dateRange: 'Jun 12–14, 2026',
    editionLabel: 'VOL LXXIX · NO 47',
    salutation: 'Ms. Patricia Holloway',
    dogName: "GCh. Ridgeway's Wandering Cooper, CGC",
    dogCallName: 'Cooper',
    dogBreed: 'GSP',
    dogSex: 'F',
    runs: [
      {
        numeral: 'I',
        dayLabel: 'Fri Jun 12',
        classLabel: 'Excellent · Containers',
        judgeName: 'Mrs. Beagles',
        armband: '247',
      },
    ],
    runCount: 1,
    totalFeesFormatted: '$25.00',
    receiptNumber: '2026-0137',
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

describe('buildGazetteHtml', () => {
  it('produces an HTML document with the show title', () => {
    const html = buildGazetteHtml(makeData());
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Spring Scent Work Trial');
  });

  it('renders the paper background color in the wrapper', () => {
    const html = buildGazetteHtml(makeData());
    expect(html).toContain('#f7f1e3');
  });

  it('renders the edition strip when editionLabel is provided', () => {
    const html = buildGazetteHtml(makeData({ editionLabel: 'VOL LXXIX · NO 47' }));
    expect(html).toContain('VOL LXXIX · NO 47');
    expect(html).toContain('TRIAL CONFIRMATION');
  });

  it('omits the edition strip when editionLabel is null', () => {
    const html = buildGazetteHtml(makeData({ editionLabel: null }));
    expect(html).not.toContain('TRIAL CONFIRMATION');
  });

  it('auto-italicizes the first and last word of the masthead when ≥3 words', () => {
    const html = buildGazetteHtml(makeData({ clubName: 'Bexar County Kennel Club' }));
    // First word 'Bexar' is wrapped in <em>
    expect(html).toMatch(/<em[^>]*>Bexar<\/em>/);
    // Last word 'Club' is wrapped in <em>
    expect(html).toMatch(/<em[^>]*>Club<\/em>/);
    // Middle words appear without <em>
    expect(html).toContain('County Kennel');
  });

  it('does not auto-italicize when clubName has fewer than 3 words', () => {
    const html = buildGazetteHtml(makeData({ clubName: 'Bexar Gazette' }));
    expect(html).not.toMatch(/<em[^>]*>Bexar<\/em>/);
    expect(html).toContain('Bexar Gazette');
  });

  it('renders Playfair Display in the masthead title block', () => {
    const html = buildGazetteHtml(makeData());
    expect(html).toContain("'Playfair Display'");
  });

  it('renders receipt number in the front-page kicker when supplied', () => {
    const html = buildGazetteHtml(makeData({ receiptNumber: '2026-0137' }));
    expect(html).toContain('Receipt 2026-0137');
  });

  it('omits the receipt suffix when registration number is null', () => {
    const html = buildGazetteHtml(makeData({ receiptNumber: null }));
    expect(html).not.toContain('Receipt 2026');
    expect(html).toContain('Confirmed');
  });

  it('includes a runs table with lowercase roman numeral and armband per row', () => {
    const html = buildGazetteHtml(
      makeData({
        runs: [
          { numeral: 'I', dayLabel: 'Fri Jun 12', classLabel: 'Containers', judgeName: 'Mrs. B', armband: '247' },
          { numeral: 'III', dayLabel: 'Sat Jun 13', classLabel: 'Interiors', judgeName: 'Mrs. B', armband: null },
        ],
      })
    );
    expect(html).toContain('>i<');
    expect(html).toContain('>iii<');
    expect(html).toContain('247');
    expect(html).toContain('—'); // null armband fallback
  });

  it('renders pluralization correctly for run count', () => {
    const single = buildGazetteHtml(makeData({ runCount: 1 }));
    const plural = buildGazetteHtml(makeData({ runCount: 3 }));
    expect(single).toContain('1 run ·');
    expect(plural).toContain('3 runs ·');
  });

  it('escapes user-controlled fields against HTML injection', () => {
    const html = buildGazetteHtml(
      makeData({
        clubName: '<script>alert(1)</script>',
        showTitle: '"OnLoad" trial & co.',
        dogName: 'Cooper <img src=x>',
      })
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;OnLoad&quot;');
    expect(html).toContain('co.');
    expect(html).toContain('&lt;img src=x&gt;');
  });

  it('renders the "On the Day" section when at least one field is provided', () => {
    const html = buildGazetteHtml(makeData({ doorsTime: '7:00 AM', firstClassTime: '8:30 AM' }));
    expect(html).toContain('Section B · On the Day');
    expect(html).toContain('7:00 AM');
    expect(html).toContain('8:30 AM');
  });

  it('omits the "On the Day" section when no fields supplied', () => {
    const html = buildGazetteHtml(makeData());
    expect(html).not.toContain('On the Day');
  });

  it('renders the CTA only when trialUrl is set', () => {
    const without = buildGazetteHtml(makeData({ trialUrl: null }));
    const withUrl = buildGazetteHtml(makeData({ trialUrl: 'https://myk9show.com/bckc' }));
    expect(without).not.toContain('View Trial Particulars');
    expect(withUrl).toContain('View Trial Particulars');
    expect(withUrl).toContain('https://myk9show.com/bckc');
  });

  it('renders signoff block when trial chair name is provided', () => {
    const html = buildGazetteHtml(
      makeData({ trialChairName: 'Sarah Whitman', trialChairTitle: 'Trial Chair' })
    );
    expect(html).toContain('With our compliments');
    expect(html).toContain('Sarah Whitman');
    expect(html).toContain('Trial Chair');
  });

  it('renders the footer with double rule', () => {
    const html = buildGazetteHtml(makeData());
    expect(html).toContain('4px double');
    expect(html).toContain('A member club of the American Kennel Club'.toUpperCase());
  });

  it('renders the secretary email as a mailto link inside the notices', () => {
    const html = buildGazetteHtml(makeData({ secretaryEmail: 'secretary@bckc.org' }));
    expect(html).toContain('href="mailto:secretary@bckc.org"');
  });

  it('uses lining figures (no font-feature-settings) in email body', () => {
    // Outlook ignores font-feature-settings — README §Known Caveats requires
    // the email opt out of old-style figures. None should appear in output.
    const html = buildGazetteHtml(makeData());
    expect(html).not.toContain('font-feature-settings');
    expect(html).not.toContain('"onum"');
  });

  // ─── On-the-Day headline derivation (review fix #2) ──────────────────────

  it('uses doorsTime in the "Be on site by" headline when supplied', () => {
    const html = buildGazetteHtml(makeData({ doorsTime: '7:00 AM' }));
    expect(html).toContain('Be on site by');
    expect(html).toContain('7:00 AM');
    // Hardcoded "half-past seven" string should NOT appear regardless of input.
    expect(html).not.toContain('half-past seven');
  });

  it('falls back to firstClassTime when doorsTime is null', () => {
    const html = buildGazetteHtml(
      makeData({ doorsTime: null, firstClassTime: '8:30 AM' })
    );
    expect(html).toContain('Be on site by');
    expect(html).toContain('8:30 AM');
  });

  it('renders the neutral "On the day" headline when no times are supplied', () => {
    // Force the On-the-Day section to render via venue, but supply no times.
    const html = buildGazetteHtml(
      makeData({ doorsTime: null, firstClassTime: null, venue: 'Live Oak Civic Center' })
    );
    expect(html).toContain('On the');
    expect(html).toContain('>day<');
    expect(html).not.toContain('Be on site by');
  });

  it('escapes user-controllable arrival times in the headline', () => {
    // doorsTime could be admin-edited copy. Defensive escape check.
    const html = buildGazetteHtml(makeData({ doorsTime: '<b>7am</b>' }));
    expect(html).toContain('&lt;b&gt;7am&lt;/b&gt;');
    expect(html).not.toMatch(/<b>7am<\/b>/);
  });
});
