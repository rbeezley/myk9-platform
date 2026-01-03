/**
 * PWAInstallBanner Component
 *
 * Smart banner that appears at the top of the app when:
 * - App is not installed as PWA
 * - Browser supports PWA installation (Chrome/Edge) OR user is on iOS Safari
 *
 * Disappears automatically when app is installed.
 * Sets CSS variable for page content padding.
 */

import { useState, useEffect, useRef } from 'react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, X, Share } from 'lucide-react';
import './PWAInstallBanner.css';

// Detect iOS Safari
const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isSafari = /safari/.test(navigator.userAgent.toLowerCase()) && !/chrome|crios|fxios/.test(navigator.userAgent.toLowerCase());
const isIOSSafari = isIOS && isSafari;

export function PWAInstallBanner() {
  const { isInstalled, canInstall, promptInstall } = usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  // Check if banner was previously dismissed using lazy initializer
  const [isDismissed, setIsDismissed] = useState(() => {
    const dismissed = localStorage.getItem('pwa_banner_dismissed');
    return dismissed === 'true';
  });

  // Determine if we should show the banner
  // Show for: Chrome/Edge (canInstall) OR iOS Safari (isIOSSafari)
  const shouldShow = !isInstalled && !isDismissed && (canInstall || isIOSSafari);

  // Set CSS variable for banner height when visible
  useEffect(() => {
    if (shouldShow && bannerRef.current) {
      const updateHeight = () => {
        const height = bannerRef.current?.offsetHeight || 0;
        document.documentElement.style.setProperty('--pwa-banner-height', `${height}px`);
      };

      // Initial measurement
      updateHeight();

      // Re-measure on resize
      window.addEventListener('resize', updateHeight);
      return () => {
        window.removeEventListener('resize', updateHeight);
        document.documentElement.style.setProperty('--pwa-banner-height', '0px');
      };
    } else {
      document.documentElement.style.setProperty('--pwa-banner-height', '0px');
    }
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa_banner_dismissed', 'true');
  };

  const handleInstall = async () => {
    if (canInstall) {
      // Chrome/Edge - use native prompt
      const success = await promptInstall();
      if (success) {
        localStorage.removeItem('pwa_banner_dismissed');
      }
    } else if (isIOSSafari) {
      // iOS Safari - show instructions
      setShowIOSInstructions(true);
    }
  };

  const handleCloseInstructions = () => {
    setShowIOSInstructions(false);
  };

  return (
    <>
      <div className="pwa-install-banner" ref={bannerRef}>
        <div className="pwa-banner-content">
          {isIOSSafari ? (
            <Share size={20} className="pwa-banner-icon" />
          ) : (
            <Download size={20} className="pwa-banner-icon" />
          )}
          <div className="pwa-banner-text">
            <strong>Install myK9Q</strong>
            <span>{isIOSSafari ? 'Get notifications for your dogs' : 'Quick access from your home screen'}</span>
          </div>
          <button
            className="pwa-banner-install-btn"
            onClick={handleInstall}
          >
            {isIOSSafari ? 'Show me' : 'Install'}
          </button>
          <button
            className="pwa-banner-close-btn"
            onClick={handleDismiss}
            aria-label="Dismiss banner"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSInstructions && (
        <div className="ios-instructions-overlay" onClick={handleCloseInstructions}>
          <div className="ios-instructions-modal" onClick={e => e.stopPropagation()}>
            <button
              className="ios-instructions-close"
              onClick={handleCloseInstructions}
              aria-label="Close"
            >
              <X size={24} />
            </button>

            <div className="ios-instructions-header">
              <Download size={40} />
              <h2>Install myK9Q</h2>
            </div>

            <p className="ios-instructions-subtitle">
              Add to your home screen to receive notifications when your dogs are up!
            </p>

            <ol className="ios-instructions-steps">
              <li>
                <span className="step-number">1</span>
                <span className="step-text">
                  Tap the <strong>Share</strong> button <Share size={16} style={{ verticalAlign: 'middle' }} /> at the bottom of Safari
                </span>
              </li>
              <li>
                <span className="step-number">2</span>
                <span className="step-text">
                  Scroll down and tap <strong>"Add to Home Screen"</strong>
                </span>
              </li>
              <li>
                <span className="step-number">3</span>
                <span className="step-text">
                  Tap <strong>"Add"</strong> in the top right corner
                </span>
              </li>
            </ol>

            <p className="ios-instructions-hint">
              Then open myK9Q from your home screen and favorite your dogs to get notified!
            </p>

            <button
              className="ios-instructions-done-btn"
              onClick={handleCloseInstructions}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
