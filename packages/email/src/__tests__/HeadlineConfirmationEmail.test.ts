import { describe, expect, it } from 'vitest';
import { render } from '@react-email/render';
import { HeadlineConfirmationEmail } from '../templates/HeadlineConfirmationEmail';
import type { HeritageConfirmationProps } from '../types';

const BASE: HeritageConfirmationProps = {
  clubName: 'Bexar County Kennel Club',
  clubEstablished: 'MCMXLVII',
  clubCity: 'San Antonio, Texas',
  showTitle: 'Spring Scent Work Trial',
  dateRange: '12–14 June 2026',
  salutation: 'Patricia Holloway',
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
  ],
  runCount: 1,
  totalFeesFormatted: '$25.00',
  receiptNumber: 'BCKC-2026-0427',
  doorsTime: '7:00 AM',
  firstClassTime: '8:30 AM',
  venueNameAndAddress: 'Live Oak Civic Center',
  parkingNotes: 'Free parking',
  hospitalityNotes: 'Lunch on site',
  cratingNotes: 'Adjacent hall',
  secretaryEmail: 'secretary@bckc.org',
  secretaryPhone: '(210) 555-0142',
  trialUrl: 'https://bckc.org/spring-2026',
  trialChairName: 'Sarah Whitman',
  trialChairTitle: 'Trial Chair',
  memberClubLanguage: 'A member club of the American Kennel Club',
  showSlug: 'bckc-spring-2026',
};

describe('HeadlineConfirmationEmail', () => {
  it('renders email-safe table markup with Headline identity', async () => {
    const html = await render(HeadlineConfirmationEmail(BASE));

    expect(html).toContain('<table role="presentation" width="600"');
    expect(html).toContain('Confirmed');
    expect(html).toContain('You&#x27;re');
    expect(html).toContain('Bexar County Kennel Club');
    expect(html).toContain('Wandering Cooper, CGC');
    expect(html).toContain('142');
    expect(html).toContain('$25.00');
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
  });
});
