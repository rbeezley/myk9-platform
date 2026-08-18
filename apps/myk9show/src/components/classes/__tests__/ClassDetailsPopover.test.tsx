import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClassDetailsPopover } from '../ClassDetailsPopover';

vi.mock('@myk9/scoring-ui', () => ({
  useIsTouchDevice: () => false,
}));

describe('ClassDetailsPopover', () => {
  it('keeps the class details workflow human-readable without exposing the class UUID', async () => {
    const { user } = render(
      <ClassDetailsPopover
        data={{
          className: 'Interior Advanced',
          status: 'pending',
          entryCount: 12,
        }}
      >
        <button type="button">Open class details</button>
      </ClassDetailsPopover>,
      { initialRoute: '/' }
    );

    await user.click(screen.getByRole('button', { name: 'Open class details' }));

    expect(screen.getByText('Interior Advanced')).toBeInTheDocument();
    expect(screen.queryByText('Class ID')).not.toBeInTheDocument();
    expect(screen.queryByText(/dec1a55e-/)).not.toBeInTheDocument();
  });
});
