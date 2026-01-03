/**
 * usePushNotificationAutoSwitch Hook
 *
 * Automatically switches push notification subscription when user opens a different show.
 * Monitors license_key and favorite dogs (localStorage) changes.
 *
 * Usage in App.tsx or top-level component:
 *   usePushNotificationAutoSwitch(showContext?.licenseKey);
 */

import { useEffect, useRef } from 'react';
import PushNotificationService from '@/services/pushNotificationService';
import { logger } from '@/utils/logger';

export function usePushNotificationAutoSwitch(licenseKey: string | undefined) {
  const previousLicenseKey = useRef<string | undefined>(undefined);
  const switchInProgress = useRef(false);
  const switchDebounce = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleShowSwitch = async () => {
      // Skip if no license key
      if (!licenseKey) {
        return;
      }

      // Skip if license key hasn't changed
      if (licenseKey === previousLicenseKey.current) {
        return;
      }

      // Check if user is subscribed to push notifications
      const isSubscribed = await PushNotificationService.isSubscribed();

      if (!isSubscribed) {
return;
      }

      // Prevent concurrent switches (mutex lock)
      if (switchInProgress.current) {
return;
      }

      switchInProgress.current = true;

      try {
        // Update the ref
        previousLicenseKey.current = licenseKey;

        // Get favorite dogs for this show from localStorage
        const favoritesKey = `dog_favorites_${licenseKey}`;
        const savedFavorites = localStorage.getItem(favoritesKey);
        let favoriteArmbands: number[] = [];

        if (savedFavorites) {
          try {
            const parsed = JSON.parse(savedFavorites);
            if (Array.isArray(parsed) && parsed.every(id => typeof id === 'number')) {
              favoriteArmbands = parsed;
            }
          } catch (error) {
            logger.error('[Push Auto-Switch] Error parsing favorites:', error);
          }
        }

        // Switch subscription to new show
const success = await PushNotificationService.switchToShow(licenseKey, favoriteArmbands);

        if (!success) {
          logger.error('[Push Auto-Switch] Failed to switch to show:', licenseKey);
        }
      } finally {
        // Always release the lock
        switchInProgress.current = false;
      }
    };

    // Clear any pending debounce
    if (switchDebounce.current) {
      clearTimeout(switchDebounce.current);
    }

    // Debounce the switch (300ms delay to allow for rapid changes)
    switchDebounce.current = setTimeout(() => {
      handleShowSwitch();
    }, 300);

    // Cleanup on unmount
    return () => {
      if (switchDebounce.current) {
        clearTimeout(switchDebounce.current);
      }
    };
  }, [licenseKey]);

  // Note: Favorite changes are handled directly in toggleFavorite() in Home.tsx
  // The storage event listener below only catches changes from OTHER tabs/windows
  useEffect(() => {
    if (!licenseKey) {
      return;
    }

    const handleFavoriteChange = async () => {
      const isSubscribed = await PushNotificationService.isSubscribed();

      if (!isSubscribed) {
        return;
      }

      // Get updated favorites
      const favoritesKey = `dog_favorites_${licenseKey}`;
      const savedFavorites = localStorage.getItem(favoritesKey);
      let favoriteArmbands: number[] = [];

      if (savedFavorites) {
        try {
          const parsed = JSON.parse(savedFavorites);
          if (Array.isArray(parsed)) {
            favoriteArmbands = parsed;
          }
        } catch (error) {
          logger.error('[Push Auto-Switch] Error parsing favorites:', error);
        }
      }

      // Update favorites for current show
      await PushNotificationService.updateFavoriteArmbands(favoriteArmbands);
    };

    // Listen for localStorage changes from OTHER tabs/windows
    // (Changes in current tab are handled directly in toggleFavorite)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === `dog_favorites_${licenseKey}`) {
handleFavoriteChange();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [licenseKey]);
}

export default usePushNotificationAutoSwitch;
