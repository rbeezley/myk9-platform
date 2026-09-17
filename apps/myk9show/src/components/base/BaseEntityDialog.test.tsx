import { render, screen } from '@/test/utils/testUtils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/LoggingService', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { logger } from '@/services/LoggingService';
import { BaseEntityDialog } from './BaseEntityDialog';

// No StandardDialog mock: BaseEntityDialog renders CommonDialog directly now
// (MYK9-584), so a mock of StandardDialog would be inert and would only mislead
// a reader about what is in the path. This exercises the real footer.

describe('BaseEntityDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('consumes a rejected async submit handler', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    const onSubmit = vi.fn(() => Promise.reject(new Error('blocked')));

    render(
      <BaseEntityDialog open onOpenChange={vi.fn()} title="Delete dog" onSubmit={onSubmit}>
        <span>Confirmation</span>
      </BaseEntityDialog>
    );

    screen.getByRole('button', { name: 'Save' }).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });

  // MYK9-593: the swallow is deliberate (callers report their own failures),
  // but it was total — anything the caller does NOT report left the user with a
  // closed dialog and no message anywhere. Log it so it is at least recoverable.
  it('logs a rejected submit instead of discarding it', async () => {
    const unhandled = vi.fn();
    window.addEventListener('unhandledrejection', unhandled);
    const failure = new Error('getLabel exploded');
    const onSubmit = vi.fn(() => Promise.reject(failure));

    render(
      <BaseEntityDialog open onOpenChange={vi.fn()} title="Delete dog" onSubmit={onSubmit}>
        <span>Confirmation</span>
      </BaseEntityDialog>
    );

    screen.getByRole('button', { name: 'Save' }).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith(
      'BaseEntityDialog submit rejected',
      'components',
      { title: 'Delete dog' },
      failure
    );
    // Still consumed: logging must not turn a handled refusal into an
    // unhandledrejection.
    expect(unhandled).not.toHaveBeenCalled();
    window.removeEventListener('unhandledrejection', unhandled);
  });
});
