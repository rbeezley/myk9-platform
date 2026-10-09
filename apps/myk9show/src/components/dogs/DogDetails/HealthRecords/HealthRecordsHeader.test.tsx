import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { HealthRecordsHeader } from './HealthRecordsHeader';

// jsdom has no layout, so overflow cannot be measured here. The wrapping
// classes are the mechanism that keeps the 390px page from scrolling sideways
// (slice5-journey-matrix covers the real geometry); this pins them and that
// both view buttons stay reachable and working.
describe('HealthRecordsHeader', () => {
  it('lets the header and the view-toggle row wrap, with both actions reachable', async () => {
    const onViewModeChange = vi.fn();
    render(
      <HealthRecordsHeader viewMode="timeline" onViewModeChange={onViewModeChange} showViewToggle />
    );

    expect(screen.getByTestId('health-records-header').className).toContain('flex-wrap');
    expect(screen.getByTestId('health-view-toggle').className).toContain('flex-wrap');

    await userEvent.click(screen.getByRole('button', { name: /traditional view/i }));
    expect(onViewModeChange).toHaveBeenCalledWith('traditional');
    expect(screen.getByRole('button', { name: /timeline view/i })).toBeInTheDocument();
  });

  it('hides the toggle when not requested', () => {
    render(
      <HealthRecordsHeader viewMode="timeline" onViewModeChange={vi.fn()} showViewToggle={false} />
    );
    expect(screen.queryByTestId('health-view-toggle')).not.toBeInTheDocument();
  });
});
