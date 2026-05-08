import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { HeritageConfirmationEmail } from '../templates/HeritageConfirmationEmail';
import type { HeritageConfirmationProps } from '../types';

const BASE: HeritageConfirmationProps = {
  clubName: 'Bexar County Kennel Club',
  clubEstablished: 'MCMXLVII',
  clubCity: 'San Antonio, Texas',
  showTitle: 'Spring Scent Work Trial',
  dateRange: '12–14 June 2026',
  salutation: 'Ms. Patricia Holloway',
  dogRegisteredName: "GCh. Ridgeway's Wandering Cooper, CGC",
  dogCallName: 'Cooper',
  dogBreed: 'Labrador Retriever',
  dogSex: 'M',
  runs: [
    {
      trialNumeral: 'I',
      dayLabel: 'Fri 12 Jun',
      classLabel: 'Excellent · Containers',
      judgeName: 'C. Beagles',
      armband: '142',
    },
    {
      trialNumeral: 'III',
      dayLabel: 'Sat 13 Jun',
      classLabel: 'Excellent · Interiors',
      judgeName: 'C. Beagles',
      armband: '142',
    },
    {
      trialNumeral: 'V',
      dayLabel: 'Sun 14 Jun',
      classLabel: 'Excellent · Buried',
      judgeName: 'C. Beagles',
      armband: '142',
    },
  ],
  runCount: 3,
  totalFeesFormatted: '$72.00',
  receiptNumber: 'BCKC-2026-0427',
  doorsTime: '7:00 AM each morning',
  firstClassTime: '8:30 AM · briefing at 8:00',
  venueNameAndAddress: 'Live Oak Civic Center\n8001 Shin Oak Dr · Live Oak, TX',
  parkingNotes: 'Free · north lot · ample',
  hospitalityNotes: 'Coffee at check-in · lunch on site',
  cratingNotes: 'Adjacent ballroom · soft-sided only',
  secretaryEmail: 'secretary@bckc.org',
  secretaryPhone: '(210) 555-0142',
  trialUrl: 'https://bckc.org/trials/spring-2026',
  trialChairName: 'Sarah Whitman',
  trialChairTitle: 'Trial Chair, Bexar County Kennel Club',
  memberClubLanguage: 'A member club of the American Kennel Club',
  showSlug: 'bckc-spring-2026',
};

async function renderHtml(props: HeritageConfirmationProps): Promise<string> {
  return render(HeritageConfirmationEmail(props));
}

describe('HeritageConfirmationEmail', () => {
  it('renders without throwing', async () => {
    const html = await renderHtml(BASE);
    expect(html).toBeTruthy();
  });

  it('600px layout container is a <table>, not a <div>', async () => {
    const html = await renderHtml(BASE);
    // React Email injects a hidden preview <div> first; the actual layout must use tables.
    expect(html).toContain('<table role="presentation" width="600"');
  });

  it('contains no display:flex or display:grid', async () => {
    const html = await renderHtml(BASE);
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
  });

  it('contains club name', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('Bexar County Kennel Club');
  });

  it('contains dog registered name', async () => {
    const html = await renderHtml(BASE);
    // Apostrophes are HTML-escaped in rendered email output (&#x27;) — check unambiguous parts
    expect(html).toContain('Wandering Cooper, CGC');
    expect(html).toContain('GCh.');
  });

  it('contains armband number', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('142');
  });

  it('contains all three trial numerals', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('>I<');
    expect(html).toContain('>III<');
    expect(html).toContain('>V<');
  });

  it('contains total fees', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('$72.00');
  });

  it('contains ornament rule using div line-trick (email-safe)', async () => {
    const html = await renderHtml(BASE);
    // The ornament rule must use a 1px-height div with background color, not a border
    // This is the "critical bug-fix" from the design handoff for Outlook compatibility
    expect(html).toMatch(/height:\s*1px.*background/i);
  });

  it('contains web fonts only in <head>', async () => {
    const html = await renderHtml(BASE);
    const headMatch = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';
    const bodyMatch = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? '';
    // Google Fonts link should be in head
    expect(headMatch).toContain('fonts.googleapis.com');
    // Body should not reference the googleapis CDN (fonts loaded via head link only)
    expect(bodyMatch).not.toContain('fonts.googleapis.com');
  });

  it('secretary email appears as mailto link', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('mailto:secretary@bckc.org');
  });

  it('renders correctly when optional fields are null', async () => {
    const minimal: HeritageConfirmationProps = {
      ...BASE,
      clubEstablished: null,
      clubCity: null,
      dogCallName: null,
      dogBreed: null,
      dogSex: null,
      receiptNumber: null,
      doorsTime: null,
      firstClassTime: null,
      venueNameAndAddress: null,
      parkingNotes: null,
      hospitalityNotes: null,
      cratingNotes: null,
      secretaryEmail: null,
      secretaryPhone: null,
      trialUrl: null,
      trialChairName: null,
      trialChairTitle: null,
      showSlug: null,
    };
    const html = await renderHtml(minimal);
    expect(html).toContain('Bexar County Kennel Club');
    expect(html).not.toMatch(/undefined/);
    expect(html).not.toMatch(/null/);
  });
});
