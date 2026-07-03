const BENIGN_RESIZE_OBSERVER_LOOP_MESSAGES = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications.',
] as const;

export function isBenignResizeObserverLoopError(message: string | null | undefined): boolean {
  if (!message) return false;

  return BENIGN_RESIZE_OBSERVER_LOOP_MESSAGES.some(pattern => message.includes(pattern));
}
