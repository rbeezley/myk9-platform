/** MYK9-2290: each ASCA show-level fact prints once in every style, and an empty one prints nothing. */
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

const LINES = [
  'Sanctioning status',
  'Novice birch; Open birch and anise',
  'Spectators and videoing are not allowed.',
  'Pat the photographer, 555-0100',
];

function premiumFor(
  org: GeneratedPremium['org'],
  style: PremiumStyle,
  withFacts: boolean
): GeneratedPremium {
  const premium = generatedPremium('100 Main St');
  premium.org = org;
  premium.style = style;
  if (withFacts) {
    premium.show.ascaSanctionStatus = 'pending';
    premium.show.scentsByLevel = 'Novice birch; Open birch and anise';
    premium.show.spectatorsPolicy = 'not_allowed';
    premium.show.photographerContact = 'Pat the photographer, 555-0100';
  }
  return premium;
}

const textOf = (premium: GeneratedPremium) => {
  const Template = TEMPLATES[premium.org];
  return render(<Template premium={premium} />).container.textContent ?? '';
};

const occurrences = (text: string, needle: string) => text.split(needle).length - 1;

describe.each(['AKC', 'UKC', 'ASCA'] as const)('%s ASCA show facts (MYK9-2290)', org => {
  it.each(STYLES)('%s: prints each fact once', style => {
    const text = textOf(premiumFor(org, style, true));
    for (const line of LINES) expect(occurrences(text, line)).toBe(1);
    expect(text).toContain('Pending');
  });

  it.each(STYLES)('%s: prints none of them when unset', style => {
    const text = textOf(premiumFor(org, style, false));
    for (const line of LINES) expect(text).not.toContain(line);
    expect(text).not.toContain('Spectators and videoing');
  });
});
