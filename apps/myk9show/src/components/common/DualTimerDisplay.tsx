/**
 * Dual Timer Display Component
 * 
 * Displays both stopwatch (counting up) and countdown (counting down) timers
 * for accurate dog show result timing. Follows the proven UX patterns from
 * the Flutter app with large, touch-friendly controls.
 */


import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, Pause, Timer } from 'lucide-react';
import { useCountdownTimer } from '@/hooks/useCountdownTimer';

interface DualTimerDisplayProps {
  maxTimeMs: number;
  level: 'Novice' | 'Advanced' | 'Excellent' | 'Masters';
  onTimeWarning?: (remainingMs: number) => void;
  onTimeExpired?: () => void;
  onSearchTime?: (timeMs: number) => void;
  className?: string;
  size?: 'default' | 'large';
  disabled?: boolean;
}

/**
 * Dual timer display with stopwatch and countdown functionality
 * 
 * Replicates the proven UX from the Flutter app with large touch targets
 * and clear visual hierarchy for mobile judge use.
 * 
 * @param props - Timer configuration and callbacks
 * 
 * @example
 * ```tsx
 * <DualTimerDisplay
 *   maxTimeMs={120000} // 2 minutes
 *   level="Novice"
 *   onTimeWarning={() => playWarningSound()}
 *   onTimeExpired={() => handleTimeExpired()}
 *   onSearchTime={(time) => setResultTime(time)}
 *   size="large"
 * />
 * ```
 */
