import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
import { formatPremiumDate } from '../../premiumFacts';
import type { GeneratedPremium } from '@/types/premium-types';

function gazettePremium(): GeneratedPremium {
  const premium = generatedPremium('100 Main St');
  premium.org = 'AKC';
  premium.style = 'gazette';
  premium.supplemental.vetClinic = { name: 'Bluegrass Animal ER', address: '9 Oak Rd', phone: '' };
  premium.trials = [
    {
      name: 'Saturday',
      date: '2026-05-01',
      startTime: null,
      eventNumber: null,
      type: 'Scent Work',
      judges: [{ name: 'Jane Smith' }],
      classes: [{ element: 'Containers', level: 'Novice', section: null }],
    },
  ];
  return premium;
}

const textOf = (premium: GeneratedPremium) =>
  render(<AKCPremiumTemplate premium={premium} />).container.textContent ?? '';

describe('Gazette (MYK9-2229)', () => {
  it('prints the emergency vet clinic and the date beside the trial', () => {
    const text = textOf(gazettePremium());
    expect(text).toContain('Emergency Vet');
    expect(text).toContain('Bluegrass Animal ER');
    expect(text).toContain('9 Oak Rd');
    expect(text).toContain(`Saturday · ${formatPremiumDate('2026-05-01')}`);
  });

  it('prints no vet section when the club has none', () => {
    const premium = gazettePremium();
    premium.supplemental.vetClinic = null;
    expect(textOf(premium)).not.toContain('Emergency Vet');
  });

  it('prints no vet section when the editor cleared every clinic field', () => {
    const premium = gazettePremium();
    premium.supplemental.vetClinic = { name: '', address: ' ', phone: '' };
    expect(textOf(premium)).not.toContain('Emergency Vet');
  });

  it('lists a dated trial before any class is assigned', () => {
    const premium = gazettePremium();
    premium.trials[0].classes = [];
    expect(textOf(premium)).toContain(`Saturday · ${formatPremiumDate('2026-05-01')}`);
  });
});
