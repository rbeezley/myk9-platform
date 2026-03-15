import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DogsAheadBadge } from '@/components/live/DogsAheadBadge';

describe('DogsAheadBadge', () => {
  it('shows "5 dogs ahead" when position is 5', () => {
    render(<DogsAheadBadge dogsAhead={5} />);
    expect(screen.getByText('5 dogs ahead')).toBeInTheDocument();
  });

  it('shows "You\'re next!" when position is 1', () => {
    render(<DogsAheadBadge dogsAhead={1} />);
    expect(screen.getByText("You're next!")).toBeInTheDocument();
  });

  it('shows "In Ring" when position is 0', () => {
    render(<DogsAheadBadge dogsAhead={0} />);
    expect(screen.getByText('In Ring')).toBeInTheDocument();
  });

  it('shows result when completed', () => {
    render(<DogsAheadBadge dogsAhead={-1} result="Q" />);
    expect(screen.getByText('Q')).toBeInTheDocument();
  });

  it('shows stale indicator when staleMinutes provided', () => {
    render(<DogsAheadBadge dogsAhead={3} staleMinutes={5} />);
    expect(screen.getByText(/Updated 5m ago/)).toBeInTheDocument();
  });
});
