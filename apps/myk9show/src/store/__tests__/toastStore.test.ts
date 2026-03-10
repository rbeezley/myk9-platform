import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useToastStore } from '../toastStore';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(
  id: string,
  priority: NotificationPayload['priority'] = 'normal'
): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: `Alert ${id}`,
    body: `Body ${id}`,
    priority,
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('toastStore', () => {
  it('addToast adds a toast', () => {
    useToastStore.getState().addToast(makePayload('1'));
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].payload.id).toBe('1');
  });

  it('limits to 3 visible toasts (oldest removed first)', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('2'));
    useToastStore.getState().addToast(makePayload('3'));
    useToastStore.getState().addToast(makePayload('4'));

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(3);
    expect(toasts.map(t => t.payload.id)).toEqual(['2', '3', '4']);
  });

  it('dismissToast removes a toast by id', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('2'));

    useToastStore.getState().dismissToast('1');

    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(useToastStore.getState().toasts[0].payload.id).toBe('2');
  });

  it('does not add duplicate toast ids', () => {
    useToastStore.getState().addToast(makePayload('1'));
    useToastStore.getState().addToast(makePayload('1'));

    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
});
