import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { CheckInManagementOverlay } from './CheckInManagementOverlay';
import type { CheckInStatus } from '@/types/check-in-types';

const noop = () => {};
const asyncNoop = vi.fn(async () => {});

const baseEntry = {
  id: 'e1',
  armband: '101',
  dogName: 'Rex',
  handlerName: 'Pat Handler',
  navigationStatus: 'pending' as const,
};

describe('CheckInManagementOverlay', () => {
  it('renders a known status without throwing', () => {
    const { getAllByText, queryByText } = render(
      <CheckInManagementOverlay
        open
        onOpenChange={noop}
        entries={[{ ...baseEntry, checkInStatus: 'checked-in' }]}
        onUpdateStatus={asyncNoop}
      />
    );

    // Query the status icon directly. 'Checked-in' now appears TWICE -- on the badge
    // and on the Select trigger, which since F34 renders the item's label instead of
    // the raw `checked-in` enum -- so getByText on the label is ambiguous. The
    // assertions here were always about the icon.
    const icon = document.querySelector('[data-family="entry"]');
    expect(icon).toHaveAttribute('data-shape', 'in-progress');
    expect(icon?.className).toContain('text-info');
    // The human label is what the trigger shows; the raw enum must not leak.
    expect(getAllByText('Checked-in').length).toBeGreaterThan(0);
    expect(queryByText('checked-in')).toBeNull();
  });

  it('renders an unexpected status without throwing (shared fallback)', () => {
    const rogue = 'legacy-db-status' as CheckInStatus;
    const { getByText } = render(
      <CheckInManagementOverlay
        open
        onOpenChange={noop}
        entries={[{ ...baseEntry, checkInStatus: rogue }]}
        onUpdateStatus={asyncNoop}
      />
    );
    // The row still renders; the entry's dog name is present.
    expect(getByText('Rex')).toBeInTheDocument();
  });
});
