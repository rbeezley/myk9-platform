import { describe, expect, it } from 'vitest';
import { buildMagazineHtml, type MagazineEmailData } from './magazine-email';

function makeData(overrides: Partial<MagazineEmailData> = {}): MagazineEmailData {
  return {
    clubName: 'Bexar County Kennel Club',
    clubEstablished: 'Est. 1947',
    clubCity: 'San Antonio, TX',
    showTitle: 'Spring Scent Work Trial',
    dateRange: '12–14 June 2026',
    editionLabel: 'Vol LXXIX · Spring 2026',
    salutation: 'Ms. Patricia Holloway',
    dogName: "GCh. Ridgeway's Wandering Cooper, CGC",
    dogCallName: 'Cooper',
    dogBreed: 'GSP',
    dogSex: 'F',
    runs: [
      {
        trialNumeral: 'i',
        dayLabel: 'Fri 12 Jun',
        classLabel: 'Excellent · Containers',
        judgeName: 'C. Beagles',
        armband: '247',
      },
    ],
    runCount: 1,
    totalFeesFormatted: '$25.00',
    receiptNumber: '2026-0137',
    primaryArmband: '247',
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
    licenseReference: 'License № 2026-2841',
    ...overrides,
  };
}

describe('buildMagazineHtml', () => {
  it('produces an HTML document with the show title', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Spring Scent Work Trial');
  });

  it('renders the warm cream Magazine page background', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).toContain('background:#f6f1e8');
  });

  it('renders the gold gradient hairline rule', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).toContain('linear-gradient(90deg, #c9a87c, #a8814f)');
  });

  it('renders the dark editorial footer gradient', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).toContain(
      'linear-gradient(135deg, #4a3826 0%, #2e2820 60%, #1a1a1a 100%)'
    );
  });

  // ─── Outlook safety (per reconciliation notes) ────────────────────────────

  it('renders NO background-clip: text anywhere (Outlook safety)', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).not.toContain('background-clip:text');
    expect(html).not.toContain('background-clip: text');
    expect(html).not.toContain('-webkit-background-clip');
  });

  it('paints italic gold emphasis with solid color #4a3826 (no gradient text)', () => {
    const html = buildMagazineHtml(makeData());
    // Quick spot-check on a key italic emphasis span (the "confirmed" accent
    // in the headline).
    expect(html).toMatch(/font-style:italic;color:#4a3826;">confirmed/);
  });

  // ─── Content rendering ────────────────────────────────────────────────────

  it('renders the eyebrow "Confirmed · Entry № …" with the receipt number', () => {
    const html = buildMagazineHtml(makeData({ receiptNumber: '2026-0137' }));
    expect(html).toContain('Confirmed · Entry № 2026-0137');
  });

  it('falls back to "Confirmed · Entry received" when receipt number is null', () => {
    const html = buildMagazineHtml(makeData({ receiptNumber: null }));
    expect(html).toContain('Confirmed · Entry received');
  });

  it('renders the dog name and call-name byline', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).toContain("GCh. Ridgeway");
    expect(html).toContain('called &quot;Cooper&quot;');
  });

  it('renders the primary armband callout when all runs share an armband', () => {
    const html = buildMagazineHtml(makeData({ primaryArmband: '247' }));
    expect(html).toContain('Armband <span');
    expect(html).toContain('>247<');
  });

  it('falls back to "N runs entered" when no primary armband is set', () => {
    const html = buildMagazineHtml(
      makeData({
        primaryArmband: null,
        runCount: 3,
        runs: [
          {
            trialNumeral: 'i',
            dayLabel: 'Fri 12 Jun',
            classLabel: 'Containers',
            judgeName: 'C. Beagles',
            armband: null,
          },
        ],
      })
    );
    expect(html).toContain('3 runs entered');
  });

  it('singularizes "run entered" when only one run', () => {
    const html = buildMagazineHtml(
      makeData({
        primaryArmband: null,
        runCount: 1,
      })
    );
    expect(html).toContain('1 run entered');
  });

  // ─── Escaping ────────────────────────────────────────────────────────────

  it('escapes user-controlled fields against HTML injection', () => {
    const html = buildMagazineHtml(
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

  // ─── Conditional rendering ────────────────────────────────────────────────

  it('omits the On The Day block when no on-the-day fields are provided', () => {
    const html = buildMagazineHtml(makeData());
    expect(html).not.toContain('Article ii · On the day');
  });

  it('renders the On The Day block when any on-the-day field is set', () => {
    const html = buildMagazineHtml(
      makeData({ doorsTime: '7:00 AM', firstClassTime: '8:30 AM' })
    );
    expect(html).toContain('Article ii · On the day');
    expect(html).toContain('7:00 AM');
    expect(html).toContain('8:30 AM');
  });

  it('omits the CTA when trialUrl is null', () => {
    const html = buildMagazineHtml(makeData({ trialUrl: null }));
    expect(html).not.toContain('View trial particulars');
  });

  it('renders the CTA + "View in browser" link when trialUrl is set', () => {
    const html = buildMagazineHtml(
      makeData({ trialUrl: 'https://myk9show.com/bckc-spring-2026' })
    );
    expect(html).toContain('View trial particulars →');
    expect(html).toContain('View in browser');
  });

  it('renders the license reference in the footer fine print', () => {
    const html = buildMagazineHtml(makeData({ licenseReference: 'License № 2026-2841' }));
    expect(html).toContain('License № 2026-2841');
  });

  it('omits the license reference when null', () => {
    const html = buildMagazineHtml(makeData({ licenseReference: null }));
    expect(html).not.toContain('License №');
  });

  it('renders the runs table with each row', () => {
    const html = buildMagazineHtml(
      makeData({
        runs: [
          {
            trialNumeral: 'i',
            dayLabel: 'Fri 12 Jun',
            classLabel: 'Containers',
            judgeName: 'C. Beagles',
            armband: '247',
          },
          {
            trialNumeral: 'iii',
            dayLabel: 'Sat 13 Jun',
            classLabel: 'Interiors',
            judgeName: 'C. Beagles',
            armband: null,
          },
        ],
      })
    );
    expect(html).toContain('Fri 12 Jun');
    expect(html).toContain('Sat 13 Jun');
    expect(html).toContain('—'); // null-armband fallback
  });

  it('renders the trial chair signature when provided', () => {
    const html = buildMagazineHtml(
      makeData({ trialChairName: 'Sarah Whitman', trialChairTitle: 'Trial Chair · BCKC' })
    );
    expect(html).toContain('Sarah Whitman');
    expect(html).toContain('Trial Chair · BCKC');
    expect(html).toContain('With our compliments,');
  });

  it('renders the edition label in the top meta strip', () => {
    const html = buildMagazineHtml(makeData({ editionLabel: 'Vol LXXIX · Spring 2026' }));
    expect(html).toContain('Vol LXXIX · Spring 2026');
  });
});
