import { Loader2, CheckCircle } from 'lucide-react';
import './LoadingSplash.css';

interface OfflinePreparationProgress {
  chunksLoaded: number;
  chunksTotal: number;
  dataTablesReady: number;
  dataTablesTotal: number;
  phase: 'chunks' | 'data';
  complete: boolean;
}

interface LoadingSplashProps {
  /** Progress data for offline preparation */
  progress: OfflinePreparationProgress | null;
  /** Rotating fun message to display */
  message: string;
  /** Whether the loading is complete */
  isComplete: boolean;
}

/**
 * LoadingSplash - Post-login loading screen with splash image background
 *
 * Shows the branded splash screen with a progress overlay during:
 * - Chunk loading (app components)
 * - Data syncing (show data)
 *
 * This replaces the generic offline-prep-overlay with a branded experience.
 */
export function LoadingSplash({ progress: _progress, message, isComplete }: LoadingSplashProps) {
  return (
    <div className="loading-splash-overlay">
      {/* Splash image as background - art direction for portrait/landscape */}
      <picture>
        {/* Portrait image for mobile portrait orientation */}
        <source
          srcSet="/myK9Q-Splash-Portrait.webp"
          media="(max-width: 768px) and (orientation: portrait)"
        />
        {/* Landscape image for desktop and landscape orientations */}
        <img
          src="/myK9Q-Splash.webp"
          alt="myK9Q"
          className="loading-splash-background"
          draggable={false}
          loading="eager"
          fetchPriority="high"
        />
      </picture>

      {/* Semi-transparent progress panel at bottom */}
      <div className="loading-splash-progress-panel">
        {/* Icon */}
        <div className="loading-splash-icon">
          {isComplete ? (
            <CheckCircle className="h-12 w-12 text-primary loading-splash-icon-complete" />
          ) : (
            <Loader2 className="h-12 w-12 text-primary loading-splash-icon-spinning" />
          )}
        </div>

        {/* Message */}
        <h2 className="loading-splash-message">
          {isComplete ? 'Ready!' : message}
        </h2>
        <p className="loading-splash-description">
          {isComplete
            ? 'You can now use the app without wifi'
            : 'Preparing for offline use'}
        </p>
      </div>
    </div>
  );
}
