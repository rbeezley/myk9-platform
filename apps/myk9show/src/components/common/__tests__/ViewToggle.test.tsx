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

  it('renders persistent visible labels when requested', () => {
    const modes = [
      { key: 'cards', label: 'Cards', icon: 'grid' as const },
      { key: 'map', label: 'Map', icon: 'map' as const },
    ] as const;
    render(<ViewToggle modes={modes} active="cards" onChange={vi.fn()} showLabels />);

    expect(screen.getByRole('button', { name: 'Cards view' })).toHaveTextContent('Cards');
    expect(screen.getByRole('button', { name: 'Map view' })).toHaveTextContent('Map');
  });
});
