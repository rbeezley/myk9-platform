import { describe, expect, it } from 'vitest';
import { UploadLock } from './upload-lock';

describe('UploadLock fallback mutex cancellation', () => {
  it('an aborted waiter leaves the queue, rejects at once, and never runs', async () => {
    const lock = new UploadLock();
    let releaseHolder!: () => void;
    const holder = lock.run(() => new Promise<void>(resolve => (releaseHolder = resolve)));
    const ran: string[] = [];
    const controller = new AbortController();
    const aborted = lock.run(async () => {
      ran.push('aborted');
    }, controller.signal);
    const next = lock.run(async () => {
      ran.push('next');
    });

    controller.abort();
    await expect(aborted).rejects.toBeDefined();
    expect(ran).toEqual([]);

    releaseHolder();
    await holder;
    await next;
    expect(ran).toEqual(['next']);
  });

  it('an already-aborted signal rejects without taking the lock', async () => {
    const lock = new UploadLock();
    const controller = new AbortController();
    controller.abort();
    await expect(lock.run(async () => 'x', controller.signal)).rejects.toBeDefined();
    await expect(lock.run(async () => 'y')).resolves.toBe('y');
  });
});
