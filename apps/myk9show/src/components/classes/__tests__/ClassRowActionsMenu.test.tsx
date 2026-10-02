import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import ClassRowActionsMenu from '../ClassRowActionsMenu';

describe('ClassRowActionsMenu', () => {
  it('lists Edit first, then View, then Delete (MYK9-928)', async () => {
    const { user } = render(
      <ClassRowActionsMenu onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Class actions' }));

    expect((await screen.findAllByRole('menuitem')).map(item => item.textContent?.trim())).toEqual([
      'Edit Class',
      'View Details',
      'Delete Class',
    ]);
  });

  it('is a 44px touch target', () => {
    render(<ClassRowActionsMenu onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Class actions' })).toHaveClass('h-11', 'w-11');
  });
});
