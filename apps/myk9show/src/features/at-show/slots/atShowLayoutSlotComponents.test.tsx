import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import {
  CompactOfflineIndicator,
  FilterTriggerButton,
  HamburgerMenu,
} from './atShowLayoutSlotComponents';

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
