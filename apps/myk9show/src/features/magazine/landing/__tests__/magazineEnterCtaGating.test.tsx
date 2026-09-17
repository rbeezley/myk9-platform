import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';
import { FinalEditorialBand } from '../sections/FinalEditorialBand';

const ENTRY_URL = '/shows/show-1/register';

describe('Magazine landing Enter CTA gating', () => {
  describe('StickyNav', () => {
    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      const { getByRole, queryByText } = render(
        <StickyNav
          clubName="Test Kennel Club"
          editionLabel="Edition · 2026"
          entryWizardUrl={ENTRY_URL}
        />
      );

      const link = getByRole('link', { name: /enter the trial/i });
      expect(link).toHaveAttribute('href', ENTRY_URL);
      expect(queryByText(/classes pending/i)).toBeNull();
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      const { getByRole } = render(
        <StickyNav
          clubName="Test Kennel Club"
          editionLabel="Edition · 2026"
          entryWizardUrl={ENTRY_URL}
          canEnterOnline={true}
        />
      );

      expect(getByRole('link', { name: /enter the trial/i })).toHaveAttribute('href', ENTRY_URL);
    });

    it('hides the Enter link and shows the fallback when canEnterOnline is false', () => {
      const { queryByRole, getByText } = render(
        <StickyNav
          clubName="Test Kennel Club"
          editionLabel="Edition · 2026"
          entryWizardUrl={ENTRY_URL}
          canEnterOnline={false}
        />
      );

      expect(queryByRole('link', { name: /enter the trial/i })).toBeNull();
      expect(getByText(/classes pending/i)).toBeInTheDocument();
    });

    it('shows closed-entry copy when entries are closed', () => {
      const { queryByRole, getByText, queryByText } = render(
        <StickyNav
          clubName="Test Kennel Club"
          editionLabel="Edition · 2026"
          entryWizardUrl={ENTRY_URL}
          canEnterOnline={false}
          entryClosed
        />
      );

      expect(queryByRole('link', { name: /enter the trial/i })).toBeNull();
      expect(getByText(/entries closed/i)).toBeInTheDocument();
      expect(queryByText(/classes pending/i)).toBeNull();
    });
  });

  describe('FinalEditorialBand', () => {
    // MYK9-633: FinalEditorialBand no longer renders its own "Open the
    // entry wizard" link — it duplicated the header nav's "Enter the
    // trial" CTA. That header CTA is the page's one entry action at
    // 640px+; below that it's joined by the mobile-only
    // StickyEntryCtaBar rendered at the end of the page (covered by
    // MagazineLandingPage.test.tsx, not this component in isolation).
    it('never renders an entry-wizard link, regardless of canEnterOnline', () => {
      const { queryByRole } = render(
        <FinalEditorialBand
          classesHref={null}
          entryCloseDate={null}
          timezone="America/New_York"
          canEnterOnline={true}
        />
      );

      expect(queryByRole('link', { name: /open the entry wizard/i })).toBeNull();
    });

    it('hides the Enter link and shows the fallback copy when canEnterOnline is false', () => {
      const { queryByRole, getByText } = render(
        <FinalEditorialBand
          classesHref={null}
          entryCloseDate={null}
          timezone="America/New_York"
          canEnterOnline={false}
        />
      );

      expect(queryByRole('link', { name: /open the entry wizard/i })).toBeNull();
      expect(
        getByText(/the secretary still needs to assign classes before online entry is available\./i)
      ).toBeInTheDocument();
      expect(getByText(/classes are assigned/i)).toBeInTheDocument();
    });

    it('shows closed-entry guidance when entries are closed', () => {
      const { queryByRole, getByText, queryByText } = render(
        <FinalEditorialBand
          classesHref={null}
          entryCloseDate={null}
          timezone="America/New_York"
          canEnterOnline={false}
          entryClosed
        />
      );

      expect(queryByRole('link', { name: /open the entry wizard/i })).toBeNull();
      expect(getByText(/Contact the trial secretary/i)).toBeInTheDocument();
      expect(queryByText(/classes are assigned/i)).toBeNull();
    });
  });
});
