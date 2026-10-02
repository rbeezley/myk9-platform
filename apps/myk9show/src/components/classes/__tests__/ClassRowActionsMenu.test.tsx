import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import ClassRowActionsMenu from '../ClassRowActionsMenu';

describe('ClassRowActionsMenu', () => {
  it('is a 44px touch target', () => {
    render(<ClassRowActionsMenu onView={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Class actions' })).toHaveClass('h-11', 'w-11');
  });
});
