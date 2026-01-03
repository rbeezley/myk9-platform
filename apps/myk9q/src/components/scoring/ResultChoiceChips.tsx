/**
 * Result Choice Chips Component
 *
 * Mobile-friendly choice chips for Nationals and Regular show results.
 * Supports sport-specific NQ/EX reasons for AKC, UKC, and ASCA.
 */

import React from 'react';
import { haptic } from '@/hooks/useHapticFeedback';
import './shared-scoring.css';

type NationalsResult = 'Qualified' | 'Absent' | 'Excused';
// type AllResults = NationalsResult | 'NQ' | 'Withdrawn';

type SportType = 'AKC_SCENT_WORK' | 'AKC_SCENT_WORK_NATIONAL' | 'AKC_FASTCAT' | 'UKC_NOSEWORK' | 'ASCA_SCENT_DETECTION';

// Sport-specific NQ reasons
const NQ_REASONS: Record<string, string[]> = {
  default: [
    'Incorrect Call',
    'Max Time',
    'Point to Hide',
    'Harsh Correction',
    'Significant Disruption'
  ],
  ASCA_SCENT_DETECTION: [
    // 9.2.8 - Incorrect call (Alert, naming location, no Finish, Finish with unfound hides)
    'Incorrect Call',
    // 9.2.2 - Exceeding maximum time
    'Exceeded Max Time',
    // 9.2.1 - Dog eliminates in search area
    'Dog Eliminated in Area',
    // 9.2.3 - Dog stops working and does not re-engage
    'Dog Stopped Working',
    // 9.2.4 - Dog destroys containers or boxes
    'Destroyed Containers',
    // 9.2.5 - Excessive disturbance of search area
    'Excessive Disturbance',
    // 9.2.6 - Dog scratches or damages vehicle/property
    'Damaged Property',
    // 9.2.7 - Handler cannot point to hide location
    'Couldn\'t Point to Hide'
  ]
};

// Sport-specific Excused reasons
const EXCUSED_REASONS: Record<string, string[]> = {
  default: [
    'Dog Eliminated in Area',
    'Handler Request',
    'Out of Control',
    'Overly Stressed',
    'Other'
  ],
  ASCA_SCENT_DETECTION: [
    // 9.3.1 - Dog shows extreme pain, stress, fear or aggression
    'Extreme Stress/Fear/Aggression',
    // 9.3.2 - Harsh handling or corrections
    'Harsh Handling',
    // 9.3.3 - Poor sportsmanship
    'Poor Sportsmanship',
    // 9.3.4 - Revealing hide location to another exhibitor
    'Revealed Hide Location'
  ]
};

interface ResultChoiceChipsProps {
  selectedResult: NationalsResult | null;
  onResultChange: (result: NationalsResult) => void;
  showNQ?: boolean;
  showEX?: boolean;
  onNQClick?: () => void;
  onEXClick?: () => void;
  _showEX?: boolean;
  _onEXClick?: () => void;
  // Additional props for enhanced functionality
  selectedResultInternal?: string; // Internal result value (Q, NQ, ABS, etc.)
  faultCount?: number;
  onFaultCountChange?: (count: number) => void;
  nqReason?: string;
  onNQReasonChange?: (reason: string) => void;
  excusedReason?: string;
  onExcusedReasonChange?: (reason: string) => void;
  isNationalsMode?: boolean; // Hide faults counter in nationals mode
  sportType?: SportType; // Sport type for reason selection
  level?: string; // Level for fault limit validation (ASCA)
}

/**
 * Get the maximum allowed faults for a sport/level combination.
 * ASCA: Novice/Open = 2 faults, Advanced/Excellent = 1 fault
 * Others: No limit (returns Infinity)
 */
function getMaxFaults(sportType?: SportType, level?: string): number {
  if (sportType === 'ASCA_SCENT_DETECTION' && level) {
    const lvl = level.toLowerCase();
    if (lvl.includes('novice') || lvl.includes('open')) {
      return 2;
    }
    if (lvl.includes('advanced') || lvl.includes('excellent')) {
      return 1;
    }
  }
  return Infinity; // No limit for other sports
}

