import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StickyNav } from '../sections/StickyNav';
import { HeroBlock } from '../sections/HeroBlock';
import { FinalCtaBand } from '../sections/FinalCtaBand';

describe('Monogram entry CTAs', () => {
  it('replaces the sticky enter link when classes are not ready', () => {
    render(
      <StickyNav
        clubName="Monogram Kennel Club"
        monogramLetters="MKC"
        entryWizardUrl="/shows/show-1/register"
        canEnterOnline={false}
      />
    );

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    expect(screen.getByText(/classes pending/i)).toBeInTheDocument();
  });

  it('replaces the hero enter link when classes are not ready', () => {
    render(
      <HeroBlock
        monogramLetters="MKC"
        showName="Monogram Trial"
        showSubtitle="AKC Licensed Trial"
        trialStartDate="2026-06-12"
        trialEndDate="2026-06-14"
        entryCloseDate={null}
        entryLimit={null}
        venueName="Show Grounds"
        venueCity="Austin"
        timezone="America/Chicago"
        entryWizardUrl="/shows/show-1/register"
        canEnterOnline={false}
      />
    );

    expect(screen.queryByRole('link', { name: /enter your dog/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no classes are assigned yet/i)).toBeInTheDocument();
  });

  it('replaces the final enter link when classes are not ready', () => {
    render(
      <FinalCtaBand
        monogramLetters="MKC"
        entryWizardUrl="/shows/show-1/register"
        entryCloseDate={null}
        timezone="America/Chicago"
        canEnterOnline={false}
      />
    );

    expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    expect(screen.getByText(/classes are assigned/i)).toBeInTheDocument();
  });
});
