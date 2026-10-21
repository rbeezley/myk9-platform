import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { HideResultsButton } from './HideResultsButton';

describe('HideResultsButton', () => {
  it('blocks the confirm, with the reason, when something changes while the dialog is open', async () => {
    const onHide = vi.fn();
    const props = { className: 'Container Novice A', hiding: false, onHide };
    const { user, rerender } = render(<HideResultsButton {...props} blockedReason={null} />);

    await user.click(screen.getByRole('button', { name: 'Hide results' }));
    const dialog = await screen.findByRole('alertdialog');
    rerender(<HideResultsButton {...props} blockedReason="Needs a connection to hide results." />);

    const confirm = within(dialog).getByRole('button', { name: 'Hide results' });
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText('Needs a connection to hide results.')).toBeInTheDocument();
    await user.click(confirm);
    expect(onHide).not.toHaveBeenCalled();
  });
});
