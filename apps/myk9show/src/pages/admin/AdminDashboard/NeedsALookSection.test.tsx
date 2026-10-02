import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { routeTarget } from '@/features/admin-system-health/remediationTarget';
import type { TriageCategory, TriageItem } from '@/features/admin-overview/triageSelectors';
import { NeedsALookSection } from './NeedsALookSection';

const NOW = Date.parse('2026-09-05T19:00:00Z');

function item(id: string, category: TriageCategory, title: string): TriageItem {
  return {
    id,
    severity: 'High',
    category,
    title,
    detail: 'seen',
    openedAt: new Date(NOW).toISOString(),
    action: { label: 'Open', target: routeTarget('/admin/health') },
  };
}

const ITEMS = [
  item('a', 'money', 'Payout ledger drifted'),
  item('b', 'service', 'Edge function stale'),
  item('c', 'service', 'Cron missed'),
  item('d', 'deadline', 'Entries closing'),
];

function Harness() {
  const [filter, setFilter] = useState<TriageCategory | 'all'>('all');
  return <NeedsALookSection items={ITEMS} filter={filter} onFilterChange={setFilter} now={NOW} />;
}

describe('NeedsALookSection', () => {
  it('lists each category as a view with its own count', async () => {
    const { user } = render(<Harness />);

    await user.click(screen.getByRole('combobox', { name: /show: filter what needs a look/i }));

    expect(await screen.findByRole('option', { name: 'All (4)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Money (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Service (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Deadlines (1)' })).toBeInTheDocument();
  });

  it('narrows the queue to the picked view and can show everything again', async () => {
    const { user } = render(<Harness />);
    expect(screen.getByText('Showing all 4 open items.')).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /show: filter what needs a look/i }));
    await user.click(await screen.findByRole('option', { name: 'Service (2)' }));

    expect(screen.getByText('Edge function stale')).toBeInTheDocument();
    expect(screen.getByText('Cron missed')).toBeInTheDocument();
    expect(screen.queryByText('Payout ledger drifted')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 4 open items.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all open items' }));
    expect(screen.getByText('Payout ledger drifted')).toBeInTheDocument();
    expect(screen.getByText('Showing all 4 open items.')).toBeInTheDocument();
  });
});
