import React from 'react';
import { cn } from '@myk9/ui';
import { haptic } from '../hooks/useHapticFeedback';
import type { QualifyingResult, ScoresheetSportType } from '../types/scoreData';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from './DisqualifyReason';
import { FaultStepper } from './FaultStepper';
import { resultLabel } from '../utils/resultLabel';

// Each option carries its own label colour beside its own fill. A blanket
// `text-white` on the active branch would work only by twMerge ordering — the
// accent option overrides it back to the token — which is invisible to a
// reader and to any scan that looks for a fill and a label in one string.
const RESULT_OPTIONS: { value: QualifyingResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: resultLabel('Q'),
    // Qualified uses the host accent (terracotta in myK9Show, teal in myK9Q) —
    // the "selected = accent" convention. NQ/ABS/EX stay semantic below.
    activeClass: 'bg-primary hover:brightness-110 border-primary text-primary-foreground shadow-lg',
  },
  {
    value: 'NQ',
    label: resultLabel('NQ'),
    activeClass:
      'bg-red-600 hover:bg-red-700 border-red-600 text-white shadow-lg shadow-red-600/20',
  },
  {
    value: 'ABS',
    label: resultLabel('ABS'),
    activeClass:
      'bg-purple-600 hover:bg-purple-700 border-purple-600 text-white shadow-lg shadow-purple-600/20',
  },
  {
    value: 'EX',
    label: resultLabel('EX'),
    activeClass:
      'bg-red-700 hover:bg-red-800 border-red-700 text-white shadow-lg shadow-red-700/20',
  },
  // Rare, official record: kept last and styled apart from Excused (MYK9-1011).
  { value: 'DQ', label: resultLabel('DQ'), activeClass: DQ_ACTIVE_CLASS },
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
  'min-h-12 px-1 rounded-xl border-2 text-sm font-semibold cursor-pointer transition-all duration-200 active:scale-[0.98]';

const chipInactive =
  'bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground';

const reasonChipBase =
  'min-h-11 px-4 py-2 rounded-full border-2 text-sm font-semibold cursor-pointer transition-all duration-200 hover:-translate-y-px active:scale-[0.98]';

export interface ResultChoiceChipsProps {
  selectedResult: QualifyingResult | null;
  onResultChange: (result: QualifyingResult) => void;
  faultCount?: number;
  onFaultCountChange?: (count: number) => void;
  nqReason?: string;
  onNQReasonChange?: (reason: string) => void;
  excusedReason?: string;
  onExcusedReasonChange?: (reason: string) => void;
  disqualifyReason?: string;
  onDisqualifyReasonChange?: (reason: string) => void;
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
  disqualifyReason = '',
  onDisqualifyReasonChange,
  sportType,
  level,
  hideFaults = false,
  className,
}) => {
  const nqReasons = NQ_REASONS[sportType || ''] || NQ_REASONS.default;
  const excusedReasons = EXCUSED_REASONS[sportType || ''] || EXCUSED_REASONS.default;
  const maxFaults = getMaxFaults(sportType, level);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
        {RESULT_OPTIONS.map(opt => {
          const isActive = selectedResult === opt.value;
          return (
            <button
              key={opt.value}
              className={cn(chipBase, isActive ? opt.activeClass : chipInactive)}
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
        <FaultStepper
          value={faultCount}
          onChange={onFaultCountChange}
          max={maxFaults === Infinity ? undefined : maxFaults}
          maxNote={`At maximum faults for ${level} level`}
        />
      )}

      {selectedResult === 'NQ' && onNQReasonChange && (
        <div className="flex flex-col items-center gap-2 py-1">
          <h3 className="text-base font-semibold text-center">Non-Qualifying Reason</h3>
          <div className="flex gap-2 justify-center flex-wrap">
            {nqReasons.map(reason => (
              <button
                key={reason}
                className={cn(
                  reasonChipBase,
                  nqReason === reason
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
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
        <div className="flex flex-col items-center gap-2 py-1">
          <h3 className="text-base font-semibold text-center">Excused Reason</h3>
          <div className="flex gap-2 justify-center flex-wrap">
            {excusedReasons.map(reason => (
              <button
                key={reason}
                className={cn(
                  reasonChipBase,
                  excusedReason === reason
                    ? 'bg-primary text-primary-foreground border-primary shadow-md'
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

      {selectedResult === 'DQ' && onDisqualifyReasonChange && (
        <DisqualifyReason
          sportType={sportType}
          reason={disqualifyReason}
          onReasonChange={onDisqualifyReasonChange}
        />
      )}
    </div>
  );
};
