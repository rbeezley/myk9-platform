import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { TrialSection } from './ClassSelectionStep.components';

/**
 * MYK9-564 — the Select Classes list read "Trial 1" / "Trial 2" with nothing
 * saying which day of the show weekend each one is. Exhibitors plan by day
 * ("I can only come Saturday"); trial numbers are the secretary's vocabulary.
 *
 * `trials.date` is a DATE column, so it reaches the store as a bare
 * `YYYY-MM-DD` (or, over PostgREST, as midnight UTC). Read as an instant it
 * renders the PREVIOUS day for every viewer west of UTC — the MYK9-384 /
 * MYK9-377 trap. The zones below bracket UTC on both sides, because a
 * calendar bug that only shifts west is invisible in UTC and in CI.
 */
const ORIGINAL_TZ = process.env.TZ;

const ZONES = ['America/Los_Angeles', 'America/Chicago', 'UTC', 'Asia/Tokyo'] as const;

afterEach(() => {
  // Assigning `undefined` would store the STRING "undefined" and leave this
  // reused worker in an invalid zone for every later date test.
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = ORIGINAL_TZ;
  }
});

describe.each(ZONES)('TrialSection day label in %s', zone => {
  beforeEach(() => {
    process.env.TZ = zone;
  });

  it('reads the TZ under test (guards the parameterisation itself)', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
  });

  it('labels a Friday trial "Friday, Oct 30" next to the trial name', () => {
    render(
      <TrialSection
        trialName="Trial 1"
        trialDate="2026-10-30"
        selectedCount={0}
        isExpanded={false}
        onToggle={() => {}}
      >
        <div />
      </TrialSection>
    );

    expect(screen.getByText('Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Friday, Oct 30')).toBeInTheDocument();
  });

  it('reads the written calendar day out of a midnight-UTC round-trip', () => {
    render(
      <TrialSection
        trialName="Trial 2"
        trialDate="2026-10-31T00:00:00+00:00"
        selectedCount={0}
        isExpanded={false}
        onToggle={() => {}}
      >
        <div />
      </TrialSection>
    );

    expect(screen.getByText('Saturday, Oct 31')).toBeInTheDocument();
  });

  it('renders the trial name alone when the trial has no date', () => {
    render(
      <TrialSection trialName="Trial 3" selectedCount={0} isExpanded={false} onToggle={() => {}}>
        <div />
      </TrialSection>
    );

    expect(screen.getByText('Trial 3')).toBeInTheDocument();
    expect(screen.queryByTestId('trial-day-label')).toBeNull();
  });
});
