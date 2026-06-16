import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { StickyNav } from '../sections/StickyNav';
import { FinalEditorialBand } from '../sections/FinalEditorialBand';

const ENTRY_URL = '/shows/show-1/register';

describe('Magazine landing Enter CTA gating', () => {
  describe('StickyNav', () => {
    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      const { getByRole, queryByText } = render(
        <StickyNav clubName="Test Kennel Club" editionLabel="Edition · 2026" entryWizardUrl={ENTRY_URL} />
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
  });

  describe('FinalEditorialBand', () => {
    it('renders the Enter link when canEnterOnline is omitted (default true)', () => {
      const { getByRole, queryByText } = render(
        <FinalEditorialBand
          entryWizardUrl={ENTRY_URL}
          entryCloseDate={null}
          timezone="America/New_York"
        />
      );

      const link = getByRole('link', { name: /open the entry wizard/i });
      expect(link).toHaveAttribute('href', ENTRY_URL);
      expect(
        queryByText(/the secretary still needs to assign classes before online entry is available\./i)
      ).toBeNull();
    });

    it('renders the Enter link when canEnterOnline is true', () => {
      const { getByRole } = render(
        <FinalEditorialBand
          entryWizardUrl={ENTRY_URL}
          entryCloseDate={null}
          timezone="America/New_York"
          canEnterOnline={true}
        />
      );

      expect(getByRole('link', { name: /open the entry wizard/i })).toHaveAttribute(
        'href',
        ENTRY_URL
      );
    });

    it('hides the Enter link and shows the fallback copy when canEnterOnline is false', () => {
      const { queryByRole, getByText } = render(
        <FinalEditorialBand
          entryWizardUrl={ENTRY_URL}
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
  });
});
