import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { CopyViewLinkButton } from '../CopyViewLinkButton';

// `userEvent.setup()` (invoked by the shared `render` helper) installs its
// own clipboard stub on `navigator.clipboard`, so the mock MUST be set after
// render — setting it before gets clobbered.
function setClipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('CopyViewLinkButton', () => {
  it('copies the absolute normalized URL and shows a success toast', async () => {
    const { user } = render(
      <CopyViewLinkButton href="/shows/show-1/entry-management?attention=pending" />
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await user.click(screen.getByRole('button', { name: /copy view link/i }));

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/shows/show-1/entry-management?attention=pending`
    );
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  describe('clipboard-failure fallback', () => {
    it('offers a selectable URL and never throws when the write rejects', async () => {
      const href = '/shows/show-1/entry-management?attention=pending';
      const { user } = render(<CopyViewLinkButton href={href} />);
      setClipboard({ writeText: vi.fn().mockRejectedValue(new Error('denied')) });

      await user.click(screen.getByRole('button', { name: /copy view link/i }));

      const fallbackInput = await screen.findByLabelText('View link');
      expect(fallbackInput).toHaveValue(`${window.location.origin}${href}`);
    });

    it('falls back cleanly when the Clipboard API is entirely unavailable, without disturbing surrounding state', async () => {
      const href = '/shows/show-1/classes/t1?status=in_progress';
      const { user } = render(
        <div>
          <span data-testid="unrelated-state">unchanged</span>
          <CopyViewLinkButton href={href} />
        </div>
      );
      setClipboard(undefined);

      await user.click(screen.getByRole('button', { name: /copy view link/i }));

      expect(await screen.findByLabelText('View link')).toHaveValue(
        `${window.location.origin}${href}`
      );
      // The failure never touched anything outside the button's own popover.
      expect(screen.getByTestId('unrelated-state')).toHaveTextContent('unchanged');
    });
  });
});
