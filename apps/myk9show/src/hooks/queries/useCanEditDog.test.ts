import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onlineManager } from '@tanstack/react-query';
import { askCanEditDog } from './useCanEditDog';

const rpc = vi.fn();
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

// Bulk actions treat `false` as "refuse this dog" and `null` as "could not ask, go ahead",
// so the three answers must stay distinct.
describe('askCanEditDog', () => {
  beforeEach(() => {
    rpc.mockReset();
    onlineManager.setOnline(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  it('asks can_edit_dog for that dog and passes a yes through', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await expect(askCanEditDog('dog-1')).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('can_edit_dog', { p_dog_id: 'dog-1' });
  });

  it('is false only when the server answered no', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    await expect(askCanEditDog('dog-1')).resolves.toBe(false);
  });

  it('is null when the server has no such dog yet (made on this device, not uploaded)', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
  });

  it('is null when the server returned an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'JWT expired' } });
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
  });

  it('is null when the request never reached the server (offline)', async () => {
    rpc.mockImplementation(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
  });

  it('does not ask at all while the app is offline', async () => {
    onlineManager.setOnline(false);
    await expect(askCanEditDog('dog-1')).resolves.toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('gives up after a bounded wait on a stalled connection', async () => {
    vi.useFakeTimers();
    rpc.mockReturnValue(new Promise(() => {}));
    const answer = askCanEditDog('dog-1');
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(answer).resolves.toBeNull();
  });
});
