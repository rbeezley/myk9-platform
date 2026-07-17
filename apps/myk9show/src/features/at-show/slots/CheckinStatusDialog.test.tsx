import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
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
});
