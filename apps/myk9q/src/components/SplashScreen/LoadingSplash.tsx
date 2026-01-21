import { Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Tailwind styles for LoadingSplash */
const styles = {
  overlay: cn(
    "fixed inset-0 z-[9999]",
    "flex items-end justify-center",
    "bg-[#0a1a12]"
  ),
  background: cn(
    "absolute inset-0 w-full h-full",
    "object-cover object-center",
    "opacity-100"
  ),
  progressPanel: cn(
    "relative w-full max-w-[420px]",
    "mx-4 mb-3 p-6 px-8",
    "bg-[rgba(10,10,10,0.95)] backdrop-blur-md",
    "rounded-xl border border-[rgba(62,161,115,0.15)]",
    "animate-[loadingSplashSlideUp_0.3s_ease-out_0.1s_both]",
    // Mobile portrait
    "max-[768px]:portrait:max-w-[280px] max-[768px]:portrait:mx-4 max-[768px]:portrait:mb-6 max-[768px]:portrait:p-4 max-[768px]:portrait:px-5",
    // Small screens
    "max-sm:max-w-[280px] max-sm:mx-3 max-sm:mb-4 max-sm:p-4 max-sm:px-5",
    // Landscape mobile
    "max-h-[500px]:landscape:mx-4 max-h-[500px]:landscape:mb-2 max-h-[500px]:landscape:p-3 max-h-[500px]:landscape:px-4 max-h-[500px]:landscape:max-w-[280px]",
    "motion-reduce:animate-none"
  ),
  icon: cn(
    "flex justify-center mb-2",
    "[&_svg]:w-7 [&_svg]:h-7"
  ),
  iconSpinning: cn(
    "text-[var(--status-checked-in)]",
    "animate-spin",
    "motion-reduce:animate-none"
  ),
  iconComplete: cn(
    "text-[var(--status-checked-in)]",
    "animate-[loadingSplashIconPop_0.4s_ease-out]",
    "motion-reduce:animate-none"
  ),
  message: cn(
    "text-lg font-semibold text-center",
    "text-[#e8e8e8] tracking-tight",
    "m-0 mb-1"
  ),
  description: cn(
    "text-xs text-center text-[#888] m-0"
  ),
};

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
    <div className={styles.overlay}>
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
          className={styles.background}
          draggable={false}
          loading="eager"
          fetchPriority="high"
        />
      </picture>

      {/* Semi-transparent progress panel at bottom */}
      <div className={styles.progressPanel}>
        {/* Icon */}
        <div className={styles.icon}>
          {isComplete ? (
            <CheckCircle className={styles.iconComplete} />
          ) : (
            <Loader2 className={styles.iconSpinning} />
          )}
        </div>

        {/* Message */}
        <h2 className={styles.message}>
          {isComplete ? 'Ready!' : message}
        </h2>
        <p className={styles.description}>
          {isComplete
            ? 'You can now use the app without wifi'
            : 'Preparing for offline use'}
        </p>
      </div>
    </div>
  );
}
