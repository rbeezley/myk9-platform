import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { ViewToggle } from '../ViewToggle';

describe('ViewToggle — flow icon', () => {
  it('renders a button with title "Flow view" when flow mode is present', () => {
    const modes = [
      { key: 'list', label: 'List', icon: 'list' as const },
      { key: 'flow', label: 'Flow', icon: 'flow' as const },
    ] as const;
    render(<ViewToggle modes={modes} active="list" onChange={vi.fn()} />);
    expect(screen.getByTitle('Flow view')).toBeInTheDocument();
  });
});
