import React from 'react';
import { cn } from '@myk9/ui';
import { haptic } from '../hooks/useHapticFeedback';
import type { QualifyingResult, ScoresheetSportType } from '../types/scoreData';

const RESULT_OPTIONS: { value: QualifyingResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: 'Qualified',
    // Qualified uses the host accent (terracotta in myK9Show, teal in myK9Q) —
    // the "selected = accent" convention. NQ/ABS/EX stay semantic below.
    activeClass: 'bg-primary hover:brightness-110 border-primary text-primary-foreground shadow-lg',
  },
  {
    value: 'NQ',
    label: 'NQ',
    activeClass: 'bg-red-600 hover:bg-red-700 border-red-600 shadow-lg shadow-red-600/20',
  },
  {
    value: 'ABS',
    label: 'Absent',
    activeClass:
      'bg-purple-600 hover:bg-purple-700 border-purple-600 shadow-lg shadow-purple-600/20',
  },
  {
    value: 'EX',
    label: 'Excused',
    activeClass: 'bg-red-700 hover:bg-red-800 border-red-700 shadow-lg shadow-red-700/20',
  },
];

const NQ_REASONS: Record<string, string[]> = {
  default: [
    'Incorrect Call',
    'Max Time',
    'Point to Hide',
    'Harsh Correction',
    'Significant Disruption',
  ],
  ASCA_SCENT_DETECTION: [
    'Incorrect Call',
    'Exceeded Max Time',
    'Dog Eliminated in Area',
    'Dog Stopped Working',
    'Destroyed Containers',
    'Excessive Disturbance',
    'Damaged Property',
    "Couldn't Point to Hide",
  ],
};

const EXCUSED_REASONS: Record<string, string[]> = {
  default: [
    'Dog Eliminated in Area',
    'Handler Request',
    'Out of Control',
    'Overly Stressed',
    'Other',
  ],
  ASCA_SCENT_DETECTION: [
    'Extreme Stress/Fear/Aggression',
    'Harsh Handling',
    'Poor Sportsmanship',
    'Revealed Hide Location',
  ],
};

/**
 * ASCA: Novice/Open = 2 faults, Advanced/Excellent = 1 fault.
 * Others: No limit.
 */
function getMaxFaults(sportType?: ScoresheetSportType, level?: string): number {
  if (sportType === 'ASCA_SCENT_DETECTION' && level) {
    const lvl = level.toLowerCase();
    if (lvl.includes('novice') || lvl.includes('open')) return 2;
    if (lvl.includes('advanced') || lvl.includes('excellent')) return 1;
  }
  return Infinity;
}

const chipBase =
  'px-3 py-2 rounded-full border-2 text-sm font-semibold cursor-pointer transition-all duration-200 hover:-translate-y-px active:scale-[0.98]';

const chipInactive =
  'bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground';

const reasonChipBase =
  'px-4 py-2 rounded-full border-2 text-sm font-semibold cursor-pointer transition-all duration-200 hover:-translate-y-px active:scale-[0.98]';

const faultButtonClass =
  'w-11 h-11 rounded-full border-2 border-border bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed';

export interface ResultChoiceChipsProps {
  selectedResult: QualifyingResult | null;
  onResultChange: (result: QualifyingResult) => void;
  faultCount?: number;
  onFaultCountChange?: (count: number) => void;
  nqReason?: string;
  onNQReasonChange?: (reason: string) => void;
  excusedReason?: string;
  onExcusedReasonChange?: (reason: string) => void;
  sportType?: ScoresheetSportType;
  level?: string;
  hideFaults?: boolean;
  className?: string;
}

export const ResultChoiceChips: React.FC<ResultChoiceChipsProps> = ({
  selectedResult,
  onResultChange,
  faultCount = 0,
  onFaultCountChange,
  nqReason,
  onNQReasonChange,
  excusedReason,
  onExcusedReasonChange,
  sportType,
  level,
  hideFaults = false,
  className,
}) => {
  const nqReasons = NQ_REASONS[sportType || ''] || NQ_REASONS.default;
  const excusedReasons = EXCUSED_REASONS[sportType || ''] || EXCUSED_REASONS.default;
  const maxFaults = getMaxFaults(sportType, level);
  const isAtMaxFaults = faultCount >= maxFaults;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex gap-1.5 justify-center">
        {RESULT_OPTIONS.map(opt => {
          const isActive = selectedResult === opt.value;
          return (
            <button
              key={opt.value}
              className={cn(
                chipBase,
                isActive
                  ? `text-white -translate-y-px ${opt.activeClass}`
                  : chipInactive
              )}
              onClick={() => {
                haptic.medium();
                onResultChange(opt.value);
              }}
              data-testid={`result-${opt.value}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {selectedResult === 'Q' && onFaultCountChange && !hideFaults && (
        <div className="flex flex-col items-center gap-3 py-2">
          <h3 className="text-base font-semibold text-center">
            Faults Count
            {maxFaults !== Infinity && (
              <span className="text-sm font-normal text-muted-foreground"> (max {maxFaults})</span>
            )}
          </h3>
          <div className="flex items-center justify-center gap-5">
            <button
              className={faultButtonClass}
              onClick={() => {
                haptic.light();
                onFaultCountChange(Math.max(0, faultCount - 1));
              }}
              disabled={faultCount === 0}
            >
              -
            </button>
            <span
              className={cn(
                'text-2xl font-bold w-10 text-center tabular-nums',
                isAtMaxFaults && 'text-red-500'
              )}
            >
              {faultCount}
            </span>
            <button
              className={faultButtonClass}
              onClick={() => {
                haptic.light();
                onFaultCountChange(faultCount + 1);
              }}
              disabled={isAtMaxFaults}
              title={isAtMaxFaults ? `Maximum ${maxFaults} faults allowed` : undefined}
            >
              +
            </button>
          </div>
          {isAtMaxFaults && (
            <div className="text-sm text-red-500 font-medium">
              At maximum faults for {level} level
            </div>
          )}
        </div>
      )}

      {selectedResult === 'NQ' && onNQReasonChange && (
        <div className="flex flex-col items-center gap-3 py-2">
          <h3 className="text-base font-semibold text-center">Non-Qualifying Reason</h3>
          <div className="flex gap-2 justify-center flex-wrap">
            {nqReasons.map(reason => (
              <button
                key={reason}
                className={cn(
                  reasonChipBase,
                  nqReason === reason
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:border-primary hover:text-foreground'
                )}
                onClick={() => {
                  haptic.light();
                  onNQReasonChange(reason);
                }}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedResult === 'EX' && onExcusedReasonChange && (
        <div className="flex flex-col items-center gap-3 py-2">
          <h3 className="text-base font-semibold text-center">Excused Reason</h3>
          <div className="flex gap-2 justify-center flex-wrap">
            {excusedReasons.map(reason => (
              <button
                key={reason}
                className={cn(
                  reasonChipBase,
                  excusedReason === reason
                    ? 'bg-primary text-white border-primary shadow-md'
                    : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:border-primary hover:text-foreground'
                )}
                onClick={() => {
                  haptic.light();
                  onExcusedReasonChange(reason);
                }}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
