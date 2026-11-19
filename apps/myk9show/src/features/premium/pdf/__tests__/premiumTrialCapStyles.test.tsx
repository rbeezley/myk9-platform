import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { ASCAPremiumTemplate } from '../ASCAPremiumTemplate';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
import { formatPremiumDate } from '../../premiumFacts';
import { premiumTrialEntryLimitText } from '../../premiumEntryLimit';
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

const TRIAL_LIMIT = 'Trial entry limit: 37 entries.';

// The show cap is 120, so 37 can only come from the trial.
function premiumFor(
  org: GeneratedPremium['org'],
  style: PremiumStyle,
  trialCap: number | null
): GeneratedPremium {
  const premium = generatedPremium('100 Main St');
  premium.org = org;
  premium.style = style;
  premium.show.maxTotalEntries = 120;
  premium.supplemental.vetClinic = { name: 'Bluegrass Animal ER', address: '9 Oak Rd', phone: '' };
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-05-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      maxTotalEntries: trialCap,
      judges: [{ name: 'Jane Smith' }],
      classes: [{ element: 'Containers', level: 'Novice', section: null }],
    },
  ];
  return premium;
}

const textOf = (premium: GeneratedPremium) => {
  const Template = TEMPLATES[premium.org];
  return render(<Template premium={premium} />).container.textContent ?? '';
};

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe.each(['AKC', 'UKC', 'ASCA'] as const)('%s trial entry limit (MYK9-2229)', org => {
  it.each(STYLES)('%s: prints the trial cap once, apart from the show cap', style => {
    const text = textOf(premiumFor(org, style, 37));
    expect(occurrences(text, TRIAL_LIMIT)).toBe(1);
  });

  it.each(STYLES)('%s: a trial with no cap prints no trial limit', style => {
    expect(textOf(premiumFor(org, style, null))).not.toContain('Trial entry limit');
  });
});

describe('Gazette (MYK9-2229)', () => {
  it('prints the emergency vet clinic and the date beside the trial', () => {
    const text = textOf(premiumFor('AKC', 'gazette', 37));
    expect(text).toContain('Emergency Vet');
    expect(text).toContain('Bluegrass Animal ER');
    expect(text).toContain('9 Oak Rd');
    expect(text).toContain(`Saturday · ${formatPremiumDate('2026-05-01')}`);
  });

  it('prints no vet section when the club has none', () => {
    const premium = premiumFor('AKC', 'gazette', 37);
    premium.supplemental.vetClinic = null;
    expect(textOf(premium)).not.toContain('Emergency Vet');
  });

  it('prints no vet section when the editor cleared every clinic field', () => {
    const premium = premiumFor('AKC', 'gazette', 37);
    premium.supplemental.vetClinic = { name: '', address: ' ', phone: '' };
    expect(textOf(premium)).not.toContain('Emergency Vet');
  });

  it('lists a dated, capped trial before any class is assigned', () => {
    const premium = premiumFor('AKC', 'gazette', 37);
    premium.trials[0].classes = [];
    const text = textOf(premium);
    expect(text).toContain(`Saturday · ${formatPremiumDate('2026-05-01')}`);
    expect(text).toContain(TRIAL_LIMIT);
  });
});

describe('premiumTrialEntryLimitText (MYK9-2229)', () => {
  it('words the limit and prints nothing when unset or invalid', () => {
    expect(premiumTrialEntryLimitText({ maxTotalEntries: 37 })).toBe(TRIAL_LIMIT);
    expect(premiumTrialEntryLimitText({ maxTotalEntries: 1 })).toBe('Trial entry limit: 1 entry.');
    expect(premiumTrialEntryLimitText({ maxTotalEntries: null })).toBeNull();
    expect(premiumTrialEntryLimitText({ maxTotalEntries: 0 })).toBeNull();
    expect(premiumTrialEntryLimitText({})).toBeNull();
  });
});
