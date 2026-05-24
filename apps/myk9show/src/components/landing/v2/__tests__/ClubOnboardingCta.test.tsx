import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ClubFeatures } from '../ClubFeatures';
import { HeroPhotoLed } from '../HeroPhotoLed';

describe('club onboarding CTAs', () => {
  it('links the hero club CTA to signup in club request mode', () => {
    render(
      <MemoryRouter>
        <HeroPhotoLed />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /start a club on myk9show/i })).toHaveAttribute(
      'href',
      '/sign-up?request=club'
    );
  });

  it('links the club section CTA to signup in club request mode', () => {
    render(
      <MemoryRouter>
        <ClubFeatures />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /request club access/i })).toHaveAttribute(
      'href',
      '/sign-up?request=club'
    );
  });
});
