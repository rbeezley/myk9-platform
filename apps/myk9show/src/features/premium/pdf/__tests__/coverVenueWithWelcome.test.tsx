import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AKCPremiumTemplate } from '../AKCPremiumTemplate';
import type { GeneratedPremium, PremiumStyle } from '../../../../types/premium-types';
import { generatedPremium } from '../../__tests__/fixtures/generatedPremium';

const WELCOME = 'Welcome to our trial, we are delighted to host you all weekend long.';
const VENUE = '12 Fair Road, Lexington, KY 40502';

function premiumWithWelcome(style: PremiumStyle): GeneratedPremium {
  const premium = generatedPremium('County Fairgrounds');
  premium.style = style;
  premium.show = {
    ...premium.show,
    address: '12 Fair Road',
    city: 'Lexington',
    state: 'KY',
    zipCode: '40502',
  };
  if (style === 'magazine') Object.assign(premium, { welcomeFromChair: WELCOME });
  else Object.assign(premium.narratives ?? {}, { welcomeFromChair: WELCOME });
  return premium;
}

describe('covers print the venue beside the chair welcome (MYK9-2245)', () => {
  it.each(['magazine', 'gazette'] as PremiumStyle[])(
    '%s cover keeps the street address when a welcome is set',
    style => {
      render(<AKCPremiumTemplate premium={premiumWithWelcome(style)} />);
      expect(screen.getAllByText(new RegExp(VENUE)).length).toBeGreaterThan(0);
    }
  );
});
