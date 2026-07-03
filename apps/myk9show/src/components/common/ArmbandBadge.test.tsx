import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ArmbandBadge } from './ArmbandBadge';

describe('ArmbandBadge', () => {
  it('renders assigned armbands', () => {
    render(<ArmbandBadge armband="142" />);

    expect(screen.getByText('142')).toBeInTheDocument();
  });

  it('renders unassigned armbands as an em dash', () => {
    const { rerender } = render(<ArmbandBadge armband={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<ArmbandBadge armband={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();

    rerender(<ArmbandBadge armband="-" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
