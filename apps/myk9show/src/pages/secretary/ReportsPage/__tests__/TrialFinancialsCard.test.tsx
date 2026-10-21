import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { TrialFinancialsCard } from '../TrialFinancialsCard';

vi.mock('@/components/secretary/FinancialSummary', () => ({
  FinancialSummary: ({ trialId }: { trialId: string }) => (
    <div data-testid="financial-summary" data-trial-id={trialId} />
  ),
}));

// Two days of a show often both have a "Trial 1" (MYK9-1320 review): the date tells them apart.
const trials = [
  { id: 'sat-1', name: 'Trial 1', trial_number: 'Trial 1', date: '2026-12-05' },
  { id: 'sun-1', name: 'Trial 1', trial_number: 'Trial 1', date: '2026-12-06' },
];

describe('TrialFinancialsCard', () => {
  it('labels same-named trials on different days by their date', () => {
    render(<TrialFinancialsCard trialId="sun-1" trials={trials} onPickTrial={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Trial 1 · 2026-12-05' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Trial 1 · 2026-12-06' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Trial financials: Trial 1 · 2026-12-06')).toBeInTheDocument();
  });
});
