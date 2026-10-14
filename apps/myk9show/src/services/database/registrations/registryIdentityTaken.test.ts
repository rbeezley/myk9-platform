import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { isRegistryIdentityTaken } from './registryIdentityTaken';

const rpc = vi.fn();
vi.mock('../supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

// Add Dog treats `true` as "block this identity" and `null` as "could not find
// out, carry on", so the three answers must stay distinct.
describe('isRegistryIdentityTaken', () => {
  beforeEach(() => {
    rpc.mockReset();
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  it('asks registry_identity_taken with the organization and number as typed', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(isRegistryIdentityTaken('AKC (American Kennel Club)', 'SR 1111')).resolves.toBe(
      true
    );
    expect(rpc).toHaveBeenCalledWith('registry_identity_taken', {
      p_organization: 'AKC (American Kennel Club)',
      p_registration_number: 'SR 1111',
    });
  });

  it('is false when the server says the number is free', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(isRegistryIdentityTaken('AKC', 'SR1')).resolves.toBe(false);
  });

  it('is null offline, without asking the network', async () => {
    onlineManager.setOnline(false);
    await expect(isRegistryIdentityTaken('AKC', 'SR1')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('is null when the server returned an error (including a missing function)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    await expect(isRegistryIdentityTaken('AKC', 'SR1')).resolves.toBeNull();
  });

  it('is null when the request throws, and never rejects', async () => {
    rpc.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(isRegistryIdentityTaken('AKC', 'SR1')).resolves.toBeNull();
  });

  it('is null when the server answers with something other than a boolean', async () => {
    rpc.mockResolvedValue({ data: { id: 'dog-1' }, error: null });
    await expect(isRegistryIdentityTaken('AKC', 'SR1')).resolves.toBeNull();
  });

  it('gives up after the timeout instead of waiting on a stalled connection', async () => {
    vi.useFakeTimers();
    rpc.mockReturnValue(new Promise(() => undefined));
    const pending = isRegistryIdentityTaken('AKC', 'SR1');
    await vi.advanceTimersByTimeAsync(5_001);
    await expect(pending).resolves.toBeNull();
  });
});
