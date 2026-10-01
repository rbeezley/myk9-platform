import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Trial } from '@/components/trials/types/trial.types';
import { TrialEditPanel } from '../TrialEditPanel';

const initialTrialData = {
  name: 'Saturday AM',
  showId: 'show-uuid-1234',
  showName: 'Heartland',
  trialDate: '2026-05-02',
  trialNumber: '1',
  status: 'Upcoming' as Trial['status'],
  plannedStartTime: '09:00 AM',
  eventNumber: '1',
  order: '1',
};

function renderPanel() {
  return render(
    <TrialEditPanel
      open
      onClose={vi.fn()}
      trialId="trial-1"
      trialName="Saturday AM"
      initialTrialData={initialTrialData}
    />
  );
}

describe('TrialEditPanel wording', () => {
  it('calls the recorded run times "Actual Start" and "Actual Finish"', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));

    expect(await screen.findByLabelText('Actual Start')).toBeInTheDocument();
    expect(screen.getByLabelText('Actual Finish')).toBeInTheDocument();
    expect(screen.queryByLabelText(/time started|time ended/i)).not.toBeInTheDocument();
  });

  it('does not show the internal Show ID', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('tab', { name: /advanced/i }));

    // Positive control: the Advanced tab is open and its own field is there.
    expect(await screen.findByLabelText('Image URL')).toBeInTheDocument();
    expect(screen.queryByLabelText(/show id/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('show-uuid-1234')).not.toBeInTheDocument();
  });
});
