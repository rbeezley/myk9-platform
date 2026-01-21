import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { SPLASH_STORAGE_KEY } from './splashUtils';
import { cn } from '@/lib/utils';
import './SplashScreen.css'; // Keyframe animations

/** Tailwind styles for SplashScreen */
const styles = {
  screen: cn(
    "fixed inset-0 z-[9999]",
    "flex flex-col items-center justify-center",
    "bg-[#0a0f0a] cursor-pointer",
    "animate-[splashFadeIn_0.5s_ease-out]",
    "focus:outline-none",
    "focus-visible:outline-2 focus-visible:outline-[rgba(62,161,115,0.8)] focus-visible:outline-offset-[-4px]",
    "motion-reduce:animate-none"
  ),
  screenExit: cn(
    "animate-[splashFadeOut_0.4s_ease-in_forwards]",
    "motion-reduce:opacity-0 motion-reduce:transition-opacity motion-reduce:duration-200"
  ),
  image: cn(
    "max-w-full max-h-full w-auto h-auto object-contain",
    "animate-[splashImagePop_0.6s_ease-out_0.2s_both]",
    "motion-reduce:animate-none",
    "max-[500px]:landscape:max-h-[90vh]"
  ),
  imageExit: "animate-[splashImageExit_0.4s_ease-in_forwards]",
  imageHover: "hover:brightness-[1.02] active:brightness-[0.98] active:scale-[0.995]",
  hint: cn(
    "absolute bottom-8 md:bottom-6 max-[500px]:landscape:bottom-3",
    "left-1/2 -translate-x-1/2",
    "text-white/50 text-sm md:text-xs max-[500px]:landscape:text-[0.7rem]",
    "font-sans",
    "animate-[splashHintFadeIn_0.5s_ease-out_1s_both]",
    "motion-reduce:animate-none"
  ),
  hintExit: "opacity-0",
};

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
        className={cn(styles.screen, isExiting && styles.screenExit)}
        onClick={handleDismiss}
        role="button"
        tabIndex={0}
        aria-label="Enter myK9Q - Click or press Enter to continue"
      >
        <img
          src="/myK9Q-Splash.webp"
          alt="myK9Q - Queue to Qualify"
          className={cn(
            styles.image,
            styles.imageHover,
            isExiting && styles.imageExit
          )}
          draggable={false}
        />

        {/* Subtle hint for users who might not realize it's clickable */}
        <div className={cn(styles.hint, isExiting && styles.hintExit)}>
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
