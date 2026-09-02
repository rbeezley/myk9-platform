import { render, screen } from '@/test/utils/testUtils';
import { useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { FeatureGate } from '../FeatureGate';

function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('FeatureGate', () => {
  it('navigates to pricing from the primary plan button without onUpgrade', async () => {
    const user = userEvent.setup();

    render(
      <>
        <FeatureGate feature="performance_stats" userPlan="free">
          <span>Performance statistics</span>
        </FeatureGate>
        <LocationProbe />
      </>,
      { initialRoute: '/exhibitor/analytics' }
    );

    await user.click(screen.getByRole('button', { name: /upgrade now/i }));
    await user.click(screen.getByRole('button', { name: /upgrade to premium/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/pricing-page');
  });
});
