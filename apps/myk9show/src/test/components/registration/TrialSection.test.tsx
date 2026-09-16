import { render, screen } from '@/test/utils/testUtils';
import { TrialSection } from '@/components/shows/RegistrationWorkflow/ClassSelectionStep.components';

describe('TrialSection', () => {
  const defaultProps = {
    trialName: 'Saturday Trial 1',
    trialType: 'Scent Work' as string | undefined,
    selectedCount: 3,
    isExpanded: true,
    onToggle: vi.fn(),
  };

  it('renders trial name and type badge', () => {
    render(
      <TrialSection {...defaultProps}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
  });

  it('humanizes stored trial type enum values', () => {
    render(
      <TrialSection {...defaultProps} trialType="scent_work">
        <div />
      </TrialSection>
    );
    expect(screen.getByText('Scent Work')).toBeInTheDocument();
    expect(screen.queryByText('scent_work')).not.toBeInTheDocument();
  });

  it('shows selected count when > 0', () => {
    render(
      <TrialSection {...defaultProps}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });

  it('shows "0 selected" in muted style when count is 0', () => {
    render(
      <TrialSection {...defaultProps} selectedCount={0}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('renders children when expanded', () => {
    render(
      <TrialSection {...defaultProps} isExpanded={true}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('hides children when collapsed', () => {
    render(
      <TrialSection {...defaultProps} isExpanded={false}>
        <div data-testid="child">Child content</div>
      </TrialSection>
    );
    expect(screen.queryByTestId('child')).not.toBeInTheDocument();
  });

  it('calls onToggle when header is clicked', async () => {
    const onToggle = vi.fn();
    const { user } = render(
      <TrialSection {...defaultProps} onToggle={onToggle}>
        <div />
      </TrialSection>
    );
    await user.click(screen.getByText('Saturday Trial 1'));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('omits type badge when trialType is undefined', () => {
    render(
      <TrialSection {...defaultProps} trialType={undefined}>
        <div />
      </TrialSection>
    );
    expect(screen.getByText('Saturday Trial 1')).toBeInTheDocument();
    expect(screen.queryByText('Scent Work')).not.toBeInTheDocument();
  });
});

/**
 * MYK9-564 - the Select Classes list read "Trial 1" / "Trial 2" with nothing
 * saying which day of the show weekend each one is. Exhibitors plan by day
 * ("I can only come Saturday"); trial numbers are the secretary's vocabulary.
 *
 * `trials.date` is a DATE column, so it reaches the store as a bare
 * `YYYY-MM-DD` (or, over PostgREST, as midnight UTC). Read as an instant it
 * renders the PREVIOUS day for every viewer west of UTC - the MYK9-384 /
 * MYK9-377 trap. The zones below bracket UTC on both sides, because a calendar
 * bug that only shifts west is invisible in UTC and in CI.
 */
describe('TrialSection - day of the week (MYK9-564)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  const ZONES = ['America/Los_Angeles', 'America/Chicago', 'UTC', 'Asia/Tokyo'] as const;

  afterEach(() => {
    // Assigning `undefined` would store the STRING "undefined" and leave this
    // reused worker in an invalid zone for every later date test - the
    // order-dependent leak that only shows up under CI's --sequence.shuffle.
    if (ORIGINAL_TZ === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = ORIGINAL_TZ;
    }
  });

  describe.each(ZONES)('in %s', zone => {
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
      // The separator lives in the text node, not in CSS, so it reaches the
      // button's accessible name - and under `flex-wrap` the two halves can
      // land on separate lines, where proximity alone stops carrying the
      // relationship between them.
      expect(screen.getByText('· Friday, Oct 30')).toBeInTheDocument();
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

      expect(screen.getByText('· Saturday, Oct 31')).toBeInTheDocument();
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
});
