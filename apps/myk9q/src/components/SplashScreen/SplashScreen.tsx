import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { SPLASH_STORAGE_KEY } from './splashUtils';
import './SplashScreen.css';

// Routes where splash screen should NOT appear
const SPLASH_EXCLUDED_ROUTES = [
  '/',           // Landing page (public marketing)
  '/tv',         // TV displays
  '/results',    // Public results
  '/admin',      // Admin pages
];

interface SplashScreenProps {
  children: React.ReactNode;
}

/**
 * SplashScreen component that shows a branded welcome screen on first visit.
 *
 * Behavior:
 * - Shows splash on first visit to /login (not landing page)
 * - User clicks "Enter Ring" (or anywhere) to dismiss
 * - Remembers dismissal in localStorage
 * - Return visitors skip straight to the app
 */
export function SplashScreen({ children }: SplashScreenProps) {
  const location = useLocation();
  const [isExiting, setIsExiting] = useState(false);

  // Check if current route should show splash
  const isExcludedRoute = SPLASH_EXCLUDED_ROUTES.some(route =>
    location.pathname === route || location.pathname.startsWith(route + '/')
  );

  // Determine if splash should show (lazy initialization to avoid effect)
  const wasDismissed = localStorage.getItem(SPLASH_STORAGE_KEY);
  const showSplash = !wasDismissed && !isExcludedRoute;

  const handleDismiss = useCallback(() => {
    // Start exit animation
    setIsExiting(true);

    // Save to localStorage so splash doesn't show again
    localStorage.setItem(SPLASH_STORAGE_KEY, 'true');

    // Wait for animation to complete before navigating
    setTimeout(() => {
      // Reload to re-evaluate showSplash after localStorage update
      window.location.reload();
    }, 400); // Match CSS transition duration
  }, []);

  // Handle keyboard events (Enter or Space to dismiss)
  useEffect(() => {
    if (!showSplash) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleDismiss();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSplash, handleDismiss]);

  // On excluded routes or if splash dismissed, show children immediately
  if (isExcludedRoute || !showSplash) {
    return <>{children}</>;
  }

  // Show splash screen
  return (
    <>
      <div
        className={`splash-screen ${isExiting ? 'splash-exit' : ''}`}
        onClick={handleDismiss}
        role="button"
        tabIndex={0}
        aria-label="Enter myK9Q - Click or press Enter to continue"
      >
        <img
          src="/myK9Q-Splash.webp"
          alt="myK9Q - Queue to Qualify"
          className="splash-image"
          draggable={false}
        />

        {/* Subtle hint for users who might not realize it's clickable */}
        <div className="splash-hint">
          Click anywhere or press Enter
        </div>
      </div>

      {/* Preload the app in the background for faster transition */}
      <div style={{ display: 'none' }}>
        {children}
      </div>
    </>
  );
}
