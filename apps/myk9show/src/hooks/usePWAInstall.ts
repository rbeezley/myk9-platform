/**
 * PWA Installation Hook
 *
 * Detects if the app is installed as a PWA and provides methods to prompt installation.
 * Critical for push notifications to work reliably, especially on iOS.
 */

import { useState, useEffect, useCallback } from 'react';

interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface UsePWAInstallReturn {
  /** Whether the app is currently running as an installed PWA (standalone mode) */
  isInstalled: boolean;
  /** Whether the user previously installed the app (persisted to localStorage) */
  wasInstalledBefore: boolean;
  /** Whether the browser supports PWA installation and has a prompt available */
  canInstall: boolean;
  /** Whether the user previously dismissed the install prompt */
  isDismissed: boolean;
  /** Whether the user is on iOS Safari (needs manual install instructions) */
  isIOSSafari: boolean;
  /** Trigger the browser's native install prompt */
  promptInstall: () => Promise<boolean>;
  /** Mark the install prompt as dismissed (won't show again for 7 days) */
  dismissInstallPrompt: () => void;
  /** Get platform-specific installation instructions */
  getInstallInstructions: () => string;
}

const DISMISS_KEY = 'pwa_install_dismissed';
const INSTALLED_KEY = 'pwa_installed';
const DISMISS_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

function detectIOSSafari(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
  return isIOS && isSafari;
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [isInstalled, setIsInstalled] = useState(false);
  const [wasInstalledBefore, setWasInstalledBefore] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isIOSSafari] = useState(detectIOSSafari);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as NavigatorStandalone).standalone === true ||
      document.referrer.includes('android-app://');

    setIsInstalled(isStandalone);

    try {
      const installedData = localStorage.getItem(INSTALLED_KEY);
      if (installedData || isStandalone) {
        setWasInstalledBefore(true);
        if (isStandalone && !installedData) {
          localStorage.setItem(INSTALLED_KEY, JSON.stringify({ timestamp: Date.now() }));
        }
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    try {
      const dismissedData = localStorage.getItem(DISMISS_KEY);
      if (dismissedData) {
        const { timestamp } = JSON.parse(dismissedData);
        if (Date.now() - timestamp < DISMISS_DURATION) {
          setIsDismissed(true);
        } else {
          localStorage.removeItem(DISMISS_KEY);
        }
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const handler = () => {
      setIsInstalled(true);
      setWasInstalledBefore(true);
      setInstallPrompt(null);
      try {
        localStorage.setItem(INSTALLED_KEY, JSON.stringify({ timestamp: Date.now() }));
        localStorage.removeItem(DISMISS_KEY);
      } catch {
        // localStorage unavailable
      }
    };
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  const dismissInstallPrompt = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ timestamp: Date.now() }));
      setIsDismissed(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!installPrompt) return false;
    try {
      await installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setInstallPrompt(null);
        return true;
      }
      dismissInstallPrompt();
      return false;
    } catch {
      return false;
    }
  }, [installPrompt, dismissInstallPrompt]);

  const getInstallInstructions = useCallback((): string => {
    const ua = navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) {
      return 'Tap the Share button, then tap "Add to Home Screen"';
    } else if (/android/.test(ua)) {
      return 'Tap the menu icon and select "Add to Home Screen" or "Install App"';
    }
    return 'Click the install icon in the address bar';
  }, []);

  return {
    isInstalled,
    wasInstalledBefore,
    canInstall: !!installPrompt && !isInstalled,
    isDismissed,
    isIOSSafari,
    promptInstall,
    dismissInstallPrompt,
    getInstallInstructions,
  };
}