export const ResultChoiceChips: React.FC<ResultChoiceChipsProps> = ({
  selectedResult,
  onResultChange,
  showNQ = false,
  _showEX = true,
  onNQClick,
  _onEXClick,
  selectedResultInternal,
  faultCount = 0,
  onFaultCountChange,
  nqReason = 'Incorrect Call',
  onNQReasonChange,
  excusedReason = 'Dog Eliminated in Area',
  onExcusedReasonChange,
  isNationalsMode = false,
  sportType,
  level
}) => {
  // Get sport-specific reasons
  const nqReasons = NQ_REASONS[sportType || ''] || NQ_REASONS.default;
  const excusedReasons = EXCUSED_REASONS[sportType || ''] || EXCUSED_REASONS.default;

  // Get max faults for sport/level
  const maxFaults = getMaxFaults(sportType, level);
  const isAtMaxFaults = faultCount >= maxFaults;

  return (
    <div className="result-choice-chips-container">
      {/* Main result choice chips - ordered: Qualified, NQ, Absent, Excused */}
      <div className="result-choice-chips">
        {/* Qualified */}
        <button
          className={`choice-chip success ${
            selectedResult === 'Qualified' ? 'selected' : ''
          }`}
          onClick={() => { haptic.medium(); onResultChange('Qualified'); }}
        >
          Qualified
        </button>

        {/* NQ - only show for regular shows */}
        {showNQ && (
          <button
            className={`choice-chip danger ${
              selectedResultInternal === 'NQ' ? 'selected' : ''
            }`}
            onClick={() => { haptic.medium(); onNQClick?.(); }}
          >
            NQ
          </button>
        )}

        {/* Absent */}
        <button
          className={`choice-chip warning ${
            selectedResult === 'Absent' ? 'selected' : ''
          }`}
          onClick={() => { haptic.medium(); onResultChange('Absent'); }}
        >
          Absent
        </button>

        {/* Excused */}
        <button
          className={`choice-chip danger ${
            selectedResult === 'Excused' ? 'selected' : ''
          }`}
          onClick={() => { haptic.medium(); onResultChange('Excused'); }}
        >
          Excused
        </button>
      </div>

      {/* Fault Counter - show when Qualified is selected (but not in nationals mode) */}
      {(selectedResult === 'Qualified' || selectedResultInternal === 'Q') && onFaultCountChange && !isNationalsMode && (
        <div className="fault-counter-section">
          <h3>
            Faults Count
            {maxFaults !== Infinity && (
              <span className="fault-limit-label"> (max {maxFaults})</span>
            )}
          </h3>
          <div className="fault-counter">
            <button
              className="fault-btn-counter"
              onClick={() => { haptic.light(); onFaultCountChange(Math.max(0, faultCount - 1)); }}
              disabled={faultCount === 0}
            >
              -
            </button>
            <span className={`fault-count-display ${isAtMaxFaults ? 'at-limit' : ''}`}>
              {faultCount}
            </span>
            <button
              className="fault-btn-counter"
              onClick={() => { haptic.light(); onFaultCountChange(faultCount + 1); }}
              disabled={isAtMaxFaults}
              title={isAtMaxFaults ? `Maximum ${maxFaults} faults allowed` : undefined}
            >
              +
            </button>
          </div>
          {isAtMaxFaults && (
            <div className="fault-limit-warning">
              At maximum faults for {level} level
            </div>
          )}
        </div>
      )}

      {/* NQ Reason Selection - show when NQ is selected */}
      {selectedResultInternal === 'NQ' && onNQReasonChange && (
        <div className="reason-selection">
          <h3>Non-Qualifying Reason</h3>
          <div className="reason-choice-chips">
            {nqReasons.map((reason) => (
              <button
                key={reason}
                className={`choice-chip small ${
                  nqReason === reason ? 'selected' : ''
                } ${reason === 'Incorrect Call' ? 'primary' : 'secondary'}`}
                onClick={() => { haptic.light(); onNQReasonChange(reason); }}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Excused Reason Selection - show when Excused is selected */}
      {(selectedResult === 'Excused' || selectedResultInternal === 'EX') && onExcusedReasonChange && (
        <div className="reason-selection">
          <h3>Excused Reason</h3>
          <div className="reason-choice-chips">
            {excusedReasons.map((reason) => (
              <button
                key={reason}
                className={`choice-chip small ${
                  excusedReason === reason ? 'selected' : ''
                } ${reason === 'Dog Eliminated in Area' ? 'primary' : 'secondary'}`}
                onClick={() => { haptic.light(); onExcusedReasonChange(reason); }}
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

export default ResultChoiceChips;