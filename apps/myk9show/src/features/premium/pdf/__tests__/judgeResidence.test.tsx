import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { UKCPremiumTemplate } from '../UKCPremiumTemplate';
import { STYLE_TOKENS } from '../pdfStyles';
import type { GeneratedPremium, PremiumStyle } from '../../../../types/premium-types';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';

const ALL_STYLES = Object.keys(STYLE_TOKENS) as PremiumStyle[];
type Org = 'AKC' | 'UKC';

function premiumWith(
  org: Org,
  style: PremiumStyle,
  judges: GeneratedPremium['trials'][number]['judges']
): GeneratedPremium {
  const base = generatedPremium();
  return {
    ...base,
    org,
    style,
    trials: [
      {
        name: 'Saturday Trial 1',
        date: '2026-05-01',
        startTime: '9:00 AM',
        eventNumber: `${org}-001`,
        type: 'Scent Work',
        judges,
        classes: [
          { element: 'Container', level: 'Novice', section: 'A' },
          { element: 'Interior', level: 'Advanced', section: null },
        ],
      },
    ],
  };
}

function bodyText(org: Org, premium: GeneratedPremium): string {
  const view =
    org === 'AKC'
      ? render(<AKCPremiumTemplate premium={premium} />)
      : render(<UKCPremiumTemplate premium={premium} />);
  return view.container.textContent ?? '';
}

describe('judges print their city of residence and classes in every style (MYK9-2067)', () => {
  it.each(ALL_STYLES)('%s prints name, city and state, and the judge classes', style => {
    const text = bodyText(
      'AKC',
      premiumWith('AKC', style, [
        {
          name: 'Jane Smith',
          residence: 'Springfield, IL',
          classes: ['Container Novice A', 'Interior Advanced'],
        },
      ])
    );
    expect(text).toContain('Jane Smith, Springfield, IL');
    expect(text).toContain('Container Novice A, Interior Advanced');
  });

  it.each(ALL_STYLES)('%s prints the name alone for a judge with no city', style => {
    const text = bodyText(
      'UKC',
      premiumWith('UKC', style, [{ name: 'Nora Nocity', residence: null, classes: [] }])
    );
    expect(text).toContain('Nora Nocity');
    expect(text).not.toMatch(/Nora Nocity,/);
  });

  it.each(ALL_STYLES)('%s prints no class line for a judge with no assignment', style => {
    const text = bodyText(
      'AKC',
      premiumWith('AKC', style, [{ name: 'Jane Smith', residence: 'Springfield, IL', classes: [] }])
    );
    expect(text).toContain('Jane Smith, Springfield, IL');
    // The trial's own class list is the only place a class label appears.
    expect(text.match(/Container Novice A/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
