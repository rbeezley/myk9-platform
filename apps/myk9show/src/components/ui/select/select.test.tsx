import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function TestSelect({ onAfterClick = vi.fn() }: { onAfterClick?: () => void }) {
  return (
    <div>
      <Select defaultValue="pending">
        <SelectTrigger aria-label="Entry status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="accepted">Accepted</SelectItem>
        </SelectContent>
      </Select>
      <button type="button" onClick={onAfterClick}>
        Next page action
      </button>
    </div>
  );
}

describe('Select', () => {
  it('releases its backdrop after Escape so the next click reaches the page', async () => {
    const onAfterClick = vi.fn();
    const { user } = render(<TestSelect onAfterClick={onAfterClick} />);

    await user.click(screen.getByRole('combobox', { name: 'Entry status' }));
    await screen.findByRole('option', { name: 'Accepted' });

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Accepted' })).not.toBeInTheDocument()
    );

    await user.click(screen.getByRole('button', { name: 'Next page action' }));
    expect(onAfterClick).toHaveBeenCalledTimes(1);
  });
});
