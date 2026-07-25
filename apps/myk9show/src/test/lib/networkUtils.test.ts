import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useNetworkQuality } from '@/lib/networkUtils';

const originalConnection = (navigator as Navigator & { connection?: unknown }).connection;

afterEach(() => {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value: originalConnection,
  });
});

describe('useNetworkQuality', () => {
  it('does not assume the Network Information API is an EventTarget', () => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: {
        effectiveType: '4g',
        downlink: 10,
        rtt: 20,
      },
    });

    expect(() => renderHook(() => useNetworkQuality())).not.toThrow();
  });
});
