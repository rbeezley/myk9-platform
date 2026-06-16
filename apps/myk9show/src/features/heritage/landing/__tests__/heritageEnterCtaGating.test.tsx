import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';
import { HeroBlock } from '../sections/HeroBlock';
import { FinalCtaBand } from '../sections/FinalCtaBand';

const WIZARD_URL = '/shows/show-1/register';

describe('Heritage entry CTAs', () => {
  describe('StickyNav', () => {
    it('renders the enter link when classes are ready', () => {
      render(<StickyNav clubName="Heritage Kennel Club" entryWizardUrl={WIZARD_URL} />);

      const link = screen.getByRole('link', { name: /enter this show/i });
      expect(link).toHaveAttribute('href', WIZARD_URL);
      expect(screen.queryByText(/classes pending/i)).not.toBeInTheDocument();
    });

    it('replaces the enter link with a fallback when classes are not ready', () => {
      render(
        <StickyNav
          clubName="Heritage Kennel Club"
          entryWizardUrl={WIZARD_URL}
          canEnterOnline={false}
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/classes pending/i)).toBeInTheDocument();
    });
  });

  describe('HeroBlock', () => {
    it('renders the enter link when classes are ready', () => {
      render(
        <HeroBlock
          clubName="Heritage Kennel Club"
          showName="Heritage Trial"
          showSubtitle="AKC Licensed Trial"
          entryCloseDate={null}
          trialStartDate="2026-06-12"
          trialEndDate="2026-06-14"
          venueName="Show Grounds"
          venueCity="Austin"
          timezone="America/Chicago"
          entryWizardUrl={WIZARD_URL}
        />
      );

      const link = screen.getByRole('link', { name: /enter this show/i });
      expect(link).toHaveAttribute('href', WIZARD_URL);
      expect(screen.queryByText(/no classes are assigned yet/i)).not.toBeInTheDocument();
    });

    it('replaces the enter link with a fallback when classes are not ready', () => {
      render(
        <HeroBlock
          clubName="Heritage Kennel Club"
          showName="Heritage Trial"
          showSubtitle="AKC Licensed Trial"
          entryCloseDate={null}
          trialStartDate="2026-06-12"
          trialEndDate="2026-06-14"
          venueName="Show Grounds"
          venueCity="Austin"
          timezone="America/Chicago"
          entryWizardUrl={WIZARD_URL}
          canEnterOnline={false}
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/no classes are assigned yet/i)).toBeInTheDocument();
    });
  });

  describe('FinalCtaBand', () => {
    it('renders the enter link when classes are ready', () => {
      render(<FinalCtaBand entryWizardUrl={WIZARD_URL} />);

      const link = screen.getByRole('link', { name: /enter this show/i });
      expect(link).toHaveAttribute('href', WIZARD_URL);
      expect(
        screen.queryByText(/secretary still needs to assign classes/i)
      ).not.toBeInTheDocument();
    });

    it('replaces the enter link with a fallback when classes are not ready', () => {
      render(<FinalCtaBand entryWizardUrl={WIZARD_URL} canEnterOnline={false} />);

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/secretary still needs to assign classes/i)).toBeInTheDocument();
    });
  });
});
