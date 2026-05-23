import { setupLocalStorageMock } from '../mocks/localStorage';
import { setupMatchMediaMock } from '../mocks/matchMedia';
import { setupIndexedDBMock } from '../mocks/indexedDB';

setupLocalStorageMock();
setupMatchMediaMock();
setupIndexedDBMock();

// Polyfill globalThis.navigator for Node 20. Node 21+ exposes it natively;
// CI runs on Node 20 (per .github/workflows/ci.yml), where any code that
// reads `navigator.*` directly (without a typeof guard) throws
// ReferenceError. Tests that stub navigator fields need this shim.
//
// Shape covers the fields read by packages/core/deviceDetection (userAgent,
// maxTouchPoints, hardwareConcurrency) and the offline-behavior tests in
// packages/replication (onLine). Defaults are deliberately desktop-shaped
// so deviceDetection's mobile/touch heuristics return false unless a test
// overrides specific fields.
if (typeof globalThis.navigator === 'undefined') {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      onLine: true,
      userAgent: 'node-test',
      maxTouchPoints: 0,
      hardwareConcurrency: 4,
      language: 'en-US',
      platform: 'node',
    },
    writable: true,
    configurable: true,
  });
}

// Mock window.addEventListener and window.dispatchEvent for Node.js environment
if (typeof window === 'undefined') {
  const eventListeners: Record<string, Set<EventListener>> = {};

  Object.defineProperty(globalThis, 'window', {
    value: {
      localStorage: globalThis.localStorage,
      addEventListener: (type: string, listener: EventListener) => {
        if (!eventListeners[type]) {
          eventListeners[type] = new Set();
        }
        eventListeners[type].add(listener);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        if (eventListeners[type]) {
          eventListeners[type].delete(listener);
        }
      },
      dispatchEvent: (event: Event) => {
        if (eventListeners[event.type]) {
          eventListeners[event.type].forEach(listener => {
            listener(event);
          });
        }
        return true;
      },
    },
    writable: true,
    configurable: true,
  });
}
