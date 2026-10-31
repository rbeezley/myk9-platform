import { describe, it, expect } from 'vitest';
import { enqueuePreferenceWrite } from './themeSync';

describe('enqueuePreferenceWrite', () => {
  it('runs one user’s writes strictly in order, even after a failure', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const first = enqueuePreferenceWrite('u1', async () => {
      await new Promise<void>(r => (releaseFirst = r));
      order.push('first');
      throw new Error('boom');
    });
    const second = enqueuePreferenceWrite('u1', async () => {
      order.push('second');
    });
    const other = enqueuePreferenceWrite('u2', async () => {
      order.push('other-user');
    });
    await other;
    expect(order).toEqual(['other-user']);
    releaseFirst();
    await expect(first).rejects.toThrow('boom');
    await second;
    expect(order).toEqual(['other-user', 'first', 'second']);
  });
});
