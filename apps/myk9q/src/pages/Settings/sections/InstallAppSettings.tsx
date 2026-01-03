/**
 * Install App Settings Section
 *
 * Allows users to install the PWA from Settings if they
 * dismissed the initial banner or want to see instructions again.
 */

import React, { useState } from 'react';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { Download, CheckCircle, Share, X } from 'lucide-react';

// Detect browser/platform
const userAgent = navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(userAgent);
const isSafari = /safari/.test(userAgent) && !/chrome|crios|fxios/.test(userAgent);
const isIOSSafari = isIOS && isSafari;
const isFirefox = /firefox/.test(userAgent);
const isChrome = /chrome/.test(userAgent) && !/edg/.test(userAgent);
const isEdge = /edg/.test(userAgent);
const isAndroid = /android/.test(userAgent);

// Get browser-specific install instructions
function getBrowserInstructions(): { title: string; steps: string[] } {
  if (isIOSSafari) {
    return {
      title: 'Install on iPhone/iPad',
      steps: [
        'Tap the Share button at the bottom of Safari',
        'Scroll down and tap "Add to Home Screen"',
        'Tap "Add" in the top right corner'
      ]
    };
  }

  if (isAndroid && isChrome) {
    return {
      title: 'Install on Android',
      steps: [
        'Tap the three-dot menu (⋮) in the top right',
        'Tap "Add to Home screen" or "Install app"',
        'Tap "Add" or "Install" to confirm'
      ]
    };
  }

  if (isFirefox) {
    return {
      title: 'Install from Firefox',
      steps: [
        'Tap the three-line menu (☰) in the top right',
        'Tap "Install" if available, or use Chrome/Edge for best PWA support',
        'Firefox has limited PWA support - Chrome or Edge recommended'
      ]
    };
  }

  if (isEdge) {
    return {
      title: 'Install from Edge',
      steps: [
        'Click the three-dot menu (...) in the top right',
        'Click "Apps" → "Install myK9Q"',
        'Or look for the install icon (⊕) in the address bar'
      ]
    };
  }

  if (isChrome) {
    return {
      title: 'Install from Chrome',
      steps: [
        'Look for the install icon (⊕) in the address bar and click it',
        'Or click Chrome\'s menu (⋮) → "Cast, save, and share"',
        'Select "Install page as app" or "Create shortcut..." (if you see "Open in myK9Q" it\'s already installed!)'
      ]
    };
  }

  // Generic fallback
  return {
    title: 'Install myK9Q',
    steps: [
      'Look for an "Install" option in your browser menu',
      'Or look for an install icon in the address bar',
      'For best experience, use Chrome, Edge, or Safari'
    ]
  };
}

export const InstallAppSettings: React.FC = () => {
  const { isInstalled, wasInstalledBefore, canInstall, promptInstall, clearDismissed } = usePWAInstall();
  const [showInstructions, setShowInstructions] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstall = async () => {
    if (canInstall) {
      // Native install prompt available (Chrome/Edge captured the event)
      setIsInstalling(true);
      try {
        const success = await promptInstall();
        if (success) {
          clearDismissed();
        }
      } finally {
        setIsInstalling(false);
      }
    } else {
      // No native prompt - show browser-specific instructions
      setShowInstructions(true);
    }
  };

  // Currently running as installed PWA
  if (isInstalled) {
    return (
      <SettingsSection title="Install App">
        <SettingsRow
          icon={<CheckCircle size={20} style={{ color: 'var(--token-success)' }} />}
          label="App Installed"
          description="You're using myK9Q from your home screen"
          action={
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--token-success)'
            }}>
              Active
            </span>
          }
        />
      </SettingsSection>
    );
  }

  // Previously installed but viewing in browser
  if (wasInstalledBefore) {
    return (
      <SettingsSection title="Install App">
        <SettingsRow
          icon={<CheckCircle size={20} style={{ color: 'var(--token-info, #6366f1)' }} />}
          label="Previously Installed"
          description="Open myK9Q from your home screen for the best experience"
          action={
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--token-info, #6366f1)'
            }}>
              Installed
            </span>
          }
        />
        <div style={{
          padding: '0 20px 16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6
        }}>
          <div style={{
            padding: '12px',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '8px'
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>Tip:</strong> You're viewing myK9Q in a browser.
            For push notifications and offline access, open the app from your home screen instead.
          </div>
        </div>
      </SettingsSection>
    );
  }

  // Get the action button - always clickable
  const getActionButton = () => {
    if (canInstall) {
      // Native install available
      return (
        <button
          onClick={handleInstall}
          disabled={isInstalling}
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-primary)',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: isInstalling ? 'wait' : 'pointer',
            opacity: isInstalling ? 0.7 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <Download size={16} />
          {isInstalling ? 'Installing...' : 'Install'}
        </button>
      );
    }

    // No native install - show instructions button
    return (
      <button
        onClick={handleInstall}
        style={{
          padding: '8px 16px',
          borderRadius: '8px',
          border: 'none',
          background: 'var(--accent-primary)',
          color: 'white',
          fontSize: '0.875rem',
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}
      >
        {isIOSSafari ? <Share size={16} /> : <Download size={16} />}
        Show me how
      </button>
    );
  };

  const instructions = getBrowserInstructions();

  return (
    <>
      <SettingsSection title="Install App">
        <SettingsRow
          icon={<Download size={20} />}
          label="Install myK9Q"
          description={isIOSSafari
            ? "Required for push notifications on iPhone"
            : "Add to your home screen for quick access"
          }
          action={getActionButton()}
        />

        {/* Benefits list */}
        <div style={{
          padding: '0 20px 16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.6
        }}>
          <div style={{ marginBottom: '8px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Why install?
          </div>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Push notifications when your dogs are up</li>
            <li>Works offline at the trial grounds</li>
            <li>Faster loading from home screen</li>
            <li>Full-screen experience</li>
          </ul>
          {isIOSSafari && (
            <div style={{
              marginTop: '12px',
              padding: '8px 12px',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: '6px',
              color: 'var(--token-warning)',
              fontWeight: 500
            }}>
              On iPhone, notifications only work when installed
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Browser-specific Instructions Modal */}
      {showInstructions && (
        <div
          onClick={() => setShowInstructions(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface-primary, white)',
              borderRadius: '16px',
              maxWidth: '380px',
              width: '100%',
              padding: '24px',
              position: 'relative',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)'
            }}
          >
            <button
              onClick={() => setShowInstructions(false)}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={24} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <Download size={40} style={{ color: 'var(--accent-primary)', marginBottom: '12px' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                {instructions.title}
              </h2>
            </div>

            <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
              {instructions.steps.map((step, index) => (
                <li key={index} style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 0',
                  borderBottom: index < instructions.steps.length - 1 ? '1px solid var(--border-subtle)' : 'none'
                }}>
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    background: 'var(--accent-primary)',
                    color: 'white',
                    borderRadius: '50%',
                    fontWeight: 600,
                    fontSize: '0.875rem',
                    flexShrink: 0
                  }}>
                    {index + 1}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: '0.9375rem',
                    lineHeight: 1.5,
                    color: 'var(--text-primary)',
                    paddingTop: '2px'
                  }}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>

            <p style={{
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: '0.8125rem',
              margin: '0 0 20px',
              lineHeight: 1.5,
              fontStyle: 'italic'
            }}>
              Once installed, favorite your dogs to get notified when they're up!
            </p>

            <button
              onClick={() => setShowInstructions(false)}
              style={{
                width: '100%',
                padding: '14px',
                background: 'var(--accent-primary)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 600,
                fontSize: '1rem',
                cursor: 'pointer'
              }}
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
};
