/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// =============================================
// Background Sync API Type Declarations
// =============================================
// Not included in standard TypeScript libs, added for service worker support
// https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API

interface SyncManager {
  getTags(): Promise<string[]>;
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistration {
  readonly sync: SyncManager;
}

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface ServiceWorkerGlobalScopeEventMap {
  sync: SyncEvent;
}

// Extend Window to include SyncManager check
interface Window {
  SyncManager?: typeof SyncManager;
}