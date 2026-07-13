import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { FlagMasthead } from '../sections/FlagMasthead';
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
  entryWizardUrl: '/shows/abc/register',
  classesHref: null,
};

const finalBandProps = {
  brandColors,
  entryWizardUrl: '/shows/abc/register',
  classesHref: null,
  entryCloseDate: '2026-06-20',
  timezone: 'America/New_York',
};

describe('Banner Enter CTA gating', () => {
  describe('FlagMasthead', () => {
    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      render(<FlagMasthead {...mastheadProps} />);
      const link = screen.getByRole('link', { name: 'Enter this show' });
      expect(link).toHaveAttribute('href', '/shows/abc/register');
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      render(<FlagMasthead {...mastheadProps} canEnterOnline />);
      expect(screen.getByRole('link', { name: 'Enter this show' })).toBeInTheDocument();
    });

    it('hides the Enter link and shows the fallback when canEnterOnline is false', () => {
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

  describe('FinalFlagBand', () => {
    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      render(<FinalFlagBand {...finalBandProps} />);
      const link = screen.getByRole('link', { name: 'Enter this show' });
      expect(link).toHaveAttribute('href', '/shows/abc/register');
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      render(<FinalFlagBand {...finalBandProps} canEnterOnline />);
      expect(screen.getByRole('link', { name: 'Enter this show' })).toBeInTheDocument();
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
