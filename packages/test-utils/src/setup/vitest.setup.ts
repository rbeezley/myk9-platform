import { setupLocalStorageMock } from '../mocks/localStorage';
import { setupMatchMediaMock } from '../mocks/matchMedia';
import { setupIndexedDBMock } from '../mocks/indexedDB';

setupLocalStorageMock();
setupMatchMediaMock();
setupIndexedDBMock();

// Mock window.addEventListener and window.dispatchEvent for Node.js environment
if (typeof window === 'undefined') {
  const eventListeners: Record<string, Set<EventListener>> = {};

  Object.defineProperty(globalThis, 'window', {
    value: {
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
