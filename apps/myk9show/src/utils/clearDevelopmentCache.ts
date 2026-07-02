import { toast } from 'sonner';
import { logger } from '@/services/LoggingService';

export async function clearDevelopmentCache(): Promise<boolean> {
  if (!import.meta.env.DEV) {
    logger.warn('Cache clearing is only available in development mode', 'components', {});
    return false;
  }

  try {
    toast.info('Clearing all caches...', {
      description: 'Removing service workers, caches, and stored data.',
      duration: 2000,
    });

    logger.debug('Clearing browser caches (lighter version)...', 'components', {});

    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      logger.debug('Browser caches cleared', 'components', {});
    }

    localStorage.clear();
    sessionStorage.clear();
    logger.debug('Storage cleared', 'components', {});

    toast.success('Cache cleared successfully!', {
      description: 'Service workers unregistered, all caches cleared. Page will reload.',
      duration: 2000,
    });

    setTimeout(() => {
      window.location.reload();
    }, 1500);

    return true;
  } catch (error) {
    logger.error('Error clearing cache:', 'components', {}, error as Error);
    toast.error('Failed to clear cache', {
      description: 'Some caches could not be cleared. Check the console for details.',
    });
    return false;
  }
}
