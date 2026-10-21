import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { ActionableBadge } from '../ActionableBadge';

describe('ActionableBadge', () => {
  it('renders nothing when nothing waits and every source was read', () => {
    render(<ActionableBadge count={0} />);
    expect(screen.queryByTestId('actionable-badge')).not.toBeInTheDocument();
  });

  it('shows ? rather than nothing when a source could not be read', () => {
    render(<ActionableBadge count={0} incomplete />);
    const badge = screen.getByTestId('actionable-badge');
    expect(badge).toHaveAttribute('data-tone', 'unknown');
    expect(badge).toHaveTextContent('?');
    expect(badge).toHaveTextContent('Cannot check whether anything needs attention');
  });

  it('shows an urgent count in the urgent tone, singular for one', () => {
    render(<ActionableBadge count={1} tone="urgent" />);
    const badge = screen.getByTestId('actionable-badge');
    expect(badge).toHaveAttribute('data-tone', 'urgent');
    expect(badge).toHaveTextContent('1 item needs attention');
    expect(badge).not.toHaveTextContent('could not be checked');
  });

  it('shows the count in its tone, and says when it is a floor', () => {
    render(<ActionableBadge count={2} tone="routine" incomplete />);
    const badge = screen.getByTestId('actionable-badge');
    expect(badge).toHaveAttribute('data-tone', 'routine');
    expect(badge).toHaveTextContent('2 items need attention, and some could not be checked');
  });
  it('treats a count with no tone as urgent', () => {
    render(<ActionableBadge count={1} />);
    expect(screen.getByTestId('actionable-badge')).toHaveAttribute('data-tone', 'urgent');
  });
});
