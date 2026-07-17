import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { CheckInStatusIndicator } from './CheckInStatusIndicator';
import type { CheckInStatus } from '@/types/check-in-types';

describe('CheckInStatusIndicator', () => {
  it('renders a known status without throwing', () => {
    const { container } = render(
      <CheckInStatusIndicator status="checked-in" showLabel showTooltip={false} />
    );

    expect(container.querySelector('[data-family="entry"]')).toHaveAttribute(
      'data-shape',
      'in-progress'
    );
  });

  it('gives an icon-only status an accessible name', () => {
    const { getByRole } = render(
      <CheckInStatusIndicator status="checked-in" showTooltip={false} />
    );

    expect(getByRole('img', { name: 'Checked-in' })).toBeInTheDocument();
  });

  it('renders an unexpected status without throwing (defensive config fallback)', () => {
    // Before the fix, an out-of-union status returned undefined from
    // getCheckInStatusConfig and the component crashed dereferencing
    // config.backgroundColor — taking the whole tree down via the error boundary.
    const rogue = 'legacy-db-status' as CheckInStatus;
    expect(() =>
      render(<CheckInStatusIndicator status={rogue} showLabel showTooltip={false} />)
    ).not.toThrow();
  });

  it('shows the neutral fallback label for an unexpected status', () => {
    const rogue = 'legacy-db-status' as CheckInStatus;
    const { getByText } = render(
      <CheckInStatusIndicator status={rogue} showLabel showTooltip={false} />
    );
    expect(getByText('No Status')).toBeInTheDocument();
  });
});
