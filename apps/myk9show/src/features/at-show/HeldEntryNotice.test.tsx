import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils/testUtils';
import { HeldEntryNotice } from './HeldEntryNotice';

const noop = () => undefined;

describe('HeldEntryNotice (MYK9-1162)', () => {
  it('submits the absent score when Mark absent is pressed', async () => {
    const submit = vi.fn().mockResolvedValue(undefined);
    const { user } = render(
      <HeldEntryNotice onBack={noop} submit={submit} submitError={null} onDismissError={noop} />
    );

    await user.click(screen.getByRole('button', { name: 'Mark absent' }));

    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ resultText: 'ABS', searchTime: '0.00' })
    );
  });

  it('shows the score-save failure the submit hook reports, on this surface', () => {
    render(
      <HeldEntryNotice
        onBack={noop}
        submit={vi.fn()}
        submitError="Score could not be queued for sync. Please retry."
        onDismissError={noop}
      />
    );

    expect(screen.getByText('Score could not be queued for sync. Please retry.')).toBeVisible();
  });

  it('turns a rejected submit into a visible failure instead of dropping it', async () => {
    const submit = vi.fn().mockRejectedValue(new Error('queue is full'));
    const { user } = render(
      <HeldEntryNotice onBack={noop} submit={submit} submitError={null} onDismissError={noop} />
    );

    await user.click(screen.getByRole('button', { name: 'Mark absent' }));

    await waitFor(() => expect(screen.getByText('queue is full')).toBeVisible());
    // The judge can try again.
    expect(screen.getByRole('button', { name: 'Mark absent' })).toBeEnabled();
  });
});
