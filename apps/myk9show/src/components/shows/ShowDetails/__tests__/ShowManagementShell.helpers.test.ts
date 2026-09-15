import { describe, it, expect, vi } from 'vitest';
import { runPublishTransitionGate } from '../ShowManagementShell.helpers';
import { PUBLISH_BLOCKED_MESSAGE } from '@/features/payments/onlineEntryGate';

describe('runPublishTransitionGate', () => {
  it('is a no-op when the save is not a transition into published', async () => {
    const publishShow = vi.fn().mockResolvedValue(undefined);
    await runPublishTransitionGate({
      currentStatus: 'draft',
      nextStatus: 'draft',
      publishShow,
    });
    expect(publishShow).not.toHaveBeenCalled();
  });

  it('is a no-op for an already-published show saving an unrelated edit', async () => {
    const publishShow = vi.fn().mockResolvedValue(undefined);
    await runPublishTransitionGate({
      currentStatus: 'published',
      nextStatus: 'published',
      publishShow,
    });
    expect(publishShow).not.toHaveBeenCalled();
  });

  it('awaits the direct publish path on a draft->published transition', async () => {
    const publishShow = vi.fn().mockResolvedValue(undefined);
    await runPublishTransitionGate({
      currentStatus: 'draft',
      nextStatus: 'published',
      publishShow,
    });
    expect(publishShow).toHaveBeenCalledTimes(1);
  });

  it('throws the DB gate refusal message when the trigger refuses (MK003)', async () => {
    const publishShow = vi
      .fn()
      .mockRejectedValue({ code: 'MK003', message: PUBLISH_BLOCKED_MESSAGE });

    await expect(
      runPublishTransitionGate({ currentStatus: 'draft', nextStatus: 'published', publishShow })
    ).rejects.toThrow(PUBLISH_BLOCKED_MESSAGE);
    expect(publishShow).toHaveBeenCalledTimes(1);
  });

  it('rethrows an unrelated error untouched, not the publish-gate message', async () => {
    const networkError = new Error('network down');
    const publishShow = vi.fn().mockRejectedValue(networkError);

    await expect(
      runPublishTransitionGate({ currentStatus: 'draft', nextStatus: 'published', publishShow })
    ).rejects.toBe(networkError);
  });
});
