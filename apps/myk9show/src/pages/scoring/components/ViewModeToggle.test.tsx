// apps/myk9show/src/pages/scoring/components/ViewModeToggle.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { ViewModeToggle } from './ViewModeToggle';

describe('ViewModeToggle', () => {
  it('names each icon-only mode tab so it is queryable by role and name', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ViewModeToggle mode="split" onChange={onChange} />);

    expect(screen.getByRole('tab', { name: 'List', selected: true })).toBeInTheDocument();
    const card = screen.getByRole('tab', { name: 'Card', selected: false });
    await user.click(card);
    expect(onChange).toHaveBeenCalledWith('sequential');
  });
});
