/** MYK9-2292: a judge's affiliation prints beside their name in every style, on ASCA only. */
import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { ASCAPremiumTemplate } from '../ASCAPremiumTemplate';
import { STYLE_TOKENS } from '../pdfStyles';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
import type { GeneratedPremium, PremiumStyle } from '@/types/premium-types';

const STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
const TEMPLATES = {
  AKC: AKCPremiumTemplate,
  UKC: UKCPremiumTemplate,
  ASCA: ASCAPremiumTemplate,
} as const;

const AFFILIATION = 'ASCA-approved judge, Region 4';

function premiumFor(
  org: GeneratedPremium['org'],
  style: PremiumStyle,
  affiliation: string | null
): GeneratedPremium {
  const premium = generatedPremium('100 Main St');
  premium.org = org;
  premium.style = style;
  premium.trials = [
    {
      name: 'Saturday Trial 1',
      date: '2026-05-01',
      startTime: '9:00 AM',
      eventNumber: 'T-001',
      type: 'Scent Detection',
      judges: [{ name: 'Jane Smith', residence: 'Springfield, IL', affiliation, classes: [] }],
      classes: [{ element: 'Container', level: 'Novice', section: null }],
    },
  ];
  return premium;
}

const textOf = (premium: GeneratedPremium) => {
  const Template = TEMPLATES[premium.org];
  return render(<Template premium={premium} />).container.textContent ?? '';
};

describe('judge affiliation in every style (MYK9-2292)', () => {
  it.each(STYLES)('%s: ASCA prints it beside the judge name', style => {
    const text = textOf(premiumFor('ASCA', style, AFFILIATION));
    expect(text).toContain(`Jane Smith, Springfield, IL (${AFFILIATION})`);
  });

  it.each(STYLES)('%s: ASCA prints nothing extra when empty', style => {
    const text = textOf(premiumFor('ASCA', style, null));
    expect(text).toContain('Jane Smith, Springfield, IL');
    expect(text).not.toContain('Region 4');
    expect(text).not.toContain('()');
  });

  it.each(['AKC', 'UKC'] as const)('%s never prints it', org => {
    for (const style of STYLES) {
      expect(textOf(premiumFor(org, style, AFFILIATION))).not.toContain('Region 4');
    }
  });
});