export function DualTimerDisplay({
  maxTimeMs,
  level,
  onTimeWarning,
  onTimeExpired,
  onSearchTime,
  className,
  size = 'default',
  disabled = false
}: DualTimerDisplayProps) {
  const timer = useCountdownTimer({
    maxTimeMs,
    level,
    onTimeWarning,
    onTimeExpired,
    onSearchTime
  });

  const isLarge = size === 'large';

  return (
    <div 
      data-testid="dual-timer-display"
      className={cn(
        'flex flex-col items-center space-y-4 p-4 bg-gray-800 rounded-lg',
        isLarge && 'p-6 space-y-6',
        className
      )}
    >
      {/* Main Timer Display */}
      <div className="flex flex-col items-center space-y-2">
        {/* Stopwatch (Search Time) */}
        <div className={cn(
          'text-center',
          isLarge ? 'space-y-1' : 'space-y-0.5'
        )}>
          <div className={cn(
            'font-mono font-bold text-white',
            isLarge ? 'text-5xl md:text-6xl' : 'text-3xl md:text-4xl',
            timer.isExpired && 'text-red-400',
            timer.isWarning && !timer.isExpired && 'text-yellow-400'
          )}>
            {timer.searchTimeDisplay}
          </div>
          <div className={cn(
            'text-gray-400 text-sm',
            isLarge && 'text-base'
          )}>
            Search Time
          </div>
        </div>

        {/* Countdown Display */}
        <div className="flex items-center space-x-3">
          <Timer className={cn(
            'text-teal-400',
            isLarge ? 'h-6 w-6' : 'h-5 w-5'
          )} />
          <div className={cn(
            'font-mono font-semibold text-teal-400',
            isLarge ? 'text-2xl' : 'text-xl',
            timer.isWarning && !timer.isExpired && 'text-yellow-400',
            timer.isExpired && 'text-red-400'
          )}>
            {timer.remainingTimeDisplay}
          </div>
          <div className={cn(
            'text-gray-400 text-sm',
            isLarge && 'text-base'
          )}>
            Remaining
          </div>
        </div>
      </div>

      {/* Circular Progress Indicator */}
      <div className="relative" role="progressbar" aria-valuenow={timer.searchTime} aria-valuemax={maxTimeMs}>
        <CircularProgress
          current={timer.searchTime}
          max={maxTimeMs}
          size={isLarge ? 80 : 60}
          isWarning={timer.isWarning}
          isExpired={timer.isExpired}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            'font-mono font-bold text-white',
            isLarge ? 'text-sm' : 'text-xs'
          )}>
            {Math.round((timer.searchTime / maxTimeMs) * 100)}%
          </span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center space-x-4">
        {/* Pause/Resume Button (left) */}
        <Button
          variant="outline"
          size={isLarge ? "lg" : "default"}
          onClick={timer.isRunning ? timer.stop : timer.start}
          disabled={disabled || timer.isExpired}
          aria-label={timer.isRunning ? 'Pause' : 'Resume'}
          className={cn(
            'min-w-[44px] h-[44px] border-gray-600 text-gray-300 hover:text-white',
            isLarge && 'min-w-[60px] h-[60px]',
            timer.isRunning && 'bg-gray-700 hover:bg-gray-600'
          )}
        >
          {timer.isRunning ? (
            <Pause className={cn(
              'h-5 w-5',
              isLarge && 'h-6 w-6'
            )} />
          ) : (
            <Play className={cn(
              'h-5 w-5',
              isLarge && 'h-6 w-6'
            )} />
          )}
        </Button>

        {/* Start/Stop Button (center) */}
        <Button
          size={isLarge ? "lg" : "default"}
          onClick={timer.isRunning ? timer.stop : timer.start}
          disabled={disabled}
          className={cn(
            'min-w-[80px] h-[44px] font-semibold text-white',
            isLarge && 'min-w-[120px] h-[60px] text-lg',
            timer.isRunning 
              ? 'bg-red-600 hover:bg-red-700 border-red-500' 
              : 'bg-teal-600 hover:bg-teal-700 border-teal-500',
            timer.isExpired && 'bg-gray-600 hover:bg-gray-700 border-gray-500'
          )}
        >
          {timer.isRunning ? (
            <>
              <Square className={cn(
                'mr-2 h-4 w-4',
                isLarge && 'h-5 w-5'
              )} />
              Stop
            </>
          ) : (
            <>
              <Play className={cn(
                'mr-2 h-4 w-4',
                isLarge && 'h-5 w-5'
              )} />
              Start
            </>
          )}
        </Button>

        {/* Reset Button (right) */}
        <Button
          variant="outline"
          size={isLarge ? "lg" : "default"}
          onClick={timer.reset}
          disabled={disabled || (timer.searchTime === 0 && !timer.isRunning)}
          aria-label="Reset"
          className={cn(
            'min-w-[44px] h-[44px] border-gray-600 text-gray-300 hover:text-white',
            isLarge && 'min-w-[60px] h-[60px]'
          )}
        >
          <RotateCcw className={cn(
            'h-5 w-5',
            isLarge && 'h-6 w-6'
          )} />
        </Button>
      </div>

      {/* Warning/Status Indicators */}
      {(timer.isWarning || timer.isExpired) && (
        <div className={cn(
          'flex items-center justify-center space-x-2 px-3 py-2 rounded-md',
          isLarge && 'px-4 py-3',
          timer.isExpired 
            ? 'bg-red-900/50 text-red-200' 
            : 'bg-yellow-900/50 text-yellow-200'
        )}>
          {timer.isExpired ? (
            <>
              <Square className="h-4 w-4" />
              <span className={cn(
                'font-semibold',
                isLarge && 'text-lg'
              )}>
                Time Expired
              </span>
            </>
          ) : (
            <>
              <Timer className="h-4 w-4" />
              <span className={cn(
                'font-semibold',
                isLarge && 'text-lg'
              )}>
                30 Second Warning
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Circular progress indicator for timer visualization
 */
interface CircularProgressProps {
  current: number;
  max: number;
  size: number;
  isWarning: boolean;
  isExpired: boolean;
}

function CircularProgress({ current, max, size, isWarning, isExpired }: CircularProgressProps) {
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(current / max, 1);
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progress * circumference);

  let strokeColor = '#14b8a6'; // teal-500
  if (isExpired) {
    strokeColor = '#ef4444'; // red-500
  } else if (isWarning) {
    strokeColor = '#f59e0b'; // amber-500
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#374151"
          strokeWidth="3"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="3"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-300 ease-in-out"
        />
      </svg>
    </div>
  );
}

/**
 * Compact timer display for entry lists and navigation
 */
interface CompactTimerProps {
  searchTime: number;
  remainingTime: number;
  isRunning: boolean;
  isWarning: boolean;
  isExpired: boolean;
  className?: string;
}

export function CompactTimerDisplay({
  searchTime,
  remainingTime,
  isRunning,
  isWarning,
  isExpired,
  className
}: CompactTimerProps) {
  // Format times for compact display
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
  };

  const formatCountdown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn(
      'flex items-center space-x-2 text-sm',
      className
    )}>
      {/* Search Time */}
      <div className={cn(
        'font-mono font-semibold',
        isExpired ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-white'
      )}>
        {formatTime(searchTime)}
      </div>
      
      {/* Separator */}
      <div className="text-gray-500">|</div>
      
      {/* Remaining Time */}
      <div className={cn(
        'font-mono text-teal-400',
        isWarning && 'text-yellow-400',
        isExpired && 'text-red-400'
      )}>
        {formatCountdown(remainingTime)}
      </div>
      
      {/* Status Indicator */}
      {isRunning && (
        <div className="flex items-center">
          <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse" />
        </div>
      )}
    </div>
  );
}