import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { ASCAPremiumTemplate } from '../ASCAPremiumTemplate';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
import { formatPremiumDate } from '../../premiumFacts';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';

const STYLES: PremiumStyle[] = [
  'monogram',
  'banner',
  'headline',
  'magazine',
  'poster',
  'gazette',
  'fieldGuide',
  'heritage',
];
const TEMPLATES = {
  AKC: AKCPremiumTemplate,
  UKC: UKCPremiumTemplate,
  ASCA: ASCAPremiumTemplate,
} as const;

const FEE_LINE = 'Class fee $17.50: Containers Novice';
const TRIAL_LIMIT = 'Trial entry limit: 37 entries.';
const WAITLIST = 'Waitlist: when a class is full, new entries join the waitlist.';
const MOVE_UPS = 'Move-ups: a class change (including a move-up) may be requested';
const ADDRESS = 'Expo Hall, 100 Main St, Louisville, KY 40202';

// The show fees are $25 and $30 and the show cap is 120, so a class fee of $17.50 and a trial
// cap of 37 can only come from the class and the trial.
function premiumFor(
  org: GeneratedPremium['org'],
  style: PremiumStyle,
  withTerms: boolean
): GeneratedPremium {
  const premium = generatedPremium('100 Main St');
  premium.org = org;
  premium.style = style;
  premium.show.maxTotalEntries = 120;
  premium.supplemental.vetClinic = { name: 'Bluegrass Animal ER', address: '9 Oak Rd', phone: '' };
  if (withTerms) {
    Object.assign(premium.show, {
      venueName: 'Expo Hall',
      venueCity: 'Louisville',
      venueState: 'KY',
      venueZip: '40202',
      allowWaitlist: true,
      waitlistAutoOffer: true,
      allowClassChangesAfterClose: true,
    });
  }
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-05-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      maxTotalEntries: withTerms ? 37 : null,
      judges: [{ name: 'Jane Smith' }],
      classes: [
        {
          element: 'Containers',
          level: 'Novice',
          section: null,
          entryFee: withTerms ? 17.5 : null,
        },
      ],
    },
  ];
  return premium;
}

const textFor = (org: GeneratedPremium['org'], style: PremiumStyle, withTerms: boolean) => {
  const Template = TEMPLATES[org];
  return (
    render(<Template premium={premiumFor(org, style, withTerms)} />).container.textContent ?? ''
  );
};

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe.each(['AKC', 'UKC', 'ASCA'] as const)('%s premium entry terms (MYK9-2227)', org => {
  it.each(STYLES)('%s: prints the class fee, trial limit and rules once', style => {
    const text = textFor(org, style, true);
    expect(occurrences(text, FEE_LINE)).toBe(1);
    expect(occurrences(text, TRIAL_LIMIT)).toBe(1);
    expect(occurrences(text, WAITLIST)).toBe(1);
    expect(occurrences(text, MOVE_UPS)).toBe(1);
    expect(text).toContain(ADDRESS);
  });

  it.each(STYLES)('%s: a show with none of it prints none of it', style => {
    const text = textFor(org, style, false);
    expect(text).not.toContain('Class fee');
    expect(text).not.toContain('Trial entry limit');
    expect(text).not.toContain('Waitlist:');
    expect(text).not.toContain('Move-ups:');
  });
});

describe('Gazette (MYK9-2227)', () => {
  it('prints the emergency vet clinic and the date beside the trial', () => {
    const text = textFor('AKC', 'gazette', true);
    expect(text).toContain('Emergency Vet');
    expect(text).toContain('Bluegrass Animal ER');
    expect(text).toContain('9 Oak Rd');
    expect(text).toContain(`Saturday · ${formatPremiumDate('2026-05-01')}`);
  });

  it('prints no vet section when the club has none', () => {
    const premium = premiumFor('AKC', 'gazette', true);
    premium.supplemental.vetClinic = null;
    const text = render(<AKCPremiumTemplate premium={premium} />).container.textContent ?? '';
    expect(text).not.toContain('Emergency Vet');
  });
});
