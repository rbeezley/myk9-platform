import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ClassReadinessStrip } from './ClassReadinessStrip';
import type { ClassReadinessEntry } from './classReadiness';

const entries: ClassReadinessEntry[] = [
  {
    entry_status: 'accepted',
    payment_status: 'paid_online',
    check_in_status: 'checked-in',
    is_scored: true,
  },
  {
    entry_status: 'submitted',
    payment_status: 'paid_online',
    check_in_status: 'no-status',
    is_scored: false,
  },
  {
    entry_status: 'accepted',
    payment_status: 'pending',
    check_in_status: 'no-status',
    is_scored: false,
  },
  {
    entry_status: 'missing_info',
    payment_status: 'pending',
    check_in_status: 'no-status',
    is_scored: false,
  },
];

const classData = {
  status: 'In Progress' as const,
  is_scoring_finalized: false,
  reopened_after_closeout_at: null,
};

describe('ClassReadinessStrip', () => {
  it('shows staff metrics and routes each clearing action to its existing owner surface', () => {
    render(
      <ClassReadinessStrip
        isStaff
        classData={classData}
        entries={entries}
        showId="show-1"
        trialId="trial-1"
        classId="class-1"
        isLoading={false}
        error={null}
      />,
      { initialRoute: '/classes/class-1' }
    );

    expect(screen.getByRole('region', { name: 'Class readiness' })).toBeInTheDocument();
    expect(screen.getByText('4 total entries')).toBeInTheDocument();
    expect(screen.getByText('1 needs review')).toBeInTheDocument();
    expect(screen.getByText('1 payment due')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 checked in')).toBeInTheDocument();
    expect(screen.getByText('1 of 4 scored')).toBeInTheDocument();

    expect(screen.getByRole('link', { name: /needs review/i })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management?mode=review&attention=pending&trial=trial-1&class=class-1'
    );
    expect(screen.getByRole('link', { name: /payment due/i })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management?mode=review&attention=accepted&payment=pending&trial=trial-1&class=class-1'
    );
    expect(screen.getByRole('link', { name: /checked in/i })).toHaveAttribute(
      'href',
      '/shows/show-1/entry-management?mode=day-of&attention=accepted&trial=trial-1&class=class-1'
    );
    expect(screen.getByRole('link', { name: /scored/i })).toHaveAttribute(
      'href',
      '/scoring/classes/class-1/entries?mode=split'
    );

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveClass('min-h-[44px]');
    }
  });

  it('does not expose staff metrics to exhibitors or anonymous visitors', () => {
    render(
      <ClassReadinessStrip
        isStaff={false}
        classData={classData}
        entries={entries}
        showId="show-1"
        trialId="trial-1"
        classId="class-1"
        isLoading={false}
        error={null}
      />
    );

    expect(screen.queryByRole('region', { name: 'Class readiness' })).not.toBeInTheDocument();
  });

  it('shows an honest loading state instead of zero-valued metrics', () => {
    render(
      <ClassReadinessStrip
        isStaff
        classData={classData}
        entries={[]}
        showId="show-1"
        trialId="trial-1"
        classId="class-1"
        isLoading
        error={null}
      />
    );

    expect(screen.getByRole('status', { name: 'Loading class readiness' })).toBeInTheDocument();
    expect(screen.queryByText(/0 total entries/i)).not.toBeInTheDocument();
  });

  it('shows a scoped recovery state when the entry source fails', () => {
    render(
      <ClassReadinessStrip
        isStaff
        classData={classData}
        entries={[]}
        showId="show-1"
        trialId="trial-1"
        classId="class-1"
        isLoading={false}
        error="Entries unavailable"
      />
    );

    expect(screen.getByRole('status', { name: 'Class readiness unavailable' })).toHaveTextContent(
      'Class readiness is unavailable until class entries load.'
    );
    expect(screen.queryByText(/0 total entries/i)).not.toBeInTheDocument();
  });

  it('keeps cached metrics visible when a background refresh reports an error', () => {
    render(
      <ClassReadinessStrip
        isStaff
        classData={classData}
        entries={entries}
        showId="show-1"
        trialId="trial-1"
        classId="class-1"
        isLoading={false}
        error="Refresh failed"
      />
    );

    expect(screen.getByText('4 total entries')).toBeInTheDocument();
    expect(
      screen.queryByRole('status', { name: 'Class readiness unavailable' })
    ).not.toBeInTheDocument();
  });
});
