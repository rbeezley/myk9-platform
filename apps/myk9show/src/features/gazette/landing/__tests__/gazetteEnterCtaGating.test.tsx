import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';
import { FinalCtaSection } from '../sections/FinalCtaSection';

const STICKY_PROPS = {
  clubName: 'Gazette Kennel Club',
  entryWizardUrl: '/shows/show-1/register',
  editionLabel: 'VOL. LXXIX · NO 47',
};

const FINAL_PROPS = {
  entryWizardUrl: '/shows/show-1/register',
  classesHref: '/shows/show-1/classes',
  entryCloseDate: null,
  timezone: 'America/Chicago',
};

describe('Gazette entry CTA gating', () => {
  describe('StickyNav', () => {
    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      render(<StickyNav {...STICKY_PROPS} />);
      const link = screen.getByRole('link', { name: /^enter$/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/shows/show-1/register');
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      render(<StickyNav {...STICKY_PROPS} canEnterOnline />);
      expect(screen.getByRole('link', { name: /^enter$/i })).toBeInTheDocument();
    });

    it('replaces the Enter link with a "Classes pending" fallback when canEnterOnline is false', () => {
      render(<StickyNav {...STICKY_PROPS} canEnterOnline={false} />);
      expect(screen.queryByRole('link', { name: /^enter$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/classes pending/i)).toBeInTheDocument();
    });

    it('shows closed-entry copy when entries are closed', () => {
      render(<StickyNav {...STICKY_PROPS} canEnterOnline={false} entryClosed />);
      expect(screen.queryByRole('link', { name: /^enter$/i })).not.toBeInTheDocument();
      expect(screen.getByText(/entries closed/i)).toBeInTheDocument();
      expect(screen.queryByText(/classes pending/i)).not.toBeInTheDocument();
    });
  });

  describe('FinalCtaSection', () => {
    it('renders the entry-wizard link when canEnterOnline is omitted (default true)', () => {
      render(<FinalCtaSection {...FINAL_PROPS} />);
      const link = screen.getByRole('link', { name: /open the entry wizard/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/shows/show-1/register');
    });

    it('renders the entry-wizard link when canEnterOnline is true', () => {
      render(<FinalCtaSection {...FINAL_PROPS} canEnterOnline />);
      expect(screen.getByRole('link', { name: /open the entry wizard/i })).toBeInTheDocument();
    });

    it('replaces the entry-wizard link with the pending-classes copy when canEnterOnline is false', () => {
      render(<FinalCtaSection {...FINAL_PROPS} canEnterOnline={false} />);
      expect(
        screen.queryByRole('link', { name: /open the entry wizard/i })
      ).not.toBeInTheDocument();
      expect(
        screen.getByText(
          /The secretary still needs to assign classes before online entry is available\./i
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/classes are assigned/i)).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      render(<FinalCtaSection {...FINAL_PROPS} canEnterOnline={false} entryClosed />);
      expect(
        screen.queryByRole('link', { name: /open the entry wizard/i })
      ).not.toBeInTheDocument();
      expect(screen.getByText(/Contact the trial secretary/i)).toBeInTheDocument();
      expect(screen.queryByText(/classes are assigned/i)).not.toBeInTheDocument();
    });
  });
});
