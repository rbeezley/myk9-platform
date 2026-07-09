/**
 * exhibitor-ux-remediation: the Venue meta cell showed "TBA" even when the
 * show's street address was known and already rendered elsewhere on the same
 * page (MonogramFooter) — venueName/venueCity are separate structured fields
 * that are simply never populated. Falls back to the address instead of
 * contradicting the rest of the page.
 */
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { HeroBlock } from './HeroBlock';

const baseProps = {
  monogramLetters: 'HS',
  showName: 'Heartland Scent Work Classic',
  showSubtitle: 'AKC Licensed Trial',
  trialStartDate: '2026-08-01',
  trialEndDate: '2026-08-03',
  entryCloseDate: '2026-06-30',
  entryLimit: null,
  timezone: 'America/Chicago',
  entryWizardUrl: '/shows/show-1/register',
  classesHref: null,
};

describe('Monogram HeroBlock — venue fallback', () => {
  it('shows the street address when no structured venue name/city is set', () => {
    render(
      <HeroBlock
        {...baseProps}
        venueName={null}
        venueCity={null}
        venueAddress="100 Dog Show Lane, Tulsa, OK 74101"
      />
    );

    expect(screen.getByText('100 Dog Show Lane, Tulsa, OK 74101')).toBeInTheDocument();
    expect(screen.queryByText('TBA')).not.toBeInTheDocument();
  });

  it('prefers the structured venue name/city over the address when both are set', () => {
    render(
      <HeroBlock
        {...baseProps}
        venueName="Expo Hall"
        venueCity="Tulsa, OK"
        venueAddress="100 Dog Show Lane, Tulsa, OK 74101"
      />
    );

    expect(screen.getByText('Expo Hall · Tulsa, OK')).toBeInTheDocument();
  });

  it('falls back to TBA only when neither structured venue nor address is known', () => {
    render(<HeroBlock {...baseProps} venueName={null} venueCity={null} venueAddress={null} />);

    expect(screen.getByText('TBA')).toBeInTheDocument();
  });
});
