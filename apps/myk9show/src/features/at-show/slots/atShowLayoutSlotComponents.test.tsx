import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  CompactOfflineIndicator,
  FilterTriggerButton,
  HamburgerMenu,
  PullToRefresh,
} from './atShowLayoutSlotComponents';

// MYK9-115 Task 5. The client pauses score uploads when the server raises
// RS429; without this banner it pauses SILENTLY, and a queue that stops
// draining with no explanation is indistinguishable from lost work.
describe('ContainmentBanner', () => {
  const contain = (untilMsFromNow: number) =>
    act(() => {
      window.dispatchEvent(
        new CustomEvent('replication:containment', {
          detail: { until: Date.now() + untilMsFromNow },
        })
      );
    });

  it('is absent until the server actually asks for a pause', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );

    expect(screen.queryByTestId('at-show-containment-banner')).toBeNull();
    expect(screen.getByText('entries')).toBeInTheDocument();
  });

  it('appears on the containment event and leads with the scores being safe', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    const banner = screen.getByTestId('at-show-containment-banner');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent(/Score sync paused/);
    expect(banner).toHaveTextContent(/scores are saved here/i);
    // Named as the server's decision, not the device's or the network's.
    expect(banner).toHaveTextContent(/the server asked this device to wait/i);
  });

  it('offers no retry control — retrying is what the breaker is stopping', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('announces itself to assistive tech without stealing focus', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    expect(screen.getByTestId('at-show-containment-banner')).toHaveAttribute('role', 'status');
  });

  it('never hides the entry list behind it', () => {
    render(
      <PullToRefresh onRefresh={async () => {}}>
        <div>entries</div>
      </PullToRefresh>
    );
    contain(60_000);

    expect(screen.getByText('entries')).toBeInTheDocument();
  });
});

describe('CompactOfflineIndicator', () => {
  it('labels offline capability without implying the device is currently offline', () => {
    render(<CompactOfflineIndicator />);

    expect(screen.getByText('Offline ready')).toBeInTheDocument();
    expect(screen.queryByText(/^Offline$/)).toBeNull();
  });
});

describe('FilterTriggerButton active-filter dot', () => {
  it('uses the 44px icon button size for ringside touch viewports', () => {
    render(<FilterTriggerButton onClick={() => {}} hasActiveFilters />);

    const trigger = screen.getByRole('button', { name: 'Search & sort' });
    expect(trigger.className).toContain('h-11');
    expect(trigger.className).toContain('w-11');
    expect(trigger.className).toContain('min-h-[44px]');
    expect(trigger.className).toContain('min-w-[44px]');
  });

  it('paints the dot with the semantic primary token, not a hardcoded hex', () => {
    const { container } = render(<FilterTriggerButton onClick={() => {}} hasActiveFilters />);

    // The dot must theme with --primary so it tracks the active palette in both
    // light and dark; a raw hex fallback (#14b8a6) would freeze it to one teal.
    const dot = container.querySelector('span.absolute');
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-primary');
    expect(dot?.className).not.toContain('14b8a6');
  });

  it('omits the dot when there are no active filters', () => {
    const { container } = render(
      <FilterTriggerButton onClick={() => {}} hasActiveFilters={false} />
    );

    expect(container.querySelector('span.absolute')).toBeNull();
  });
});

describe('HamburgerMenu', () => {
  it('uses the 44px icon button size when a back action is available', () => {
    render(<HamburgerMenu backNavigation={{ label: 'Back to classes', action: () => {} }} />);

    const trigger = screen.getByRole('button', { name: 'Back to classes' });
    expect(trigger.className).toContain('h-11');
    expect(trigger.className).toContain('w-11');
    expect(trigger.className).toContain('min-h-[44px]');
    expect(trigger.className).toContain('min-w-[44px]');
  });
});
