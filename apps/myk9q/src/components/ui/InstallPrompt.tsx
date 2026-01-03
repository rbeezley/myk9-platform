/**
 * PWA Install Prompt Component
 *
 * Prompts users to install the app as a PWA for better notification support.
 * Shows contextual messages based on whether they have favorited dogs.
 */

import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, X, Bell } from 'lucide-react';
import './shared-ui.css';

export interface InstallPromptProps {
  /**
   * Show in compact banner mode (default) or full card mode
   */
  mode?: 'banner' | 'card';

  /**
   * Whether to show notification-specific messaging
   */
  showNotificationBenefit?: boolean;

  /**
   * Number of favorited dogs (for personalized messaging)
   */
  favoritedCount?: number;

  /**
   * Custom message to show instead of default
   */
  customMessage?: string;

  /**
   * Callback when user dismisses the prompt
   */
  onDismiss?: () => void;
}

export function InstallPrompt({
  mode = 'banner',
  showNotificationBenefit = true,
  favoritedCount = 0,
  customMessage,
  onDismiss
}: InstallPromptProps) {
  const {
    isInstalled,
    canInstall,
    isDismissed,
    promptInstall,
    dismissInstallPrompt,
    getInstallInstructions
  } = usePWAInstall();

  // Don't show if already installed or dismissed
  if (isInstalled || isDismissed) {
    return null;
  }

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall();
    } else {
      // Detect browser type for better instructions
      const userAgent = navigator.userAgent.toLowerCase();
      let detailedInstructions = getInstallInstructions();

      if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
        detailedInstructions = '1. Click the three dots menu (⋮) in the top-right corner\n2. Select "Save and Share" → "Install app"\n   OR look for an install icon (⊕) in the address bar\n3. Click "Install" in the popup\n\nOnce installed, favorite your dogs (❤️) to receive notifications when they\'re up next!';
      } else if (userAgent.includes('edg')) {
        detailedInstructions = '1. Click the three dots menu (...) in the top-right corner\n2. Select "Apps" → "Install myK9Q"\n   OR look for an install icon in the address bar\n3. Click "Install" in the popup\n\nOnce installed, favorite your dogs (❤️) to receive notifications when they\'re up next!';
      }

      alert(`📱 Install myK9Q for Notifications\n\n${detailedInstructions}`);
    }
  };

  const handleDismiss = () => {
    dismissInstallPrompt();
    onDismiss?.();
  };

  // Generate message based on context
  const getMessage = () => {
    if (customMessage) {
      return customMessage;
    }

    if (showNotificationBenefit && favoritedCount > 0) {
      return `Get notified when ${favoritedCount === 1 ? 'your dog is' : 'your dogs are'} up next!`;
    }

    if (showNotificationBenefit) {
      return 'Install the app to receive notifications when your dogs are up next';
    }

    return 'Install myK9Q for a better experience';
  };

  if (mode === 'card') {
    return (
      <div className="install-prompt-card">
        <button
          className="install-prompt-close"
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
        >
          <X size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
        </button>

        <div className="install-prompt-icon">
          <Download size={48}  style={{ width: '48px', height: '48px', flexShrink: 0 }} />
        </div>

        <h3 className="install-prompt-title">Install myK9Q</h3>

        <p className="install-prompt-message">{getMessage()}</p>

        <ul className="install-prompt-benefits">
          {showNotificationBenefit && (
            <li>
              <Bell size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
              <span>Get notified when your dogs are up</span>
            </li>
          )}
          <li>
            <Download size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>Works offline</span>
          </li>
          <li>
            <Download size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>Faster loading</span>
          </li>
          <li>
            <Download size={16}  style={{ width: '16px', height: '16px', flexShrink: 0 }} />
            <span>Home screen access</span>
          </li>
        </ul>

        <div className="install-prompt-actions">
          <button
            className="install-prompt-button primary"
            onClick={handleInstall}
          >
            <Download size={20}  style={{ width: '20px', height: '20px', flexShrink: 0 }} />
            Install App
          </button>
          <button
            className="install-prompt-button secondary"
            onClick={handleDismiss}
          >
            Maybe Later
          </button>
        </div>

        <p className="install-prompt-instructions">
          {getInstallInstructions()}
        </p>
      </div>
    );
  }

  // Banner mode (default)
  return (
    <div className="install-prompt-banner">
      <div className="install-prompt-banner-content">
        <div className="install-prompt-banner-icon">
          <Download size={24}  style={{ width: '24px', height: '24px', flexShrink: 0 }} />
        </div>
        <div className="install-prompt-banner-text">
          <strong>Install myK9Q</strong>
          <span>{getMessage()}</span>
        </div>
      </div>

      <div className="install-prompt-banner-actions">
        <button
          className="install-prompt-banner-button primary"
          onClick={handleInstall}
        >
          Install
        </button>
        <button
          className="install-prompt-banner-button secondary"
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X size={18}  style={{ width: '18px', height: '18px', flexShrink: 0 }} />
        </button>
      </div>
    </div>
  );
}

/**
 * iOS-specific install instructions component
 * Shows when app can't be installed via prompt (iOS Safari)
 */
export function IOSInstallInstructions() {
  const { isInstalled } = usePWAInstall();

  if (isInstalled) {
    return null;
  }

  // Detect iOS
  const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());

  if (!isIOS) {
    return null;
  }

  return (
    <div className="ios-install-instructions">
      <div className="ios-install-icon">📱</div>
      <h3>Install myK9Q</h3>
      <p>
        To receive notifications when your dogs are up, install this app to your home screen:
      </p>
      <ol>
        <li>
          Tap the <strong>Share</strong> button <span className="ios-share-icon">⎙</span>
        </li>
        <li>
          Scroll down and tap <strong>"Add to Home Screen"</strong>
        </li>
        <li>
          Tap <strong>"Add"</strong> in the top right
        </li>
      </ol>
      <p className="ios-install-hint">
        The app icon will appear on your home screen like any other app!
      </p>
    </div>
  );
}
