import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorState } from '@/components/common/ErrorState';

describe('ErrorState', () => {
  it('renders error message in plain English', () => {
    render(<ErrorState message="We couldn't load the shows." onRetry={vi.fn()} />);
    expect(screen.getByText("We couldn't load the shows.")).toBeInTheDocument();
  });

  it('renders retry button', () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Error" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalled();
  });
});
