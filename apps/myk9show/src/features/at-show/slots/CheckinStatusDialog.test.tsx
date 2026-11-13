import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@/test/utils/testUtils';
import { CheckinStatusDialog } from './CheckinStatusDialog';

describe('CheckinStatusDialog', () => {
  it('renders and selects each choice through the shared entry status grammar', async () => {
    const onStatusChange = vi.fn();
    const { user } = render(
      <CheckinStatusDialog
        isOpen
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
        dogInfo={{ armband: 101, callName: 'Piper', handler: 'Jane Handler' }}
        showRingManagement
      />
    );

    expect(screen.getByRole('button', { name: 'Checked-in' })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-family="entry"]')).toHaveLength(8);

    await user.click(screen.getByRole('button', { name: 'Come to Gate' }));
    expect(onStatusChange).toHaveBeenCalledWith('come-to-gate');
  });

  it("marks only the dog's current status as selected", () => {
    render(
      <CheckinStatusDialog
        isOpen
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        dogInfo={{ armband: 101, callName: 'Piper', handler: 'Jane Handler' }}
        currentStatus="at-gate"
      />
    );

    expect(screen.getByRole('button', { name: /At Gate/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('group', { name: 'Status options' })).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  it('asks before Pulled, naming the dog and class, and writes only after Pull', async () => {
    const onStatusChange = vi.fn();
    const { user } = render(
      <CheckinStatusDialog
        isOpen
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
        dogInfo={{ armband: 101, callName: 'Abby', handler: 'Jane Handler' }}
        className="Interior Novice A"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Pulled' }));
    expect(await screen.findByText('Pull Abby from Interior Novice A?')).toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Pull' }));
    expect(onStatusChange).toHaveBeenCalledWith('pulled');
  });

  it('writes nothing when the Pulled confirmation is cancelled', async () => {
    const onStatusChange = vi.fn();
    const { user } = render(
      <CheckinStatusDialog
        isOpen
        onClose={vi.fn()}
        onStatusChange={onStatusChange}
        dogInfo={{ armband: 101, callName: 'Abby', handler: 'Jane Handler' }}
        className="Interior Novice A"
      />
    );

    await user.click(screen.getByRole('button', { name: 'Pulled' }));
    await screen.findByText('Pull Abby from Interior Novice A?');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' })
    );

    expect(onStatusChange).not.toHaveBeenCalled();
  });

  it('offers an exhibitor only the statuses self check-in accepts (MYK9-1807)', () => {
    render(
      <CheckinStatusDialog
        isOpen
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        dogInfo={{ armband: 101, callName: 'Piper', handler: 'Jane Handler' }}
        showRingManagement
        selfCheckinOnly
      />
    );

    expect(document.querySelectorAll('[data-family="entry"]')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Come to Gate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /In Ring/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Completed/i })).not.toBeInTheDocument();
  });

  it('keeps the staff list for a viewer who is not self-check-in only', () => {
    render(
      <CheckinStatusDialog
        isOpen
        onClose={vi.fn()}
        onStatusChange={vi.fn()}
        dogInfo={{ armband: 101, callName: 'Piper', handler: 'Jane Handler' }}
      />
    );

    expect(document.querySelectorAll('[data-family="entry"]')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Come to Gate' })).toBeInTheDocument();
  });
});
