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

    it('shows closed-entry copy when entries are closed', () => {
      render(
        <StickyNav
          clubName="Heritage Kennel Club"
          entryWizardUrl={WIZARD_URL}
          canEnterOnline={false}
          entryClosed
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/entries closed/i)).toBeInTheDocument();
      expect(screen.queryByText(/classes pending/i)).not.toBeInTheDocument();
    });
  });

  describe('HeroBlock', () => {
    // MYK9-633: HeroBlock no longer renders its own "Enter this show" link
    // — it duplicated the header (StickyNav) CTA. The header CTA is the
    // page's one entry action, so this section only ever shows the "why
    // entry isn't available yet" copy.
    it('never renders an enter link, regardless of canEnterOnline', () => {
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
          classesHref={null}
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/no classes are assigned yet/i)).not.toBeInTheDocument();
    });

    it('shows the pending-classes fallback when classes are not ready', () => {
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
          classesHref={null}
          canEnterOnline={false}
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/no classes are assigned yet/i)).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      render(
        <HeroBlock
          clubName="Heritage Kennel Club"
          showName="Heritage Trial"
          showSubtitle="AKC Licensed Trial"
          entryCloseDate="2020-01-01"
          trialStartDate="2026-06-12"
          trialEndDate="2026-06-14"
          venueName="Show Grounds"
          venueCity="Austin"
          timezone="America/Chicago"
          classesHref={null}
          canEnterOnline={false}
          entryClosed
        />
      );

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/late-entry help/i)).toBeInTheDocument();
      expect(screen.queryByText(/no classes are assigned yet/i)).not.toBeInTheDocument();
    });
  });

  describe('FinalCtaBand', () => {
    // MYK9-633: FinalCtaBand no longer renders an "Enter this show" link —
    // it duplicated the header (StickyNav) CTA. The header CTA is the
    // page's one entry action at 640px+; below that it's joined by the
    // mobile-only StickyEntryCtaBar rendered at the end of the page
    // (covered by HeritageLandingPage.test.tsx, not this component in
    // isolation).
    it('never renders an enter link, regardless of canEnterOnline', () => {
      render(<FinalCtaBand canEnterOnline />);

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
    });

    it('shows the pending-classes fallback when classes are not ready', () => {
      render(<FinalCtaBand canEnterOnline={false} />);

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/secretary still needs to assign classes/i)).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      render(<FinalCtaBand canEnterOnline={false} entryClosed />);

      expect(screen.queryByRole('link', { name: /enter this show/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Contact the trial secretary/i)).toBeInTheDocument();
      expect(
        screen.queryByText(/secretary still needs to assign classes/i)
      ).not.toBeInTheDocument();
    });
  });
});
