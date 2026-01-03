/**
 * Browser-compatible EventEmitter implementation
 * Provides similar API to Node.js EventEmitter but works in the browser
 */

type EventListener<T = unknown> = (data: T) => void;

export class EventEmitter<TEvents = Record<string, unknown>> {
  private events: Map<string, EventListener[]> = new Map();

  on<K extends keyof TEvents>(event: K | string, listener: EventListener<TEvents[K]>): this {
    if (!this.events.has(event as string)) {
      this.events.set(event as string, []);
    }
    this.events.get(event as string)!.push(listener as EventListener);
    return this;
  }

  once<K extends keyof TEvents>(event: K | string, listener: EventListener<TEvents[K]>): this {
    const onceWrapper = (data: TEvents[K]) => {
      this.off(event, onceWrapper);
      listener(data);
    };
    return this.on(event, onceWrapper);
  }

  off<K extends keyof TEvents>(event: K | string, listener?: EventListener<TEvents[K]>): this {
    const listeners = this.events.get(event as string);
    if (listeners) {
      if (listener) {
        const index = listeners.indexOf(listener as EventListener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          this.events.delete(event as string);
        }
      } else {
        // If no listener specified, remove all listeners for this event
        this.events.delete(event as string);
      }
    }
    return this;
  }

  emit<K extends keyof TEvents>(event: K | string, data: TEvents[K]): boolean {
    const listeners = this.events.get(event as string);
    if (!listeners || listeners.length === 0) {
      return false;
    }
    
    // Create a copy to avoid issues if listeners modify the array
    const listenersCopy = [...listeners];
    listenersCopy.forEach(listener => {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for "${String(event)}":`, error);
      }
    });
    return true;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  listenerCount(event: string): number {
    const listeners = this.events.get(event);
    return listeners ? listeners.length : 0;
  }

  eventNames(): string[] {
    return Array.from(this.events.keys());
  }

  // Aliases for compatibility
  addListener<K extends keyof TEvents>(event: K | string, listener: EventListener<TEvents[K]>): this {
    return this.on(event, listener);
  }

  removeListener<K extends keyof TEvents>(event: K | string, listener?: EventListener<TEvents[K]>): this {
    return this.off(event, listener);
  }
}

// Export singleton instance for use throughout the app
export const eventEmitter = new EventEmitter();