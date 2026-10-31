import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import type { Trial } from '@/components/trials/types/trial.types';
import { TrialEditPanel } from '../TrialEditPanel';

const baseTrial = {
  name: 'Saturday AM',
  showId: 'show-uuid-1234',
  showName: 'Darboshea',
  trialDate: '2026-10-10',
  trialNumber: '1',
  status: 'Upcoming' as Trial['status'],
  plannedStartTime: '09:00 AM',
  eventNumber: '1',
  order: '1',
  timezone: 'America/Chicago',
};

function renderPanel(extra: Partial<Trial>, onSave = vi.fn(async () => undefined)) {
  const view = render(
    <TrialEditPanel
      open
      onClose={vi.fn()}
      trialId="trial-1"
      trialName="Saturday AM"
      initialTrialData={{ ...baseTrial, ...extra }}
      organization="AKC"
      onSave={onSave}
    />
  );
  return { ...view, onSave };
}

async function saveAfterToggling(user: ReturnType<typeof renderPanel>['user']) {
  await user.click(screen.getByRole('tab', { name: /advanced/i }));
  await user.click(await screen.findByRole('switch', { name: /ask judges about unfinished/i }));
  await user.click(screen.getAllByRole('button', { name: /save changes/i })[0]!);
}

describe('TrialEditPanel stale-class switch (MYK9-1514)', () => {
  it('is on for a trial that never set it, and turning it off saves false', async () => {
    const { user, onSave } = renderPanel({});
    await user.click(screen.getByRole('tab', { name: /advanced/i }));
    const toggle = await screen.findByRole('switch', { name: /ask judges about unfinished/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await saveAfterToggling(user);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ autoCompleteStaleClasses: false })
    );
  });

  it('shows off for a trial that turned it off, and turning it back on saves true', async () => {
    const { user, onSave } = renderPanel({ autoCompleteStaleClasses: false });
    await user.click(screen.getByRole('tab', { name: /advanced/i }));
    const toggle = await screen.findByRole('switch', { name: /ask judges about unfinished/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await saveAfterToggling(user);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ autoCompleteStaleClasses: true })
    );
  });

  it('does not send the column when the switch is untouched', async () => {
    const { user, onSave } = renderPanel({});
    await user.type(await screen.findByLabelText(/trial name/i), ' B');
    await user.click(screen.getAllByRole('button', { name: /save changes/i })[0]!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [saved] = onSave.mock.calls[0] as unknown as [Partial<Trial>];
    expect(saved).not.toHaveProperty('autoCompleteStaleClasses');
  });
});
