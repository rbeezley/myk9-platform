import { describe, expect, it } from 'vitest';
import { buildPosterHtml, type PosterEmailData } from './poster-email';

function makeData(overrides: Partial<PosterEmailData> = {}): PosterEmailData {
  return {
    clubName: 'Bexar County Kennel Club',
    clubCity: 'San Antonio, TX',
    showTitle: 'Spring Scent Work Trial',
    showAbbreviation: "SS'26",
    dateRange: 'Jun 12–14, 2026',
    salutation: 'Sarah',
    armband: '247',
    dogName: "CH Cedarwood's Risen on Pointe RN",
    dogCallName: 'Pointe',
    dogBreed: 'German Shorthaired Pointer',
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
    venue: 'Live Oak Civic Center',
    doorsTime: '7:00 AM',
    firstClassTime: '8:30 AM',
    parkingNotes: 'Free · on site',
    hospitalityNotes: 'Coffee & tacos at check-in',
    cratingNotes: 'Ballroom',
    secretaryEmail: 'secretary@bckc.org',
    secretaryPhone: null,
    trialUrl: 'https://myk9show.com/bckc-spring-2026',
    trialChairName: 'Sarah Whitman',
    trialChairTitle: 'Trial Chair · BCKC',
    memberClubLanguage: 'A member club of the American Kennel Club',
    licenseLanguage: 'License №2026-2841',
    ...overrides,
  };
}

describe('buildPosterHtml', () => {
  it('produces an HTML document with the show title', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('Spring Scent Work Trial');
  });

  it('renders the cream paper background', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('background:#f3ede0');
  });

  it('renders the ink top mono strip with the show abbreviation', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain("CONFIRMED");
    expect(html).toContain("SS'26");
  });

  it('renders the hero "You\'re in." headline', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain("You&apos;re ");
    expect(html).toContain("in.");
  });

  it('renders the armband line in the hero when armband is supplied', () => {
    const html = buildPosterHtml(makeData({ armband: '247' }));
    expect(html).toContain('Armband');
    expect(html).toContain('247');
  });

  it('omits the armband line when armband is null', () => {
    const html = buildPosterHtml(makeData({ armband: null }));
    expect(html).not.toContain('Armband');
  });

  it('renders the receipt number suffix when supplied', () => {
    const html = buildPosterHtml(makeData({ receiptNumber: '2026-0137' }));
    expect(html).toContain('RECEIPT 2026-0137');
  });

  it('omits the receipt suffix when null', () => {
    const html = buildPosterHtml(makeData({ receiptNumber: null }));
    expect(html).not.toContain('RECEIPT');
  });

  it('renders no mix-blend-mode (Outlook safety — ink-blot is omitted)', () => {
    const html = buildPosterHtml(makeData());
    expect(html).not.toContain('mix-blend-mode');
  });

  it('renders no -webkit-text-stroke (Outlook safety — outline text omitted)', () => {
    const html = buildPosterHtml(makeData());
    expect(html).not.toContain('-webkit-text-stroke');
  });

  it('renders no background-clip:text (Outlook safety)', () => {
    const html = buildPosterHtml(makeData());
    expect(html).not.toContain('background-clip:text');
    expect(html).not.toContain('-webkit-background-clip');
  });

  it('renders no font-style:italic (Poster discipline — Archivo Black has no italic)', () => {
    const html = buildPosterHtml(makeData());
    expect(html).not.toContain('font-style:italic');
  });

  it('renders the runs table with armband for each row', () => {
    const html = buildPosterHtml(
      makeData({
        runs: [
          {
            numeral: '01',
            dayLabel: 'Fri 12 Jun',
            classLabel: 'Containers',
            judgeName: 'C. Beagles',
            armband: '247',
          },
          {
            numeral: '03',
            dayLabel: 'Sat 13 Jun',
            classLabel: 'Interiors',
            judgeName: 'C. Beagles',
            armband: null,
          },
        ],
      })
    );
    expect(html).toContain('247');
    expect(html).toContain('—'); // null armband fallback
  });

  it('renders the on-the-day dark band when day data is supplied', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('NO 03 / ON THE DAY');
    expect(html).toContain('Doors');
    expect(html).toContain('7:00 AM');
  });

  it('omits the on-the-day band when no day data is supplied', () => {
    const html = buildPosterHtml(
      makeData({
        doorsTime: null,
        firstClassTime: null,
        venue: null,
        parkingNotes: null,
        hospitalityNotes: null,
        cratingNotes: null,
      })
    );
    expect(html).not.toContain('NO 03 / ON THE DAY');
  });

  it('renders the withdraw section with the secretary email link', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('NO 04 / IF YOU MUST WITHDRAW');
    expect(html).toContain('mailto:secretary@bckc.org');
  });

  it('renders the CTA button when trialUrl is set', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('VIEW TRIAL PARTICULARS');
    expect(html).toContain('https://myk9show.com/bckc-spring-2026');
  });

  it('renders the trial-chair signoff (uppercased) when supplied', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('SARAH WHITMAN');
    expect(html).toContain('TRIAL CHAIR · BCKC');
  });

  it('renders the dark footer with club name uppercased', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('BEXAR COUNTY KENNEL CLUB.');
    expect(html).toContain('A member club of the American Kennel Club');
    expect(html).toContain('License №2026-2841');
  });

  it('escapes user-controlled fields against HTML injection', () => {
    const html = buildPosterHtml(
      makeData({
        clubName: '<script>alert(1)</script>',
        showTitle: '"OnLoad" trial & co.',
      })
    );
    // Raw script tag never reaches the output unescaped, regardless of the
    // case transform Poster applies to club names in the masthead/footer.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<SCRIPT>ALERT(1)</SCRIPT>');
    // The escaped form survives the uppercase transform.
    expect(html.toLowerCase()).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;OnLoad&quot;');
    expect(html).toContain('co.');
  });

  it('uses the Archivo Black + Inter Tight stack in display contexts', () => {
    const html = buildPosterHtml(makeData());
    // The stack lists Archivo Black first with Inter Tight as the
    // immediate fallback — clients without the Google Fonts link
    // render Inter Tight which carries the heavy condensed character.
    expect(html).toContain("'Archivo Black','Inter Tight'");
  });

  it('uses the IBM Plex Mono mono stack for kickers', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain("'IBM Plex Mono'");
  });

  it('uses the 0.04em mono letter-spacing (NOT 0.32em)', () => {
    const html = buildPosterHtml(makeData());
    expect(html).toContain('letter-spacing:0.04em');
    // Confirm the wide tracking value never appears.
    expect(html).not.toContain('letter-spacing:0.32em');
  });
});
