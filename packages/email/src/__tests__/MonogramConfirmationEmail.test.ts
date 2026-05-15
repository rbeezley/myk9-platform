import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { MonogramConfirmationEmail } from '../templates/MonogramConfirmationEmail';
import type { MonogramConfirmationProps } from '../types';

const BASE: MonogramConfirmationProps = {
  monogramLetters: 'BCK',
  clubName: 'Bexar County Kennel Club',
  clubEstablished: '1947',
  clubCity: 'San Antonio, TX',
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
      trialNumeral: 'II',
      dayLabel: 'Sat 13 Jun',
      classLabel: 'Excellent · Interiors',
      judgeName: 'C. Beagles',
      armband: '142',
    },
  ],
  runCount: 2,
  totalFeesFormatted: '$48.00',
  receiptNumber: 'BCKC-2026-0427',
  doorsTime: '7:00 AM each morning',
  firstClassTime: '8:30 AM',
  venueNameAndAddress: 'Live Oak Civic Center\n8001 Shin Oak Dr',
  parkingNotes: 'Free · north lot',
  hospitalityNotes: 'Coffee at check-in',
  cratingNotes: 'Adjacent ballroom',
  secretaryEmail: 'secretary@bckc.org',
  secretaryPhone: '(210) 555-0142',
  trialUrl: 'https://bckc.org/trials/spring-2026',
  trialChairName: 'Sarah Whitman',
  trialChairTitle: 'Trial Chair, Bexar County Kennel Club',
  memberClubLanguage: 'A member club of the American Kennel Club',
  showSlug: 'bckc-spring-2026',
};

async function renderHtml(props: MonogramConfirmationProps): Promise<string> {
  return render(MonogramConfirmationEmail(props));
}

describe('MonogramConfirmationEmail', () => {
  it('renders without throwing', async () => {
    const html = await renderHtml(BASE);
    expect(html).toBeTruthy();
  });

  it('600px layout container is a <table>, not a <div>', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('<table role="presentation" width="600"');
  });

  it('contains no display:flex or display:grid', async () => {
    const html = await renderHtml(BASE);
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
  });

  it('does NOT contain background-clip:text (the email-safe contract)', async () => {
    // Outlook strips background-clip:text, which would leave the monogram
    // letters transparent and invisible. Asserts the embossed web-only
    // treatment never leaked into the email template.
    const html = await renderHtml(BASE);
    expect(html).not.toMatch(/background-clip\s*:\s*text/i);
    expect(html).not.toMatch(/-webkit-background-clip\s*:\s*text/i);
  });

  it('renders the monogram letters in the header', async () => {
    const html = await renderHtml({ ...BASE, monogramLetters: 'BCK' });
    expect(html).toContain('BCK');
  });

  it('contains club name', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('Bexar County Kennel Club');
  });

  it('contains dog registered name', async () => {
    const html = await renderHtml(BASE);
    // Apostrophes are HTML-escaped by React Email — check unambiguous parts.
    expect(html).toContain('Wandering Cooper, CGC');
    expect(html).toContain('GCh.');
  });

  it('contains armband and trial numerals', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('142');
    expect(html).toContain('>I<');
    expect(html).toContain('>II<');
  });

  it('contains total fees', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('$48.00');
  });

  it('contains ornament rule using div line-trick (email-safe, not border)', async () => {
    // The ornament rule must use a 1px-height div with background color, not
    // an inline border — Outlook strips inline borders. Critical convention
    // shared with the Heritage email template. Matches the rendered form
    // `width:90px;height:1px;background:#8a6938;...`.
    const html = await renderHtml(BASE);
    expect(html).toMatch(/height:\s*1px.*background/i);
  });

  it('loads Monogram web fonts only in <head>', async () => {
    const html = await renderHtml(BASE);
    const head = html.match(/<head[\s\S]*?<\/head>/i)?.[0] ?? '';
    const body = html.match(/<body[\s\S]*?<\/body>/i)?.[0] ?? '';
    expect(head).toContain('fonts.googleapis.com');
    expect(head).toContain('Italiana');
    expect(head).toContain('Bodoni+Moda');
    expect(head).toContain('Crimson+Pro');
    expect(body).not.toContain('fonts.googleapis.com');
  });

  it('secretary email appears as mailto link', async () => {
    const html = await renderHtml(BASE);
    expect(html).toContain('mailto:secretary@bckc.org');
  });

  it('CTA renders when trialUrl is set, omits when null', async () => {
    const withCta = await renderHtml(BASE);
    expect(withCta).toContain('https://bckc.org/trials/spring-2026');
    const withoutCta = await renderHtml({ ...BASE, trialUrl: null });
    expect(withoutCta).not.toContain('View trial particulars');
  });

  it('renders correctly when optional fields are null', async () => {
    const minimal: MonogramConfirmationProps = {
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
    // React Email escapes literal "null" in attributes (rare) but it should
    // never appear as a visible text node.
    expect(html).not.toMatch(/>null</);
  });

  it('escapes HTML in user-supplied club name', async () => {
    const html = await renderHtml({
      ...BASE,
      clubName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
