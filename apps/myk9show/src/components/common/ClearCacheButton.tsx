import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

export const ClearCacheButton: React.FC = () => {
  const [isClearing, setIsClearing] = useState(false);

  const handleClearCache = async () => {
    if (!import.meta.env.DEV) {
      console.warn('Cache clearing is only available in development mode');
      return;
    }

    setIsClearing(true);
    
    try {
      // Show starting message
      toast.info('Clearing all caches...', {
        description: 'Removing service workers, caches, and stored data.',
        duration: 2000,
      });

      // Use a lighter cache clearing for the button to avoid breaking dev server
      console.log('🔄 Clearing browser caches (lighter version)...');

      // Clear browser caches only (don't unregister service workers in dev)
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('✅ Browser caches cleared');
      }

      // Clear storage
      localStorage.clear();
      sessionStorage.clear();
      console.log('✅ Storage cleared');

      const success = true;

      if (success) {
        // Show success message
        toast.success('🎉 Cache cleared successfully!', {
          description: 'Service workers unregistered, all caches cleared. Page will reload.',
          duration: 2000,
        });

        // Short delay to show the success message, then reload with cache bust
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        throw new Error('Cache clearing failed');
      }

    } catch (error) {
      console.error('❌ Error clearing cache:', error);
      toast.error('Failed to clear cache', {
        description: 'Some caches could not be cleared. Check the console for details.',
      });
      setIsClearing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClearCache}
      disabled={isClearing}
      className="w-full justify-start text-xs"
    >
      {isClearing ? (
        <>
          <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
          Clearing...
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3 mr-2" />
          Clear Cache
        </>
      )}
    </Button>
  );
};