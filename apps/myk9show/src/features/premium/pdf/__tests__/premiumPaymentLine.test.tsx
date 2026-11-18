import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';
import type { PremiumStyle } from '@/types/premium-types';

const STYLES: PremiumStyle[] = ['heritage', 'gazette', 'poster'];

function textFor(
  style: PremiumStyle,
  online: boolean,
  acceptChecks: boolean,
  acceptCash: boolean
): string {
  const premium = generatedPremium();
  premium.style = style;
  premium.show.onlineEntriesEnabled = online;
  premium.show.acceptChecks = acceptChecks;
  premium.show.acceptCash = acceptCash;
  const { container } = render(<AKCPremiumTemplate premium={premium} />);
  return container.textContent ?? '';
}

describe('premium accepted payment line, every layout', () => {
  it.each(STYLES)('%s: a card-only show lists card, not a placeholder', style => {
    const text = textFor(style, true, false, false);
    expect(text).toContain('Credit/Debit Card');
    expect(text).not.toContain('Payment TBD');
    expect(text).not.toContain('Payment methods TBD');
  });

  it.each(STYLES)('%s: card with check', style => {
    const text = textFor(style, true, true, false);
    expect(text).toMatch(/Credit\/Debit Card.{1,4}Checks/);
    expect(text).not.toContain('Cash');
  });

  it.each(STYLES)('%s: card with check and cash', style => {
    expect(textFor(style, true, true, true)).toMatch(/Credit\/Debit Card.{1,4}Checks.{1,4}Cash/);
  });

  it.each(STYLES)('%s: a legacy row with online off lists check only', style => {
    const text = textFor(style, false, true, false);
    expect(text).toContain('Checks');
    expect(text).not.toContain('Credit/Debit Card');
  });
});
