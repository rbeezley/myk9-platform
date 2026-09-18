import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FlagMasthead } from '../sections/FlagMasthead';
import { StickyNav } from '../sections/StickyNav';
import { FinalFlagBand } from '../sections/FinalFlagBand';
import { deriveBannerBrandColors } from '../../hooks/useBannerBrandColor';

const brandColors = deriveBannerBrandColors('#1a5fb4');

const mastheadProps = {
  brandColors,
  showName: 'Spring Classic',
  showSubtitle: 'AKC Licensed Trial',
  clubName: 'Riverbend Kennel Club',
  trialStartDate: '2026-07-01',
  trialEndDate: '2026-07-02',
  entryCloseDate: '2026-06-20',
  entryLimit: 100,
  venueName: 'Riverbend Fairgrounds',
  venueCity: 'Springfield',
  timezone: 'America/New_York',
  classesHref: null,
};

const stickyNavProps = {
  entryWizardUrl: '/shows/abc/register',
  entryCount: 42,
  entryLimit: 100,
};

const finalBandProps = {
  brandColors,
  classesHref: null,
  entryCloseDate: '2026-06-20',
  timezone: 'America/New_York',
};

describe('Banner Enter CTA gating', () => {
  describe('FlagMasthead', () => {
    // MYK9-633 round 2: the masthead is not sticky, so a visitor scrolled
    // past it had zero reachable entry action once the duplicate
    // final-band CTA was removed. The CTA moved to StickyNav (below),
    // which persists at every scroll position; the masthead keeps only
    // the fallback prose.
    it('never renders an entry link, regardless of canEnterOnline', () => {
      render(<FlagMasthead {...mastheadProps} canEnterOnline />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
    });

    it('shows the pending-classes fallback when canEnterOnline is false', () => {
      render(<FlagMasthead {...mastheadProps} canEnterOnline={false} />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
      expect(
        screen.getByText('Entries are not available yet because no classes are assigned yet.')
      ).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      render(<FlagMasthead {...mastheadProps} canEnterOnline={false} entryClosed />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
      expect(screen.getByText(/late-entry help/i)).toBeInTheDocument();
      expect(screen.queryByText(/classes are assigned/i)).not.toBeInTheDocument();
    });
  });

  describe('StickyNav', () => {
    // MYK9-633 round 3: round 2 dropped the live entry-count status while
    // adding the CTA -- the issue asked for one CTA, not the removal of
    // status copy (poster's equivalent StickyNav kept its own). Restored.
    it('shows the live entry-count status alongside the CTA', () => {
      render(<StickyNav {...stickyNavProps} />);
      expect(screen.getByText('Entries open · 42 / 100')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Enter this show' })).toBeInTheDocument();
    });

    it('falls back to a count-unavailable status when entryCount is null', () => {
      render(<StickyNav {...stickyNavProps} entryCount={null} />);
      expect(screen.getByText('Entries open · count unavailable')).toBeInTheDocument();
    });

    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      render(<StickyNav {...stickyNavProps} />);
      const link = screen.getByRole('link', { name: 'Enter this show' });
      expect(link).toHaveAttribute('href', '/shows/abc/register');
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      render(<StickyNav {...stickyNavProps} canEnterOnline />);
      expect(screen.getByRole('link', { name: 'Enter this show' })).toBeInTheDocument();
    });

    it('replaces the Enter link with a "Classes pending" fallback when canEnterOnline is false', () => {
      render(<StickyNav {...stickyNavProps} canEnterOnline={false} />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
      expect(screen.getByText('Classes pending')).toBeInTheDocument();
    });

    it('shows closed-entry copy when entries are closed', () => {
      render(<StickyNav {...stickyNavProps} canEnterOnline={false} entryClosed />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
      expect(screen.getByText('Entries closed')).toBeInTheDocument();
      expect(screen.queryByText('Classes pending')).not.toBeInTheDocument();
    });
  });

  describe('FinalFlagBand', () => {
    // MYK9-633: FinalFlagBand no longer renders its own "Enter this show"
    // link at all — it duplicated the masthead's CTA. The header/masthead
    // CTA is the page's one entry action at 640px+; below that it's joined
    // by the mobile-only StickyEntryCtaBar rendered at the end of the page
    // (covered by BannerLandingPage.test.tsx, not this component in
    // isolation).
    it('never renders an entry link, regardless of canEnterOnline', () => {
      render(<FinalFlagBand {...finalBandProps} canEnterOnline />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
    });

    it('hides the Enter link and shows the fallback when canEnterOnline is false', () => {
      render(<FinalFlagBand {...finalBandProps} canEnterOnline={false} />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
      expect(
        screen.getByText(
          'The secretary still needs to assign classes before online entry is available.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText('classes are assigned.')).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      render(<FinalFlagBand {...finalBandProps} canEnterOnline={false} entryClosed />);
      expect(screen.queryByRole('link', { name: 'Enter this show' })).not.toBeInTheDocument();
      expect(screen.getByText(/Contact the trial secretary/i)).toBeInTheDocument();
      expect(screen.queryByText(/classes are assigned/i)).not.toBeInTheDocument();
    });

    it('hides the stale "Closes {date}" line once entryCloseDate is in the past', () => {
      render(<FinalFlagBand {...finalBandProps} entryCloseDate="2020-01-01" />);
      expect(screen.queryByText(/Closes/)).not.toBeInTheDocument();
    });

    it('shows the "Closes {date}" line when entryCloseDate is still in the future', () => {
      render(<FinalFlagBand {...finalBandProps} entryCloseDate="2099-01-01" />);
      expect(screen.getByText(/Closes/)).toBeInTheDocument();
    });

    it('shows no "Closes" line when entryCloseDate is not set (fails open, no false claim either way)', () => {
      render(<FinalFlagBand {...finalBandProps} entryCloseDate={null} />);
      expect(screen.queryByText(/Closes/)).not.toBeInTheDocument();
    });
  });
});
