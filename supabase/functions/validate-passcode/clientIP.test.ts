import { describe, expect, it } from 'vitest';

import { getClientIP } from './clientIP';

describe('getClientIP', () => {
  it('does not use a spoofable leftmost X-Forwarded-For value', () => {
    const request = new Request('https://example.test', {
      headers: {
        'x-forwarded-for': '198.51.100.99, 203.0.113.10',
      },
    });

    expect(getClientIP(request)).toBe('203.0.113.10');
  });

  it('prefers the edge-provided client IP over forwarded headers', () => {
    const request = new Request('https://example.test', {
      headers: {
        'cf-connecting-ip': '203.0.113.20',
        'x-forwarded-for': '198.51.100.99, 203.0.113.10',
        'x-real-ip': '203.0.113.11',
      },
    });

    expect(getClientIP(request)).toBe('203.0.113.20');
  });
});
