import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
  },
}));

import { notifications } from './notifications';

describe('notifications', () => {
  beforeEach(() => {
    toastError.mockClear();
  });

  it('passes a stable id through so repeated background failures replace one toast', () => {
    notifications.error('Refresh failed', { id: 'replication-download-failed' });
    notifications.error('Refresh failed', { id: 'replication-download-failed' });

    expect(toastError).toHaveBeenNthCalledWith(
      1,
      'Refresh failed',
      expect.objectContaining({ id: 'replication-download-failed' })
    );
    expect(toastError).toHaveBeenNthCalledWith(
      2,
      'Refresh failed',
      expect.objectContaining({ id: 'replication-download-failed' })
    );
  });
});
