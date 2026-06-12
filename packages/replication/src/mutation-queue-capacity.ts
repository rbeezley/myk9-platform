/** Warn when mutation queue exceeds this size. */
export const QUEUE_WARNING_THRESHOLD = 500;

/** Maximum mutation queue capacity. */
export const QUEUE_MAX_SIZE = 1000;

export type MutationQueueCapacity = 'ok' | 'warning' | 'overflow';

export function getMutationQueueCapacity(count: number): MutationQueueCapacity {
  if (count >= QUEUE_MAX_SIZE) return 'overflow';
  if (count >= QUEUE_WARNING_THRESHOLD) return 'warning';
  return 'ok';
}
