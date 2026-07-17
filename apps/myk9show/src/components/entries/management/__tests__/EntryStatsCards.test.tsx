import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { EntryStatsCards } from '../EntryStatsCards';
import type { EntryStats } from '@/types/entry-management-types';

function stats(overrides: Partial<EntryStats> = {}): EntryStats {
  return {
    total: 0,
    pending: 0,
    accepted: 0,
    waitlist: 0,
    revenue: 0,
    outstanding: 0,
    ...overrides,
  };
}

describe('EntryStatsCards', () => {
  it('renders an Outstanding stat card with the balance owed', () => {
    render(<EntryStatsCards stats={stats({ outstanding: 125 })} />);

    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('$125')).toBeInTheDocument();
  });

  it('reads zero for a fully settled show', () => {
    render(<EntryStatsCards stats={stats({ revenue: 500, outstanding: 0 })} />);

    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('$0')).toBeInTheDocument();
  });

  it('routes lifecycle summaries through the shared status grammar', () => {
    const { container } = render(
      <EntryStatsCards stats={stats({ pending: 2, accepted: 3, waitlist: 4 })} />
    );

    expect(container.querySelector('[data-status="pending"]')).not.toBeNull();
    expect(container.querySelector('[data-status="accepted"]')).not.toBeNull();
    expect(container.querySelector('[data-status="waitlist"]')).not.toBeNull();
  });
});
