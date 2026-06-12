import { describe, expect, it } from 'vitest';
import {
  getMutationQueueCapacity,
  QUEUE_MAX_SIZE,
  QUEUE_WARNING_THRESHOLD,
} from './mutation-queue-capacity';

describe('getMutationQueueCapacity', () => {
  it('returns ok below the warning threshold', () => {
    expect(getMutationQueueCapacity(0)).toBe('ok');
    expect(getMutationQueueCapacity(QUEUE_WARNING_THRESHOLD - 1)).toBe('ok');
  });

  it('returns warning at and above the warning threshold', () => {
    expect(getMutationQueueCapacity(QUEUE_WARNING_THRESHOLD)).toBe('warning');
    expect(getMutationQueueCapacity(QUEUE_MAX_SIZE - 1)).toBe('warning');
  });

  it('returns overflow at and above the max size', () => {
    expect(getMutationQueueCapacity(QUEUE_MAX_SIZE)).toBe('overflow');
    expect(getMutationQueueCapacity(QUEUE_MAX_SIZE + 1)).toBe('overflow');
  });
});
