import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { TopStrip } from '../sections/TopStrip';
import { FinalCtaSection } from '../sections/FinalCtaSection';

const ENTRY_URL = '/shows/show-1/register';

describe('FieldGuide Enter CTA gating', () => {
  describe('TopStrip', () => {
    const baseProps = {
      showCode: 'AKC-2026',
      licenseLanguage: 'AKC Licensed Trial',
      entryWizardUrl: ENTRY_URL,
      classesHref: null,
      entryLimit: 360,
    };

    it('labels its section navigation with descriptive link names', () => {
      render(<TopStrip {...baseProps} />);

      const nav = screen.getByRole('navigation', { name: 'Show sections' });
      expect(within(nav).getByRole('link', { name: 'Welcome' })).toHaveAttribute('href', '#§01');
      expect(screen.getByRole('link', { name: 'Enter show' })).toHaveAttribute('href', ENTRY_URL);
    });

    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      render(<TopStrip {...baseProps} />);
      const link = screen.getByRole('link', { name: /enter/i });
      expect(link).toHaveAttribute('href', ENTRY_URL);
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      render(<TopStrip {...baseProps} canEnterOnline />);
      const link = screen.getByRole('link', { name: /enter/i });
      expect(link).toHaveAttribute('href', ENTRY_URL);
    });

    it('hides the Enter link and shows fallback when canEnterOnline is false', () => {
      render(<TopStrip {...baseProps} canEnterOnline={false} />);
      expect(screen.queryByRole('link', { name: /enter/i })).toBeNull();
      expect(screen.getByText('Classes pending')).toBeInTheDocument();
    });

    it('shows closed-entry copy when entries are closed', () => {
      render(<TopStrip {...baseProps} canEnterOnline={false} entryClosed />);
      expect(screen.queryByRole('link', { name: /enter/i })).toBeNull();
      expect(screen.getByText('Entries closed')).toBeInTheDocument();
      expect(screen.queryByText('Classes pending')).not.toBeInTheDocument();
    });
  });

  describe('FinalCtaSection', () => {
    const baseProps = {
      entryWizardUrl: ENTRY_URL,
      classesHref: null,
      entryCloseDate: '2026-06-10',
      timezone: 'America/New_York',
      entryLimit: 360,
    };

    it('renders the Submit Entry link when canEnterOnline is omitted (default true)', () => {
      render(<FinalCtaSection {...baseProps} />);
      const link = screen.getByRole('link', { name: /submit entry/i });
      expect(link).toHaveAttribute('href', ENTRY_URL);
    });

    it('renders the Submit Entry link when canEnterOnline is true', () => {
      render(<FinalCtaSection {...baseProps} canEnterOnline />);
      const link = screen.getByRole('link', { name: /submit entry/i });
      expect(link).toHaveAttribute('href', ENTRY_URL);
    });

    it('hides the link and shows fallback copy when canEnterOnline is false', () => {
      render(<FinalCtaSection {...baseProps} canEnterOnline={false} />);
      expect(screen.queryByRole('link', { name: /submit entry/i })).toBeNull();
      expect(
        screen.getByText(
          'The secretary still needs to assign classes before online entry is available.'
        )
      ).toBeInTheDocument();
      expect(screen.getByText(/classes are assigned/i)).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      render(<FinalCtaSection {...baseProps} canEnterOnline={false} entryClosed />);
      expect(screen.queryByRole('link', { name: /submit entry/i })).toBeNull();
      expect(screen.getByText(/Contact the trial secretary/i)).toBeInTheDocument();
      expect(screen.queryByText(/classes are assigned/i)).not.toBeInTheDocument();
    });
  });
});
