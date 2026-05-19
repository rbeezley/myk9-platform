import { describe, expect, it } from 'vitest';
import {
  QUICK_BROADCAST_PRIORITY,
  buildQuickBroadcastExpiresAt,
  getQuickBroadcastTemplate,
} from '../quickBroadcast';

describe('quickBroadcast', () => {
  it('returns a canned template by id', () => {
    expect(getQuickBroadcastTemplate('ring-paused')).toMatchObject({
      id: 'ring-paused',
      title: 'Ring paused',
      content: expect.stringContaining('paused'),
    });
  });

  it('falls back to the first template for unknown ids', () => {
    expect(getQuickBroadcastTemplate('missing-template')).toMatchObject({
      id: 'lunch-ready',
      title: 'Lunch is ready',
    });
  });

  it('expires quick broadcasts two hours after posting', () => {
    expect(buildQuickBroadcastExpiresAt(new Date('2026-05-19T12:00:00.000Z'))).toBe(
      '2026-05-19T14:00:00.000Z'
    );
  });

  it('keeps quick broadcasts on the non-push priority lane', () => {
    expect(QUICK_BROADCAST_PRIORITY).toBe('normal');
  });
});
