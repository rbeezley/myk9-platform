import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { ASCAPremiumTemplate } from '../ASCAPremiumTemplate';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
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

// Show fees are $25 / $30, so $17.50 can only come from the class.
const FEE = 'Class fees (pre-entry): Containers Novice $17.50.';
const MOVE_UPS_ON =
  "Class changes, including move-ups, may be requested after entries close. Each request needs the trial secretary's approval.";
const MOVE_UPS_OFF = 'Class changes cannot be requested after entries close.';

function premiumFor(
  org: GeneratedPremium['org'],
  style: PremiumStyle,
  withTerms: boolean,
  moveUps = true
): GeneratedPremium {
  const premium = generatedPremium('100 Main St');
  premium.org = org;
  premium.style = style;
  if (withTerms) {
    premium.show.allowWaitlist = false;
    premium.show.allowClassChangesAfterClose = moveUps;
  }
  // Saturday waitlists Containers only; Sunday (same class) does not. Buried costs the show fee.
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-05-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [{ name: 'Jane Smith' }],
      classes: [
        {
          element: 'Containers',
          level: 'Novice',
          section: null,
          entryFee: withTerms ? 17.5 : null,
          allowWaitlist: withTerms ? true : null,
        },
        { element: 'Buried', level: 'Novice', section: null, entryFee: withTerms ? 25 : null },
      ],
    },
    {
      name: 'Sunday',
      date: '2026-05-02',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [{ name: 'Jane Smith' }],
      classes: [{ element: 'Interior', level: 'Novice', section: null }],
    },
  ];
  return premium;
}

const textOf = (premium: GeneratedPremium) => {
  const Template = TEMPLATES[premium.org];
  return render(<Template premium={premium} />).container.textContent ?? '';
};

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe.each(['AKC', 'UKC', 'ASCA'] as const)(
  '%s waitlist, class fee, move-ups (MYK9-2231)',
  org => {
    it.each(STYLES)('%s: prints each line once, the waitlist by trial', style => {
      const text = textOf(premiumFor(org, style, true));
      expect(occurrences(text, FEE)).toBe(1);
      expect(occurrences(text, 'Classes taking a waitlist: Containers Novice.')).toBe(1);
      expect(occurrences(text, MOVE_UPS_ON)).toBe(1);
      // The class at the show fee prints no fee line of its own.
      expect(text).not.toContain('Buried Novice $25');
    });

    it.each(STYLES)('%s: move-ups off prints the other sentence', style => {
      const text = textOf(premiumFor(org, style, true, false));
      expect(occurrences(text, MOVE_UPS_OFF)).toBe(1);
      expect(text).not.toContain('move-ups');
    });

    it.each(STYLES)('%s: a premium without the columns prints none of it', style => {
      const text = textOf(premiumFor(org, style, false));
      expect(text).not.toContain('Class fees');
      expect(text).not.toContain('taking a waitlist');
      expect(text).not.toContain('Class changes');
    });
  }
);
