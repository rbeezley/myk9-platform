import { describe, expect, it, vi } from 'vitest';
import { createUplinkProbe, UPLINK_PROBE_ANSWER_TTL_MS } from './uplink-probe';
import type { PendingMutation } from './types';

const fetchFailure = { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' };
const mutation = { id: 'm', tableName: 'entries', rpc: undefined } as unknown as PendingMutation;

describe('createUplinkProbe', () => {
  it('re-asks the probe once its answer is older than the TTL', async () => {
    let clock = 1_000;
    const probe = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const isUplinkDown = createUplinkProbe(probe, () => clock);

    await expect(isUplinkDown(fetchFailure, mutation)).resolves.toBe(true);
    clock += UPLINK_PROBE_ANSWER_TTL_MS;
    await expect(isUplinkDown(fetchFailure, mutation)).resolves.toBe(true);
    expect(probe).toHaveBeenCalledTimes(1);

    clock += 1;
    await expect(isUplinkDown(fetchFailure, mutation)).resolves.toBe(false);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('does not ask the probe for a refusal', async () => {
    const probe = vi.fn().mockResolvedValue(false);
    const isUplinkDown = createUplinkProbe(probe);

    await expect(
      isUplinkDown({ message: 'denied', code: '42501', details: '', hint: '' }, mutation)
    ).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
});
