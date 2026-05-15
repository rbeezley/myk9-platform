import { describe, expect, it } from 'vitest';
import { buildBannerHtml, type BannerEmailData } from './banner-email';

function makeData(overrides: Partial<BannerEmailData> = {}): BannerEmailData {
  return {
    brandColor: '#0d4d4f',
    clubName: 'Bexar County Kennel Club',
    clubCity: 'San Antonio, TX',
    showTitle: 'Spring Scent Work Trial',
    dateRange: 'Jun 12–14, 2026',
    salutation: 'Ms. Patricia Holloway',
    dogName: "GCh. Ridgeway's Wandering Cooper, CGC",
    dogCallName: 'Cooper',
    dogBreed: 'GSP',
    dogSex: 'F',
    runs: [
      {
        numeral: 'I',
        dayLabel: 'Fri 12 Jun',
        classLabel: 'Excellent · Containers',
        judgeName: 'C. Beagles',
        armband: '142',
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

describe('buildBannerHtml', () => {
  it('produces an HTML document with the show title', () => {
    const html = buildBannerHtml(makeData());
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Spring Scent Work Trial');
  });

  it('renders the default flag color in the masthead background', () => {
    const html = buildBannerHtml(makeData({ brandColor: '#0d4d4f' }));
    expect(html).toContain('background:#0d4d4f');
  });

  it('honors a custom per-club brand color', () => {
    const html = buildBannerHtml(makeData({ brandColor: '#7a1f1f' }));
    expect(html).toContain('background:#7a1f1f');
  });

  it('falls back to the default flag when brand color is malformed', () => {
    const html = buildBannerHtml(makeData({ brandColor: 'not-a-hex' }));
    expect(html).toContain('background:#0d4d4f');
  });

  it('uses white text on the default dark teal masthead', () => {
    const html = buildBannerHtml(makeData({ brandColor: '#0d4d4f' }));
    expect(html).toContain('color:#ffffff');
  });

  it('uses ink text on a very light per-club color', () => {
    const html = buildBannerHtml(makeData({ brandColor: '#fafaaa' }));
    expect(html).toContain('color:#111111');
  });

  it('renders no background-clip: text (Outlook safety)', () => {
    const html = buildBannerHtml(makeData());
    expect(html).not.toContain('background-clip:text');
    expect(html).not.toContain('-webkit-background-clip');
  });

  it('renders no italic styles (Banner discipline)', () => {
    const html = buildBannerHtml(makeData());
    expect(html).not.toContain('font-style:italic');
  });

  it('escapes user-controlled fields against HTML injection', () => {
    const html = buildBannerHtml(
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

  it('renders receipt number in the kicker line when supplied', () => {
    const html = buildBannerHtml(makeData({ receiptNumber: '2026-0137' }));
    expect(html).toContain('Confirmed · 2026-0137');
  });

  it('omits the receipt suffix when registration number is null', () => {
    const html = buildBannerHtml(makeData({ receiptNumber: null }));
    expect(html).not.toContain('Confirmed · ');
    expect(html).toContain('Confirmed');
  });

  it('includes the runs table with armband for each row', () => {
    const html = buildBannerHtml(
      makeData({
        runs: [
          { numeral: 'I', dayLabel: 'Fri 12 Jun', classLabel: 'Containers', judgeName: 'C. Beagles', armband: '142' },
          { numeral: 'II', dayLabel: 'Sat 13 Jun', classLabel: 'Interiors', judgeName: 'C. Beagles', armband: null },
        ],
      })
    );
    expect(html).toContain('142');
    expect(html).toContain('—'); // null armband fallback
  });
});
