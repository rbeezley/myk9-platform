import React, { useState } from 'react';
import { Heart, CheckCircle, Bell, Clock, ChevronRight, Sparkles } from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import PushNotificationService from '@/services/pushNotificationService';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import './Onboarding.css';

interface OnboardingProps {
  onComplete: () => void;
}

interface OnboardingScreen {
  id: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  colorClass: string;
}

const screens: OnboardingScreen[] = [
  {
    id: 0,
    icon: Sparkles,
    title: 'Welcome to myK9Q',
    description: 'Your all-in-one companion for dog sport events. The next few screens will show you the key features that make trial days easier. You\'ll only see this once!',
    colorClass: 'onboarding-icon-welcome'
  },
  {
    id: 1,
    icon: Heart,
    title: 'Never Miss Your Run',
    description: 'Favorite your dogs to get instant notifications when they\'re up next—no more constantly checking running order.',
    colorClass: 'onboarding-icon-favorites'
  },
  {
    id: 2,
    icon: CheckCircle,
    title: 'Skip the Lines',
    description: 'Check in right from your phone and see results instantly—spend more time ringside, less time waiting.',
    colorClass: 'onboarding-icon-checkin'
  },
  {
    id: 3,
    icon: Bell,
    title: 'Stay in the Loop',
    description: 'Get important announcements about delays, class changes, and event updates delivered instantly.',
    colorClass: 'onboarding-icon-updates'
  },
  {
    id: 4,
    icon: Clock,
    title: 'Know When to Return',
    description: 'Real-time class updates let you grab lunch or walk your dog without worrying about missing your turn.',
    colorClass: 'onboarding-icon-status'
  }
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentScreen, setCurrentScreen] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isEnablingNotifications, setIsEnablingNotifications] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'enabled' | 'denied'>('idle');

  const { updateSettings } = useSettingsStore();
  const { showContext, role } = useAuth();

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    }
    if (isRightSwipe && currentScreen > 0) {
      setCurrentScreen(currentScreen - 1);
    }
  };

  const handleNext = () => {
    if (currentScreen < screens.length - 1) {
      setCurrentScreen(currentScreen + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem('onboarding_completed', 'true');
    onComplete();
  };

  const handleEnableNotifications = async () => {
    if (!showContext?.licenseKey || !role) {
      logger.error('[Onboarding] Missing license key or role');
      return;
    }

    setIsEnablingNotifications(true);

    try {
      // Enable notifications in settings
      updateSettings({ enableNotifications: true });

      // Get favorite armbands from localStorage
      const favoritesKey = `dog_favorites_${showContext.licenseKey}`;
      const savedFavorites = localStorage.getItem(favoritesKey);
      let favoriteArmbands: number[] = [];

      if (savedFavorites) {
        try {
          const parsed = JSON.parse(savedFavorites);
          if (Array.isArray(parsed) && parsed.every(id => typeof id === 'number')) {
            favoriteArmbands = parsed;
          }
        } catch (error) {
          logger.error('[Onboarding] Error parsing favorites:', error);
        }
      }

      // Request browser permission and subscribe
      const success = await PushNotificationService.subscribe(role, showContext.licenseKey, favoriteArmbands);

      if (success) {
        setNotificationStatus('enabled');
      } else {
        setNotificationStatus('denied');
        updateSettings({ enableNotifications: false });
      }
    } catch (error) {
      logger.error('[Onboarding] Error enabling notifications:', error);
      setNotificationStatus('denied');
      updateSettings({ enableNotifications: false });
    } finally {
      setIsEnablingNotifications(false);
    }
  };

  const screen = screens[currentScreen];
  const IconComponent = screen.icon;
  const isLastScreen = currentScreen === screens.length - 1;

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-container">
        {/* Skip Button */}
        <button className="onboarding-skip" onClick={handleComplete}>
          Skip
        </button>

        {/* Screen Content */}
        <div
          className="onboarding-content"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* Logo */}
          <div className="onboarding-logo-container">
            <div className="onboarding-logo">
              <img
                src="/myK9Q-teal-192.png"
                alt="myK9Q Logo"
                className="onboarding-logo-img"
              />
            </div>
          </div>

          {/* Icon */}
          <div className={`onboarding-icon ${screen.colorClass}`}>
            <IconComponent className="onboarding-icon-svg" />
          </div>

          {/* Title & Description */}
          <h2 className="onboarding-title">{screen.title}</h2>
          <p className="onboarding-description">{screen.description}</p>

          {/* Notification Enable Button (Screens 1-4, all notification-related screens) */}
          {currentScreen >= 1 && currentScreen <= 4 && notificationStatus === 'idle' && (
            <button
              className="onboarding-notification-button"
              onClick={handleEnableNotifications}
              disabled={isEnablingNotifications}
            >
              {isEnablingNotifications ? (
                <>
                  <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
                  Enabling...
                </>
              ) : (
                <>
                  <Bell size={18} />
                  Enable Notifications
                </>
              )}
            </button>
          )}

          {/* Notification Enabled Success (Screens 1-4) */}
          {currentScreen >= 1 && currentScreen <= 4 && notificationStatus === 'enabled' && (
            <div className="onboarding-notification-success">
              <CheckCircle size={20} />
              <span>Notifications Enabled!</span>
            </div>
          )}

          {/* Notification Denied Warning (Screens 1-4) */}
          {currentScreen >= 1 && currentScreen <= 4 && notificationStatus === 'denied' && (
            <div className="onboarding-notification-denied">
              <p className="onboarding-notification-denied-text">
                Permission denied. You can enable notifications later in Settings.
              </p>
            </div>
          )}

          {/* Progress Dots */}
          <div className="onboarding-dots">
            {screens.map((_, index) => (
              <button
                key={index}
                className={`onboarding-dot ${index === currentScreen ? 'active' : ''}`}
                onClick={() => setCurrentScreen(index)}
                aria-label={`Go to screen ${index + 1}`}
              />
            ))}
          </div>

          {/* Next/Get Started Button */}
          <button className="onboarding-button" onClick={handleNext}>
            {isLastScreen ? (
              <>Get Started</>
            ) : (
              <>
                Next
                <ChevronRight className="onboarding-button-icon" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
