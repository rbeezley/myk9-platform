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
    expect(() =>
      render(
        <CheckInManagementOverlay
          open
          onOpenChange={noop}
          entries={[{ ...baseEntry, checkInStatus: 'checked-in' }]}
          onUpdateStatus={asyncNoop}
        />
      )
    ).not.toThrow();
  });

  it('renders an unexpected status without throwing (icon-map fallback)', () => {
    // Before the fix, STATUS_ICONS[rogue] was undefined and rendering
    // <undefined /> threw "Element type is invalid", taking the tree down.
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
