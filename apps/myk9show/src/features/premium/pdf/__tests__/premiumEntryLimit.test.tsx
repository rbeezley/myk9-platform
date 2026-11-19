import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
import type { PremiumStyle } from '@/types/premium-types';

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
const LINE = 'Entries are limited to 120 dogs in total.';

function premiumFor(style: PremiumStyle, org: 'AKC' | 'UKC', limit: number | null) {
  const premium = generatedPremium();
  premium.org = org;
  premium.style = style;
  premium.show.maxTotalEntries = limit;
  // Poster prints its own body only with judges, fees and a trial.
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-05-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [{ name: 'Jane Smith' }],
      classes: [],
    },
  ];
  return premium;
}

const ukcText = (style: PremiumStyle, limit: number | null) =>
  render(<UKCPremiumTemplate premium={premiumFor(style, 'UKC', limit)} />).container.textContent ??
  '';

describe('UKC premium total entry limit, every style (MYK9-2220)', () => {
  it.each(STYLES)('%s: prints the limit once as a plain line', style => {
    const text = ukcText(style, 120);
    expect(text).toContain(LINE);
    expect(text.split(LINE)).toHaveLength(2);
  });

  it.each(STYLES)('%s: a show with no limit says nothing', style => {
    expect(ukcText(style, null)).not.toContain('Entries are limited');
  });

  it.each(STYLES)('%s: AKC premium is unchanged', style => {
    const text =
      render(<AKCPremiumTemplate premium={premiumFor(style, 'AKC', 120)} />).container
        .textContent ?? '';
    expect(text).not.toContain('Entries are limited');
  });
});
