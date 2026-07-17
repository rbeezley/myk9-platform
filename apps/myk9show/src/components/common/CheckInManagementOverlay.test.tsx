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
    const { getByText } = render(
      <CheckInManagementOverlay
        open
        onOpenChange={noop}
        entries={[{ ...baseEntry, checkInStatus: 'checked-in' }]}
        onUpdateStatus={asyncNoop}
      />
    );

    const badge = getByText('Checked-in').parentElement;
    const icon = badge?.querySelector('[data-family="entry"]');
    expect(icon).toHaveAttribute('data-shape', 'in-progress');
    expect(icon?.className).toContain('text-info');
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
