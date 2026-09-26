// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildBannerHtml, type BannerEmailData } from './banner-email';
import {
  composite,
  contrastRatio,
  parseHex,
  type RgbColor,
} from '../../../apps/myk9show/src/styles/__tests__/contrast-test-utils';

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

  it('renders the venue static map when assets are provided, none when absent', () => {
    const withMap = buildBannerHtml(
      makeData({
        venueMap: {
          imageUrl: 'https://maps.googleapis.com/maps/api/staticmap?center=1%2C2&key=k',
          linkUrl: 'https://www.google.com/maps/dir/?api=1&destination=1%2C2',
        },
      })
    );
    expect(withMap).toContain('maps.googleapis.com/maps/api/staticmap');
    expect(withMap).toContain('https://www.google.com/maps/dir/?api=1&amp;destination=1%2C2');

    expect(buildBannerHtml(makeData())).not.toContain('staticmap');
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
          {
            numeral: 'I',
            dayLabel: 'Fri 12 Jun',
            classLabel: 'Containers',
            judgeName: 'C. Beagles',
            armband: '142',
          },
          {
            numeral: 'II',
            dayLabel: 'Sat 13 Jun',
            classLabel: 'Interiors',
            judgeName: 'C. Beagles',
            armband: null,
          },
        ],
      })
    );
    expect(html).toContain('142');
    expect(html).toContain('—'); // null armband fallback
  });
});

/**
 * MYK9-765: the email repeats the page's flag-on-paper text (section folios,
 * run numerals, fee total, mailto link) and the final band's accent, so a
 * light club flag made them unreadable here too. Measured from the inline
 * styles the builder writes, region by region, with the app's independent
 * WCAG helper — never with the derivation's own maths.
 */
describe('buildBannerHtml — text contrast for any club flag (MYK9-765)', () => {
  const AA = 4.5;
  const FLAGS = ['#0d4d4f', '#1a5fb4', '#e01b24', '#ff7800', '#33d17a', '#f5c211'];
  const HEX = '#[0-9a-fA-F]{6}';

  interface Painted {
    region: string;
    fg: RgbColor;
    bg: RgbColor;
  }

  /** Split the document at its section comments; each region has one surface. */
  function regions(html: string): { name: string; body: string }[] {
    const marks = [...html.matchAll(/<!-- ([A-Z /]+) -->/g)];
    return marks.map((m, i) => ({
      name: m[1],
      body: html.slice(m.index, marks[i + 1]?.index ?? html.length),
    }));
  }

  /** Every `color:` in a style attribute, on the surface it is painted over. */
  function paintedColors(html: string): Painted[] {
    const out: Painted[] = [];
    for (const { name, body } of regions(html)) {
      const regionBg = new RegExp(`<td bgcolor="(${HEX})"`).exec(body)?.[1] ?? '#fafaf8';
      for (const [, style] of body.matchAll(/style="([^"]*)"/g)) {
        const fg = new RegExp(`(?:^|;)color:(${HEX})`).exec(style)?.[1];
        if (!fg) continue;
        const ownBg = new RegExp(`(?:^|;)background:(${HEX})`).exec(style)?.[1];
        const opacity = Number(/(?:^|;)opacity:([\d.]+)/.exec(style)?.[1] ?? 1);
        const bg = parseHex(ownBg ?? regionBg);
        out.push({ region: name, fg: composite(parseHex(fg), opacity, bg), bg });
      }
    }
    return out;
  }

  function failing(painted: Painted[]): string[] {
    return painted
      .map(p => ({ ...p, ratio: contrastRatio(p.fg, p.bg) }))
      .filter(p => p.ratio < AA)
      .map(p => `${p.region}: ${p.fg.join(',')} on ${p.bg.join(',')} = ${p.ratio.toFixed(2)}`);
  }

  it('harness: known answers, and it finds the card, CTA and band surfaces', () => {
    expect(contrastRatio(parseHex('#000000'), parseHex('#ffffff'))).toBeCloseTo(21, 5);
    const painted = paintedColors(buildBannerHtml(makeData({ trialUrl: 'https://x.test' })));
    const band = painted.filter(p => p.region === 'FINAL FLAG BAND');
    // The band surface is the flag-derived deep colour, not the paper default.
    expect(band.length).toBeGreaterThanOrEqual(3);
    expect(band.every(p => p.bg.join() !== '250,250,248')).toBe(true);
    expect(painted.some(p => p.region === 'ENTRY DETAIL CARD')).toBe(true);
  });

  it.each(FLAGS)('%s: every text colour below the masthead reaches 4.5:1', flag => {
    const html = buildBannerHtml(
      makeData({ brandColor: flag, trialUrl: 'https://x.test', trialChairTitle: 'Chair' })
    );
    const painted = paintedColors(html).filter(p => p.region !== 'FLAG MASTHEAD');
    expect(painted.length).toBeGreaterThanOrEqual(15);
    expect(failing(painted)).toEqual([]);
  });

  it.each(FLAGS)('%s: the masthead headline reaches 4.5:1 on the flag', flag => {
    const html = buildBannerHtml(makeData({ brandColor: flag }));
    const h1 = new RegExp(`<h1 style="[^"]*color:(${HEX})`).exec(html)?.[1];
    expect(h1).toBeDefined();
    expect(contrastRatio(parseHex(h1!), parseHex(flag))).toBeGreaterThanOrEqual(AA);
  });
});
