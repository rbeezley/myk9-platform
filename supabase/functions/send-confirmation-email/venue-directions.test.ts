// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildVenueMapAssets, renderVenueMapBlock } from './venue-directions';
import { buildBannerHtml, type BannerEmailData } from './banner-email';
import { buildFieldGuideHtml, type FieldGuideEmailData } from './fieldGuide-email';
import { buildGazetteHtml, type GazetteEmailData } from './gazette-email';
import { buildHeadlineHtml, type HeadlineEmailData } from './headline-email';
import { buildMagazineHtml, type MagazineEmailData } from './magazine-email';
import { buildMonogramHtml, type MonogramEmailData } from './monogram-email';
import { buildPosterHtml, type PosterEmailData } from './poster-email';

const PIN_URL = 'https://www.google.com/maps/dir/?api=1&destination=38.49%2C-90.82';

describe('buildVenueMapAssets', () => {
  it('uses the pin when present, ignoring the address', () => {
    expect(buildVenueMapAssets(38.49, -90.82, '1 Main St')?.linkUrl).toBe(PIN_URL);
  });

  it('falls back to the URL-encoded address when there is no pin', () => {
    expect(
      buildVenueMapAssets(null, null, 'Purina Farms\n200 Checkerboard Loop, Gray Summit')?.linkUrl
    ).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Purina%20Farms%2C%20200%20Checkerboard%20Loop%2C%20Gray%20Summit'
    );
  });

  it('falls back to the address when the pin is out of range', () => {
    expect(buildVenueMapAssets(91, 0, 'Somewhere')?.linkUrl).toContain('destination=Somewhere');
  });

  it('returns null with neither a pin nor an address', () => {
    expect(buildVenueMapAssets(null, null, null)).toBeNull();
    expect(buildVenueMapAssets(Number.NaN, -90.82, '  \n ')).toBeNull();
  });
});

describe('renderVenueMapBlock', () => {
  const assets = buildVenueMapAssets(38.49, -90.82)!;

  it('renders a Get directions link with no image and no key', () => {
    const html = renderVenueMapBlock(assets, 'Purina Farms\n200 Checkerboard Loop');
    expect(html).toContain(
      'href="https://www.google.com/maps/dir/?api=1&amp;destination=38.49%2C-90.82"'
    );
    expect(html).toContain('>Get directions</a>');
    expect(html).toContain('aria-label="Get directions to Purina Farms"');
    expect(html).not.toContain('<img');
  });

  it('escapes venue text destined for the aria-label', () => {
    expect(renderVenueMapBlock(assets, 'Smith & "Sons" <Arena>')).toContain(
      'aria-label="Get directions to Smith &amp; &quot;Sons&quot; &lt;Arena&gt;"'
    );
  });

  it('renders the empty string when assets are absent', () => {
    expect(renderVenueMapBlock(null, 'Somewhere')).toBe('');
    expect(renderVenueMapBlock(undefined, 'Somewhere')).toBe('');
  });
});

const base = {
  brandColor: '#0d4d4f',
  clubName: 'Bexar County Kennel Club',
  clubEstablished: null,
  clubCity: 'San Antonio, TX',
  showTitle: 'Spring Scent Work Trial',
  dateRange: 'Jun 12–14, 2026',
  salutation: 'Ms. Holloway',
  dogName: 'Cooper',
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
  venue: 'Purina Farms\n200 Checkerboard Loop',
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
};

// Every template shares the base shape; per-template extras are optional or
// tolerated, so one fixture drives all seven builders.
const templates: Array<[string, (d: never) => string]> = [
  ['banner', buildBannerHtml as (d: never) => string],
  ['fieldGuide', buildFieldGuideHtml as (d: never) => string],
  ['gazette', buildGazetteHtml as (d: never) => string],
  ['headline', buildHeadlineHtml as (d: never) => string],
  ['magazine', buildMagazineHtml as (d: never) => string],
  ['monogram', buildMonogramHtml as (d: never) => string],
  ['poster', buildPosterHtml as (d: never) => string],
];
export type _Shapes = [
  BannerEmailData,
  FieldGuideEmailData,
  GazetteEmailData,
  HeadlineEmailData,
  MagazineEmailData,
  MonogramEmailData,
  PosterEmailData,
];

describe.each(templates)('%s template directions link', (_name, build) => {
  const render = (venueMap: ReturnType<typeof buildVenueMapAssets>) =>
    build({ ...base, venueMap } as never);

  it('shows Get directions for a show with a pin', () => {
    const html = render(buildVenueMapAssets(38.49, -90.82, null));
    expect(html).toContain('Get directions</a>');
    expect(html).toContain('destination=38.49%2C-90.82');
  });

  it('shows Get directions for a show with only an address', () => {
    const html = render(buildVenueMapAssets(null, null, '200 Checkerboard Loop'));
    expect(html).toContain('Get directions</a>');
    expect(html).toContain('destination=200%20Checkerboard%20Loop');
  });

  it('shows no link with neither', () => {
    expect(render(buildVenueMapAssets(null, null, null))).not.toContain('Get directions');
  });
});
