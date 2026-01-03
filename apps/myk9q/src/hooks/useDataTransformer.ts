import { useRef, useCallback } from 'react';
import { logger } from '@/utils/logger';

/**
 * Message sent to the Web Worker
 */
interface WorkerMessage<T = unknown> {
  type: 'TRANSFORM_CLASSES' | 'TRANSFORM_ENTRIES' | 'PROCESS_DATA';
  payload: T;
}

/**
 * Response received from the Web Worker
 */
interface WorkerResponse<T = unknown> {
  type: string;
  result: T;
  error?: string;
}

/**
 * Payload for PROCESS_DATA message type
 */
interface ProcessDataPayload {
  classes: unknown[];
  entries: unknown[];
}

/**
 * Hook to use Web Worker for data transformations
 * Offloads heavy CPU work from main thread
 */
export function useDataTransformer() {
  const workerRef = useRef<Worker | null>(null);

  // Initialize worker lazily
  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL('../workers/dataTransformer.worker.ts', import.meta.url),
          { type: 'module' }
        );
      } catch (error) {
        logger.error('Failed to initialize Web Worker:', error);
        return null;
      }
    }
    return workerRef.current;
  }, []);

  const transformClasses = useCallback(<T = unknown>(rawClasses: T[]): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker();
      if (!worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const handleMessage = (event: MessageEvent<WorkerResponse<T[]>>) => {
        if (event.data.type === 'TRANSFORM_CLASSES') {
          worker.removeEventListener('message', handleMessage);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      worker.addEventListener('message', handleMessage);
      const message: WorkerMessage<T[]> = {
        type: 'TRANSFORM_CLASSES',
        payload: rawClasses
      };
      worker.postMessage(message);
    });
  }, [getWorker]);

  const transformEntries = useCallback(<T = unknown>(rawEntries: T[]): Promise<T[]> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker();
      if (!worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const handleMessage = (event: MessageEvent<WorkerResponse<T[]>>) => {
        if (event.data.type === 'TRANSFORM_ENTRIES') {
          worker.removeEventListener('message', handleMessage);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      worker.addEventListener('message', handleMessage);
      const message: WorkerMessage<T[]> = {
        type: 'TRANSFORM_ENTRIES',
        payload: rawEntries
      };
      worker.postMessage(message);
    });
  }, [getWorker]);

  const processData = useCallback(<T = unknown>(classes: unknown[], entries: unknown[]): Promise<T> => {
    return new Promise((resolve, reject) => {
      const worker = getWorker();
      if (!worker) {
        reject(new Error('Worker not available'));
        return;
      }

      const handleMessage = (event: MessageEvent<WorkerResponse<T>>) => {
        if (event.data.type === 'PROCESS_DATA') {
          worker.removeEventListener('message', handleMessage);
          if (event.data.error) {
            reject(new Error(event.data.error));
          } else {
            resolve(event.data.result);
          }
        }
      };

      worker.addEventListener('message', handleMessage);
      const message: WorkerMessage<ProcessDataPayload> = {
        type: 'PROCESS_DATA',
        payload: { classes, entries }
      };
      worker.postMessage(message);
    });
  }, [getWorker]);

  // Cleanup worker on unmount
  const cleanup = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
  }, []);

  return {
    transformClasses,
    transformEntries,
    processData,
    cleanup
  };
}
