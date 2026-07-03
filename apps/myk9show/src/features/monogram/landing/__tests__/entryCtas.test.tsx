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

  describe('"Closes {date}" gating (ux-date-status-consistency)', () => {
    const heroBaseProps = {
      monogramLetters: 'MKC',
      showName: 'Monogram Trial',
      showSubtitle: 'AKC Licensed Trial',
      trialStartDate: '2026-06-12',
      trialEndDate: '2026-06-14',
      entryLimit: null,
      venueName: 'Show Grounds',
      venueCity: 'Austin',
      timezone: 'America/Chicago',
      entryWizardUrl: '/shows/show-1/register',
      classesHref: null,
    };

    it('HeroBlock shows "Closed" instead of a stale close date once entryCloseDate is in the past', () => {
      render(<HeroBlock {...heroBaseProps} entryCloseDate="2020-01-01" />);
      expect(screen.getByText('Closed')).toBeInTheDocument();
      expect(screen.queryByText(/Jan 1/)).not.toBeInTheDocument();
    });

    it('HeroBlock shows the close date when entryCloseDate is still in the future', () => {
      render(<HeroBlock {...heroBaseProps} entryCloseDate="2099-01-01" />);
      expect(screen.queryByText('Closed')).not.toBeInTheDocument();
      expect(screen.queryByText('TBA')).not.toBeInTheDocument();
    });

    it('HeroBlock shows "TBA" when no entryCloseDate is set at all', () => {
      render(<HeroBlock {...heroBaseProps} entryCloseDate={null} />);
      expect(screen.getByText('TBA')).toBeInTheDocument();
    });

    it('FinalCtaBand hides the "Closes {date}" line once entryCloseDate is in the past', () => {
      render(
        <FinalCtaBand
          monogramLetters="MKC"
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate="2020-01-01"
          timezone="America/Chicago"
        />
      );
      expect(screen.queryByText(/Closes/)).not.toBeInTheDocument();
    });

    it('FinalCtaBand shows the "Closes {date}" line when entryCloseDate is still in the future', () => {
      render(
        <FinalCtaBand
          monogramLetters="MKC"
          entryWizardUrl="/shows/show-1/register"
          entryCloseDate="2099-01-01"
          timezone="America/Chicago"
        />
      );
      expect(screen.getByText(/Closes/)).toBeInTheDocument();
    });
  });
});
