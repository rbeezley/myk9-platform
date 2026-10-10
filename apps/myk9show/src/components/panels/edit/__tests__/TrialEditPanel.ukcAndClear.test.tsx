import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Trial } from '@/components/trials/types/trial.types';
import { TrialEditPanel, trialEventNumberRules } from '../TrialEditPanel';

const initialTrialData = {
  name: 'Saturday AM',
  showId: 'show-uuid-1234',
  showName: 'Darboshea',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Upcoming' as Trial['status'],
  plannedStartTime: '09:00 AM',
  eventNumber: '',
  order: '1',
  timeStarted: '09:12 AM',
};

function renderPanel(organization: string) {
  return render(
    <TrialEditPanel
      open
      onClose={vi.fn()}
      trialId="trial-1"
      trialName="Saturday AM"
      initialTrialData={initialTrialData}
      organization={organization}
    />
  );
}

describe('trialEventNumberRules', () => {
  it('hides the event number for UKC, requires it for AKC, and keeps it optional elsewhere', () => {
    expect(trialEventNumberRules('UKC')).toEqual({ show: false, required: false });
    expect(trialEventNumberRules('AKC')).toEqual({ show: true, required: true });
    expect(trialEventNumberRules('ASCA')).toEqual({ show: true, required: false });
    expect(trialEventNumberRules(undefined)).toEqual({ show: true, required: true });
  });
});

describe('TrialEditPanel (MYK9-1086)', () => {
  it('has no Event Number field on a UKC trial', async () => {
    renderPanel('UKC');
    // Positive control: the same tab's Trial Number field is there.
    expect(await screen.findByLabelText(/trial number/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/event number/i)).not.toBeInTheDocument();
  });

  it('keeps the Event Number field on an AKC trial', async () => {
    renderPanel('AKC');
    expect(await screen.findByLabelText(/event number/i)).toBeInTheDocument();
  });

  it('clears a recorded Actual Start', async () => {
    const { user } = renderPanel('UKC');
    await user.click(screen.getByRole('tab', { name: /scheduling/i }));

    await user.click(await screen.findByRole('button', { name: 'Clear Actual Start' }));

    expect(screen.getByLabelText('Actual Start')).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear Actual Start' })).not.toBeInTheDocument();
  });
});
