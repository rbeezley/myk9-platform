import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ActionableBadge } from '../ActionableBadge';

describe('ActionableBadge', () => {
  it('renders nothing when nothing waits, every source was read and no idle count is asked for', () => {
    render(<ActionableBadge count={0} />);
    expect(screen.queryByTestId('actionable-badge')).not.toBeInTheDocument();
  });

  it('shows the idle tool count, muted, when asked for', () => {
    render(<ActionableBadge count={0} idleCount={8} />);
    const badge = screen.getByTestId('actionable-badge');
    expect(badge).toHaveAttribute('data-tone', 'idle');
    expect(badge).toHaveTextContent('8 tools available');
  });

  it('shows ? rather than a calm idle count when a source could not be read', () => {
    render(<ActionableBadge count={0} incomplete idleCount={8} />);
    const badge = screen.getByTestId('actionable-badge');
    expect(badge).toHaveAttribute('data-tone', 'unknown');
    expect(badge).toHaveTextContent('?');
    expect(badge).toHaveTextContent('Cannot check whether anything needs attention');
  });

  it('shows the count in its tone, and says when it is a floor', () => {
    render(<ActionableBadge count={2} tone="routine" incomplete />);
    const badge = screen.getByTestId('actionable-badge');
    expect(badge).toHaveAttribute('data-tone', 'routine');
    expect(badge).toHaveTextContent('2 items need attention, and some could not be checked');
  });
});
