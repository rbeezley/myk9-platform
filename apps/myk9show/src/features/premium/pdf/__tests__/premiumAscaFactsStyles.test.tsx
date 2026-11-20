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

describe('ASCA show facts (MYK9-2290)', () => {
  it.each(STYLES)('%s: prints each fact once', style => {
    const text = textOf(premiumFor('ASCA', style, true));
    for (const line of LINES) expect(occurrences(text, line)).toBe(1);
    expect(text).toContain('Pending');
  });
});

// The facts are ASCA's: a show switched to another registry keeps them hidden in the editor,
// and they never print on that registry's premium.
describe.each(['AKC', 'UKC'] as const)('%s premium with ASCA facts still held (MYK9-2290)', org => {
  it.each(STYLES)('%s: prints none of them', style => {
    const text = textOf(premiumFor(org, style, true));
    for (const line of LINES) expect(text).not.toContain(line);
  });
});

describe.each(['AKC', 'UKC', 'ASCA'] as const)('%s ASCA show facts unset (MYK9-2290)', org => {
  it.each(STYLES)('%s: prints none of them when unset', style => {
    const text = textOf(premiumFor(org, style, false));
    for (const line of LINES) expect(text).not.toContain(line);
    expect(text).not.toContain('Spectators and videoing');
  });
});

// MYK9-2291: the two club-template facts follow the same rule.
const CLUB_LINES = ['Gravel lot, 200 ft to the ring', '30 amp, 10 sites'];

function withClubFacts(org: GeneratedPremium['org'], style: PremiumStyle, set: boolean) {
  const premium = premiumFor(org, style, false);
  if (set) {
    premium.supplemental.limitedMobilityNotes = CLUB_LINES[0]!;
    premium.supplemental.rvHookupNotes = CLUB_LINES[1]!;
  }
  return premium;
}

describe('ASCA club template facts (MYK9-2291)', () => {
  it.each(STYLES)('%s: ASCA prints each once', style => {
    const text = textOf(withClubFacts('ASCA', style, true));
    for (const line of CLUB_LINES) expect(occurrences(text, line)).toBe(1);
  });

  it.each(['AKC', 'UKC'] as const)('%s prints neither, though the template holds them', org => {
    for (const style of STYLES) {
      const text = textOf(withClubFacts(org, style, true));
      for (const line of CLUB_LINES) expect(text).not.toContain(line);
    }
  });

  it.each(STYLES)('%s: ASCA prints no label when both are empty', style => {
    const text = textOf(withClubFacts('ASCA', style, false));
    expect(text).not.toContain('Limited mobility access');
    expect(text).not.toContain('RV hook-ups');
  });
});
