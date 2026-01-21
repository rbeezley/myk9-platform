/**
 * PWA Install Prompt Component
 *
 * Prompts users to install the app as a PWA for better notification support.
 * Shows contextual messages based on whether they have favorited dogs.
 */

import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, X, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tailwind styles for card mode */
const cardStyles = {
  container: cn(
    "relative p-6 bg-[var(--card)] rounded-2xl",
    "border border-[var(--border)] shadow-lg",
    "max-w-sm mx-auto"
  ),
  closeBtn: cn(
    "absolute top-4 right-4 p-2 rounded-lg",
    "text-[var(--muted-foreground)]",
    "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
    "transition-colors duration-150"
  ),
  icon: cn(
    "flex items-center justify-center w-16 h-16 mx-auto mb-4",
    "bg-[var(--primary)]/10 rounded-2xl text-[var(--primary)]"
  ),
  title: "text-xl font-bold text-[var(--foreground)] text-center mb-2",
  message: "text-sm text-[var(--muted-foreground)] text-center mb-6",
  benefits: "space-y-3 mb-6",
  benefitItem: cn(
    "flex items-center gap-3 text-sm text-[var(--foreground)]",
    "p-3 bg-[var(--muted)]/50 rounded-lg"
  ),
  benefitIcon: "text-[var(--primary)] shrink-0",
  actions: "space-y-3",
  btnPrimary: cn(
    "w-full flex items-center justify-center gap-2",
    "px-4 py-3 rounded-xl",
    "bg-[var(--primary)] text-white font-semibold",
    "hover:opacity-90 transition-opacity"
  ),
  btnSecondary: cn(
    "w-full flex items-center justify-center gap-2",
    "px-4 py-3 rounded-xl",
    "bg-[var(--muted)] text-[var(--muted-foreground)] font-medium",
    "hover:bg-[var(--border)] transition-colors"
  ),
  instructions: "text-xs text-[var(--muted-foreground)] text-center mt-4",
};

/** Tailwind styles for banner mode */
const bannerStyles = {
  container: cn(
    "flex items-center justify-between gap-4 p-4",
    "bg-[var(--card)] border border-[var(--border)]",
    "rounded-xl shadow-md"
  ),
  content: "flex items-center gap-3 flex-1 min-w-0",
  icon: cn(
    "flex items-center justify-center w-12 h-12 shrink-0",
    "bg-[var(--primary)]/10 rounded-xl text-[var(--primary)]"
  ),
  text: "min-w-0",
  textTitle: "font-semibold text-[var(--foreground)]",
  textMessage: "text-sm text-[var(--muted-foreground)] truncate",
  actions: "flex items-center gap-2 shrink-0",
  btnPrimary: cn(
    "px-4 py-2 rounded-lg",
    "bg-[var(--primary)] text-white font-medium text-sm",
    "hover:opacity-90 transition-opacity"
  ),
  btnSecondary: cn(
    "p-2 rounded-lg",
    "text-[var(--muted-foreground)]",
    "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
    "transition-colors duration-150"
  ),
};

/** Tailwind styles for iOS instructions */
const iosStyles = {
  container: cn(
    "p-6 bg-[var(--card)] rounded-2xl",
    "border border-[var(--border)] shadow-sm",
    "max-w-sm mx-auto text-center"
  ),
  icon: "text-4xl mb-4",
  title: "text-lg font-bold text-[var(--foreground)] mb-3",
  description: "text-sm text-[var(--muted-foreground)] mb-4",
  steps: cn(
    "text-left text-sm text-[var(--foreground)]",
    "space-y-3 mb-4"
  ),
  stepItem: "flex items-start gap-2",
  shareIcon: "inline-block px-1.5 py-0.5 bg-[var(--muted)] rounded text-xs font-mono",
  hint: "text-xs text-[var(--muted-foreground)] italic",
};

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
      <div className={cardStyles.container}>
        <button
          className={cardStyles.closeBtn}
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
        >
          <X size={20} className="shrink-0" />
        </button>

        <div className={cardStyles.icon}>
          <Download size={48} className="shrink-0" />
        </div>

        <h3 className={cardStyles.title}>Install myK9Q</h3>

        <p className={cardStyles.message}>{getMessage()}</p>

        <ul className={cardStyles.benefits}>
          {showNotificationBenefit && (
            <li className={cardStyles.benefitItem}>
              <Bell size={16} className={cardStyles.benefitIcon} />
              <span>Get notified when your dogs are up</span>
            </li>
          )}
          <li className={cardStyles.benefitItem}>
            <Download size={16} className={cardStyles.benefitIcon} />
            <span>Works offline</span>
          </li>
          <li className={cardStyles.benefitItem}>
            <Download size={16} className={cardStyles.benefitIcon} />
            <span>Faster loading</span>
          </li>
          <li className={cardStyles.benefitItem}>
            <Download size={16} className={cardStyles.benefitIcon} />
            <span>Home screen access</span>
          </li>
        </ul>

        <div className={cardStyles.actions}>
          <button
            className={cardStyles.btnPrimary}
            onClick={handleInstall}
          >
            <Download size={20} className="shrink-0" />
            Install App
          </button>
          <button
            className={cardStyles.btnSecondary}
            onClick={handleDismiss}
          >
            Maybe Later
          </button>
        </div>

        <p className={cardStyles.instructions}>
          {getInstallInstructions()}
        </p>
      </div>
    );
  }

  // Banner mode (default)
  return (
    <div className={bannerStyles.container}>
      <div className={bannerStyles.content}>
        <div className={bannerStyles.icon}>
          <Download size={24} className="shrink-0" />
        </div>
        <div className={bannerStyles.text}>
          <strong className={bannerStyles.textTitle}>Install myK9Q</strong>
          <span className={bannerStyles.textMessage}>{getMessage()}</span>
        </div>
      </div>

      <div className={bannerStyles.actions}>
        <button
          className={bannerStyles.btnPrimary}
          onClick={handleInstall}
        >
          Install
        </button>
        <button
          className={bannerStyles.btnSecondary}
          onClick={handleDismiss}
          aria-label="Dismiss"
        >
          <X size={18} className="shrink-0" />
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
    <div className={iosStyles.container}>
      <div className={iosStyles.icon}>📱</div>
      <h3 className={iosStyles.title}>Install myK9Q</h3>
      <p className={iosStyles.description}>
        To receive notifications when your dogs are up, install this app to your home screen:
      </p>
      <ol className={iosStyles.steps}>
        <li className={iosStyles.stepItem}>
          <span>1.</span>
          <span>Tap the <strong>Share</strong> button <span className={iosStyles.shareIcon}>⎙</span></span>
        </li>
        <li className={iosStyles.stepItem}>
          <span>2.</span>
          <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
        </li>
        <li className={iosStyles.stepItem}>
          <span>3.</span>
          <span>Tap <strong>"Add"</strong> in the top right</span>
        </li>
      </ol>
      <p className={iosStyles.hint}>
        The app icon will appear on your home screen like any other app!
      </p>
    </div>
  );
}
