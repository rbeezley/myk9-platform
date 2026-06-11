import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { QuickActionsSection } from '../QuickActionsSection';

describe('QuickActionsSection', () => {
  it('renders nothing when showId is empty', () => {
    const { container } = render(
      <QuickActionsSection
        showId=""
        pendingEntriesCount={5}
        reportsReadyCount={2}
        activeTrialsCount={3}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders three cards when showId is provided', () => {
    render(
      <QuickActionsSection
        showId="show-1"
        pendingEntriesCount={12}
        reportsReadyCount={3}
        activeTrialsCount={2}
      />
    );
    expect(screen.getByText('Pending Entries')).toBeInTheDocument();
    expect(screen.getByText('Reports Ready')).toBeInTheDocument();
    expect(screen.getByText('Active Trials')).toBeInTheDocument();
  });

  it('displays the correct counts', () => {
    render(
      <QuickActionsSection
        showId="show-1"
        pendingEntriesCount={12}
        reportsReadyCount={3}
        activeTrialsCount={2}
      />
    );
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('displays zero counts without hiding them', () => {
    render(
      <QuickActionsSection
        showId="show-1"
        pendingEntriesCount={0}
        reportsReadyCount={0}
        activeTrialsCount={0}
      />
    );
    // All three cards show "0"
    const zeros = screen.getAllByText('0');
    expect(zeros).toHaveLength(3);
  });

  it('pending entries card links to entries page with showId', () => {
    render(
      <QuickActionsSection
        showId="show-abc"
        pendingEntriesCount={1}
        reportsReadyCount={0}
        activeTrialsCount={0}
      />
    );
    const link = screen.getByRole('link', { name: /review entries/i });
    expect(link).toHaveAttribute('href', '/shows/show-abc/entry-management');
  });

  it('reports ready card links to reports page', () => {
    render(
      <QuickActionsSection
        showId="show-abc"
        pendingEntriesCount={0}
        reportsReadyCount={1}
        activeTrialsCount={0}
      />
    );
    const link = screen.getByRole('link', { name: /export reports/i });
    expect(link).toHaveAttribute('href', '/shows/show-abc/reports');
  });

  it('active trials card links to day of operations', () => {
    render(
      <QuickActionsSection
        showId="show-abc"
        pendingEntriesCount={0}
        reportsReadyCount={0}
        activeTrialsCount={1}
      />
    );
    const link = screen.getByRole('link', { name: /day of ops/i });
    expect(link).toHaveAttribute('href', '/secretary/day-of-operations');
  });
});
