import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '@/utils/logger';
import { authenticatePasscode } from '../../services/authService';
import { detectDatabaseWithValidation, isMigrationModeEnabled, V3ShowData } from '../../services/databaseDetectionService';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { checkRateLimit, recordFailedAttempt, clearRateLimit } from '../../utils/rateLimiter';
import { TransitionMessage } from '../../components/TransitionMessage/TransitionMessage';
import { LoadingSplash } from '../../components/SplashScreen/LoadingSplash';
import { autoDownloadShow } from '../../services/autoDownloadService';
import { prepareForOffline, wasRecentlyPrepared, type OfflinePreparationProgress } from '../../utils/chunkPrefetch';
import PushNotificationService from '../../services/pushNotificationService';
import './Login.css';

export const Login: React.FC = () => {
  const [passcode, setPasscode] = useState(['', '', '', '', '']);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState('');
  const [preparingOffline, setPreparingOffline] = useState(false);
  const [offlineProgress, setOfflineProgress] = useState<OfflinePreparationProgress | null>(null);
  const [funMessageIndex, setFunMessageIndex] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Fun dog show themed messages for the loading overlay
  const funMessages = [
    'Getting your show ready...',
    'Polishing the trophies...',
    'Ensuring this data is Best in Show...',
    'Grooming the database...',
    'Stacking the entries just right...',
    'Preparing the ring...',
    'Checking the armbands...',
    'Warming up the judges...',
  ];
  const navigate = useNavigate();
  const { login } = useAuth();
  const hapticFeedback = useHapticFeedback();

  // Focus first input on mount
  useEffect(() => {
inputRefs.current[0]?.focus();
  }, []);

  // Preload splash image for instant display during post-login loading
  useEffect(() => {
    const img = new Image();
    img.src = '/myK9Q-Splash.webp';
  }, []);

  // Rotate fun messages every 2.5 seconds while preparing offline
  useEffect(() => {
    if (!preparingOffline || offlineProgress?.complete) {
      setFunMessageIndex(0); // Reset when done
      return;
    }

    const interval = setInterval(() => {
      setFunMessageIndex((prev) => (prev + 1) % funMessages.length);
    }, 2500);

    return () => clearInterval(interval);
  }, [preparingOffline, offlineProgress?.complete, funMessages.length]);

  const handleInputChange = (index: number, value: string) => {
    // Only allow single character
    if (value.length > 1) {
      value = value.slice(-1);
    }

    // Light haptic feedback for typing
    if (value) {
      hapticFeedback.light();
    }

    const newPasscode = [...passcode];
    newPasscode[index] = value.toUpperCase();
    setPasscode(newPasscode);

    // Auto-advance to next input
    if (value && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Clear error when typing
    if (error) {
      setError('');
    }

    // Auto-submit when all 5 digits are entered
    if (value && index === 4) {
      // Check if all fields are filled
      const isComplete = newPasscode.every(digit => digit !== '');
      if (isComplete) {
        // Add a small delay for better UX
        setTimeout(() => {
          handleSubmitWithPasscode(newPasscode);
        }, 150);
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Handle backspace
    if (e.key === 'Backspace' && !passcode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    // Handle Enter to submit
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text').toUpperCase().slice(0, 5);
    const newPasscode = [...passcode];
    
    for (let i = 0; i < pastedText.length && i < 5; i++) {
      newPasscode[i] = pastedText[i];
    }
    
    setPasscode(newPasscode);
    
    // Focus last filled input or last input if all filled
    const lastFilledIndex = Math.min(pastedText.length - 1, 4);
    inputRefs.current[lastFilledIndex]?.focus();
  };

  const handleReset = () => {
    hapticFeedback.light();
    setPasscode(['', '', '', '', '']);
    setError('');
    inputRefs.current[0]?.focus();
  };

  /**
   * Trigger auto-download of show data for offline use
   * Runs in background, non-blocking
   */
  const triggerAutoDownload = (licenseKey: string) => {
// Start background download (don't await - non-blocking)
    autoDownloadShow(licenseKey, (_progress) => { /* Progress callback not needed */ }).then(result => {
      // Download complete - only log failures
      if (!result.success) {
        if (result.downloaded > 0) {
          logger.warn(
            `⚠️ [AUTO-DOWNLOAD] Partial success: ${result.downloaded}/${result.total} classes cached`
          );
        } else {
          logger.error('❌ [AUTO-DOWNLOAD] Failed to cache any classes');
        }
      }
    }).catch(error => {
      logger.error('[AUTO-DOWNLOAD] Unexpected error:', error);
    });
  };

  /**
   * Prepare app for offline use after successful login.
   * Shows branded splash screen with progress while loading chunks and syncing data.
   * Always displays splash for minimum 2 seconds for branded experience.
   */
  const handlePostLoginPreparation = async (licenseKey: string) => {
    setIsLoading(false);
    setPreparingOffline(true);

    // Track start time to ensure minimum splash display duration
    const splashStartTime = Date.now();
    const MIN_SPLASH_DURATION = 2000; // 2 seconds minimum

    // Check if recently prepared (can do quick background refresh)
    const isRecentlyPrepared = wasRecentlyPrepared(licenseKey);

    try {
      if (isRecentlyPrepared) {
        logger.log('[Login] Recently prepared - quick refresh in background');
        // Still trigger background refresh, but don't wait for it
        triggerAutoDownload(licenseKey);
        prepareForOffline(licenseKey, undefined, 10000).catch(() => {
          // Ignore errors - this is a background refresh
        });
      } else {
        // First time for this show - run full offline preparation
        await prepareForOffline(
          licenseKey,
          (progress) => setOfflineProgress(progress),
          20000 // 20 second timeout (then continues in background)
        );

        // Also trigger auto-download (runs in parallel/background)
        triggerAutoDownload(licenseKey);
      }

      // Calculate remaining time to meet minimum splash duration
      const elapsedTime = Date.now() - splashStartTime;
      const remainingTime = Math.max(0, MIN_SPLASH_DURATION - elapsedTime);

      if (remainingTime > 0) {
        logger.log(`[Login] Splash minimum duration: waiting ${remainingTime}ms more`);
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }

      // Small delay to show completion state
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      logger.warn('[Login] Offline preparation failed, continuing anyway:', error);

      // Still ensure minimum splash duration even on error
      const elapsedTime = Date.now() - splashStartTime;
      const remainingTime = Math.max(0, MIN_SPLASH_DURATION - elapsedTime);
      if (remainingTime > 0) {
        await new Promise(resolve => setTimeout(resolve, remainingTime));
      }
    }

    // Navigate to home regardless of preparation success
    setPreparingOffline(false);
    navigate('/home');
  };

  const handleSubmitWithPasscode = async (passcodeArray: string[]) => {
    const fullPasscode = passcodeArray.join('');

    if (fullPasscode.length !== 5) {
      hapticFeedback.heavy();
      setError('Please enter all 5 characters');
      return;
    }

    // ⚡ RATE LIMIT CHECK - Prevent brute force attacks
    const rateLimitResult = checkRateLimit('login');

    if (!rateLimitResult.allowed) {
      hapticFeedback.heavy();
      setError(rateLimitResult.message);
      setPasscode(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
      return;
    }

    setIsLoading(true);
    setError('');
    hapticFeedback.medium();

    try {
      // Check if migration mode is enabled (dual-database detection)
      if (isMigrationModeEnabled()) {
// Detect which database contains this show
        const detectionResult = await detectDatabaseWithValidation(fullPasscode);

        if (detectionResult.database === 'legacy' && detectionResult.redirectUrl) {
          // Show is in legacy database - redirect to Flutter app
// Clear rate limit before redirecting
          clearRateLimit('login');
          hapticFeedback.success();

          // Show transition message to user
          setError('');
          setIsLoading(false);
          setRedirectUrl(detectionResult.redirectUrl);
          setShowTransition(true);

          // Redirect will happen after user sees the transition message
          return;
        }

        // Continue with V3 authentication if not legacy
        if (detectionResult.database === 'v3' && detectionResult.showData) {
          // Already validated, use the show data directly
          // Type assertion: V3 detection always returns V3ShowData
          const v3ShowData = detectionResult.showData as V3ShowData;
          clearRateLimit('login');
          hapticFeedback.success();
          const showDataWithType = {
            ...v3ShowData,
            showType: v3ShowData.competition_type || v3ShowData.show_type
          };
          login(fullPasscode, showDataWithType);

          // Store passcode for push notification troubleshooting
          PushNotificationService.storePasscode(fullPasscode);

          // 🚀 OFFLINE PREPARATION: Load chunks + sync data before navigating
          // Critical for judges who log in then walk to exterior areas (no wifi)
          await handlePostLoginPreparation(showDataWithType.licenseKey);
          return;
        }
      }

      // Standard authentication flow (no migration mode or V3 database)
      const showData = await authenticatePasscode(fullPasscode);

      if (!showData) {
        throw new Error('Invalid passcode');
      }

      // ✅ Login successful - clear rate limit tracking
      clearRateLimit('login');
      hapticFeedback.success();
      const showDataWithType = {
        ...showData,
        showType: showData.competition_type
      };
      login(fullPasscode, showDataWithType);

      // Store passcode for push notification troubleshooting
      PushNotificationService.storePasscode(fullPasscode);

      // 🚀 OFFLINE PREPARATION: Load chunks + sync data before navigating
      // Critical for judges who log in then walk to exterior areas (no wifi)
      await handlePostLoginPreparation(showDataWithType.licenseKey);
    } catch (err) {
      logger.error('Login error:', err);

      // ❌ Failed attempt - record for rate limiting
      recordFailedAttempt('login');

      // Check rate limit state for remaining attempts warning
      // Note: We DON'T use the "allowed" flag here because progressive delay
      // is for SUBSEQUENT attempts, not to replace the current error message
      const newRateLimitResult = checkRateLimit('login');

      hapticFeedback.heavy();

      // Only show block message if actually blocked (not just progressive delay)
      if (newRateLimitResult.blockTimeRemaining > 0) {
        // Actually blocked for 30 minutes - show block message
        setError(newRateLimitResult.message);
      } else if (newRateLimitResult.remainingAttempts <= 2) {
        // Show warning when getting close to limit
        setError(`Invalid passcode. ${newRateLimitResult.remainingAttempts} attempt${newRateLimitResult.remainingAttempts === 1 ? '' : 's'} remaining before temporary block.`);
      } else {
        setError('Invalid passcode. Please check and try again.');
      }

      setPasscode(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    await handleSubmitWithPasscode(passcode);
  };

  const handleTransitionComplete = () => {
    // Redirect to Flutter app
    window.location.href = redirectUrl;
  };

  return (
    <>
      {/* Show transition message when redirecting to legacy app */}
      {showTransition && (
        <TransitionMessage onComplete={handleTransitionComplete} />
      )}

      {/* Loading Splash - Post-login preparation */}
      {preparingOffline && (
        <LoadingSplash
          progress={offlineProgress}
          message={offlineProgress?.complete ? 'Ready!' : funMessages[funMessageIndex]}
          isComplete={offlineProgress?.complete ?? false}
        />
      )}

      {/* Login page */}
      <div className="login-container page-transition">
      {/* Integrated background matching Landing page */}
      <div className="login-background">
        <div className="background-diagonal"></div>
        <div className="background-grid"></div>
      </div>
      
      <div className="login-content">
        {/* Logo and Branding */}
        <div className="logo-container">
          <div className="logo-image">
            <img
              src="/myK9Q-teal-192.png"
              alt="myK9Q Logo"
              className="logo-img"
            />
          </div>

          <h1 className="app-title">myK9Q</h1>
          <div className="tagline">
            <span className="tagline-queue">Queue</span>
            <span className="tagline-and"> & </span>
            <span className="tagline-qualify">Qualify</span>
          </div>
        </div>

        {/* Passcode Input Section - Frosted Glass Card */}
        <div className="passcode-card">
          <div className="passcode-section">
            <p className="instruction">Enter Pass Code provided by Club</p>

            <div className="passcode-input-container">
              <div className={`passcode-inputs ${passcode.every(d => d !== '') ? 'all-filled' : ''}`}>
                {passcode.map((digit, index) => (
                  <div key={index} className="input-wrapper">
                    <input
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleInputChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      className={`passcode-input ${error ? 'error' : ''} ${digit ? 'filled' : ''}`}
                      disabled={isLoading}
                      inputMode="email"
                      autoComplete="off"
                      aria-label={`Passcode digit ${index + 1}`}
                    />
                  </div>
                ))}
              </div>

              {/* Reset Button */}
              {passcode.some(digit => digit !== '') && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="reset-button"
                  disabled={isLoading}
                  aria-label="Clear passcode"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M18 6L6 18M6 6L18 18"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {/* Loading State */}
            {isLoading && (
              <div className="loading-message">
                Validating passcode...
              </div>
            )}
          </div>
        </div>

        {/* Information Section */}
        <div className="info-section">
          <p className="info-text">
            Real-time check-in, conflict management, and results.
          </p>
          <p className="info-text">
            Efficient shows. Simplified.
          </p>
          <p className="website-link">
            www.myk9t.com
          </p>
        </div>
      </div>
    </div>
    </>
  );
};