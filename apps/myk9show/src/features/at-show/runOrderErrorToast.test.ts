/**
 * Unit tests for notifyRunOrderPersistError — the shared failure notifier both
 * at-show run-order preset paths (single-class + combined) call from their
 * catch blocks. Assertion-first: pin that a persist failure surfaces a sonner
 * `toast.error` (the user-visible signal that was previously swallowed) carrying
 * the exact shared message, and that the underlying error is still logged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  notifyRunOrderPersistError,
  RUN_ORDER_PERSIST_ERROR_MESSAGE,
} from './runOrderErrorToast';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { toast } from 'sonner';
import { logger } from '@/utils/logger';

describe('notifyRunOrderPersistError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces a toast with the shared run-order failure message', () => {
    notifyRunOrderPersistError(new Error('RLS denied'));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(RUN_ORDER_PERSIST_ERROR_MESSAGE);
  });

  it('logs the underlying error for diagnosis', () => {
    notifyRunOrderPersistError(new Error('queue full'));

    expect(logger.error).toHaveBeenCalledWith('[at-show] apply run order failed', 'at-show', {
      error: 'Error: queue full',
    });
  });

  it('stringifies a non-Error rejection value', () => {
    notifyRunOrderPersistError('boom');

    expect(toast.error).toHaveBeenCalledWith(RUN_ORDER_PERSIST_ERROR_MESSAGE);
    expect(logger.error).toHaveBeenCalledWith('[at-show] apply run order failed', 'at-show', {
      error: 'boom',
    });
  });
});
