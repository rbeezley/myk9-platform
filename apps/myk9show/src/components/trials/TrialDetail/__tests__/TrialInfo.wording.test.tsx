import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { TrialInfo } from '../TrialInfo';
import type { Trial } from '../../types/trial.types';

describe('TrialInfo', () => {
  it('calls the recorded run times "Actual Start" and "Actual Finish"', () => {
    const trial = {
      id: 'trial-1',
      showName: 'Heartland',
      trialDate: '2026-05-02',
      trialNumber: '1',
      timeStarted: '09:15 AM',
      timeEnded: '12:30 PM',
    } as unknown as Trial;
    render(<TrialInfo trial={trial} onEdit={vi.fn()} onAddPhoto={vi.fn()} />);

    expect(screen.getByText('Actual Start')).toBeInTheDocument();
    expect(screen.getByText('Actual Finish')).toBeInTheDocument();
    expect(screen.queryByText(/time started|time ended/i)).not.toBeInTheDocument();
  });

  it('has no Delete in its options menu: Delete trial lives in the Edit panel footer', async () => {
    const trial = { id: 'trial-1', showName: 'Heartland', trialNumber: '1' } as unknown as Trial;
    const { user } = render(<TrialInfo trial={trial} onEdit={vi.fn()} onAddPhoto={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Trial options' }));
    // Positive control: the menu is open and carries its other items.
    expect(await screen.findByText('Edit Details')).toBeInTheDocument();
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument();
  });
});
