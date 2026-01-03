/**
 * UKC Nosework Scoresheet
 *
 * Scoring system: Time + Faults
 * - Single search time for Novice/Advanced (single hide)
 * - Dual timer for Superior/Master/Elite (multiple hides):
 *   - Search Time: Pausable, accumulated active searching
 *   - Element Time: Continuous, total run duration
 * - Q/NQ based on faults and time
 *
 * Refactored to use shared hooks (2025-12-21):
 * - Uses useEntryNavigation for consistent entry loading
 * - Uses useScoresheetCore for core state management
 * - Matches AKC scoresheet styling patterns
 *
 * Dual stopwatch added (2025-12-23):
 * - See docs/plans/2025-12-23-ukc-nosework-dual-stopwatch-design.md
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { HamburgerMenu, SyncIndicator, ArmbandBadge } from '../../../components/ui';
import { ResultChoiceChips } from '../../../components/scoring/ResultChoiceChips';
import { ClipboardCheck, X } from 'lucide-react';
import { parseSmartTime } from '../../../utils/timeInputParsing';
import { haptic } from '@/hooks/useHapticFeedback';

// Shared hooks from refactoring
import { useScoresheetCore, useEntryNavigation, useStopwatch, useElementTimer } from '../hooks';

// Extracted components
import { ScoreConfirmationDialog } from '../components/ScoreConfirmationDialog';

import '../BaseScoresheet.css';
import '../AKC/scoresheet-shared.css';
import '../AKC/AKCScentWorkScoresheet-JudgeDialog.css';
import './UKCNoseworkScoresheet.css';

// ==========================================================================
// HELPER FUNCTIONS
// ==========================================================================

/**
 * Check if level requires dual timer mode (multiple hides)
 */
function isDualTimerLevel(level?: string): boolean {
  if (!level) return false;
  const normalizedLevel = level.toLowerCase();
  return ['superior', 'master', 'elite'].includes(normalizedLevel);
}

/**
 * Calculate remaining time from element time (for dual timer mode)
 * Returns formatted string "M:SS.ss"
 */
function getRemainingFromElement(elementTimeMs: number, maxTime: string): string {
  // Parse max time string (format: "3:00.00" or "3:00")
  const parts = maxTime.split(':');
  const minutes = parseFloat(parts[0]);
  const seconds = parseFloat(parts[1] || '0');
  const maxTimeMs = (minutes * 60 + seconds) * 1000;

  // Calculate remaining
  const remainingMs = Math.max(0, maxTimeMs - elementTimeMs);
  const remainingSeconds = remainingMs / 1000;
  const mins = Math.floor(remainingSeconds / 60);
  const secs = (remainingSeconds % 60).toFixed(2);

  return `${mins}:${secs.padStart(5, '0')}`;
}

// ==========================================================================
// EXTRACTED SUB-COMPONENTS (to reduce cyclomatic complexity)
// ==========================================================================

interface SingleTimerControlsProps {
  isRunning: boolean;
  time: number;
  isTimeExpired: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
}

/**
 * Timer controls for Novice/Advanced (single timer mode)
 */
const SingleTimerControls: React.FC<SingleTimerControlsProps> = ({
  isRunning, time, isTimeExpired, onStart, onStop, onReset
}) => {
  if (isRunning) {
    return (
      <button className="timer-btn-start stop btn-destructive" onClick={() => { haptic.heavy(); onStop(); }}>
        Stop
      </button>
    );
  }
  if (time > 0 && isTimeExpired) {
    return (
      <button className="timer-btn-start reset btn-destructive" onClick={() => { haptic.heavy(); onReset(); }} title="Reset timer">
        Reset
      </button>
    );
  }
  if (time > 0) {
    return (
      <button className="timer-btn-start resume btn-primary" onClick={() => { haptic.medium(); onStart(); }} title="Continue timing">
        Resume
      </button>
    );
  }
  return (
    <button className="timer-btn-start start btn-primary" onClick={() => { haptic.heavy(); onStart(); }}>
      Start
    </button>
  );
};

interface DualTimerControlsProps {
  searchIsRunning: boolean;
  elementIsRunning: boolean;
  searchTime: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onResumeAll: () => void;
  onReset: () => void;
}

/**
 * Timer controls for Superior/Master/Elite (dual timer mode)
 * Note: Finish button is rendered in the element-time-row, not here
 */
const DualTimerControls: React.FC<DualTimerControlsProps> = ({
  searchIsRunning, elementIsRunning, searchTime,
  onStart, onPause, onResume, onResumeAll, onReset
}) => {
  // Not started yet
  if (searchTime === 0 && !searchIsRunning && !elementIsRunning) {
    return (
      <button className="timer-btn-start start btn-primary" onClick={() => { haptic.heavy(); onStart(); }}>
        Start
      </button>
    );
  }

  // Both stopped (after Finish)
  if (!searchIsRunning && !elementIsRunning && searchTime > 0) {
    return (
      <div className="dual-timer-controls">
        <button className="timer-btn-start resume btn-primary" onClick={() => { haptic.medium(); onResumeAll(); }} title="Resume both timers">
          Resume
        </button>
        <button className="timer-btn-start reset btn-destructive" onClick={() => { haptic.heavy(); onReset(); }} title="Reset both timers">
          Reset
        </button>
      </div>
    );
  }

  // Search paused, Element running (between alerts)
  if (!searchIsRunning && elementIsRunning) {
    return (
      <button className="timer-btn-start resume btn-primary" onClick={() => { haptic.medium(); onResume(); }} title="Resume search timing">
        Resume
      </button>
    );
  }

  // Both running (actively searching)
  return (
    <button className="timer-btn-start stop btn-destructive" onClick={() => { haptic.heavy(); onPause(); }} title="Pause search time (Element continues)">
      Pause
    </button>
  );
};

interface TimerSectionProps {
  dualTimerMode: boolean;
  stopwatch: ReturnType<typeof useStopwatch>;
  elementTimer: ReturnType<typeof useElementTimer>;
  onDualReset: () => void;
  onDualStart: () => void;
  onDualPause: () => void;
  onDualResume: () => void;
  onDualFinish: () => void;
  onDualResumeAll: () => void;
  onSingleStop: () => void;
  maxTime: string;
}

/**
 * Timer section component - handles both single and dual timer modes
 */
const TimerSection: React.FC<TimerSectionProps> = ({
  dualTimerMode,
  stopwatch,
  elementTimer,
  onDualReset,
  onDualStart,
  onDualPause,
  onDualResume,
  onDualFinish,
  onDualResumeAll,
  onSingleStop,
  maxTime
}) => {
  // Progress ring calculations
  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingMs = dualTimerMode
    ? Math.max(0, maxTimeMs - elementTimer.time)
    : stopwatch.getRemainingTimeMs();
  const progress = maxTimeMs > 0 ? Math.max(0, remainingMs / maxTimeMs) : 1;
  const remainingSeconds = remainingMs / 1000;
  const ringSize = 40;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444';
    if (remainingSeconds <= 30) return '#ef4444';
    if (remainingSeconds <= 40) return '#f59e0b';
    return '#22c55e';
  };

  return (
  <div className="scoresheet-timer-card">
    {/* Countdown ring - top left corner */}
    {maxTimeMs > 0 && (
      <svg
        className="timer-countdown-ring-corner"
        width={ringSize}
        height={ringSize}
        viewBox={`0 0 ${ringSize} ${ringSize}`}
      >
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          fill="none"
          stroke={getRingColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
        />
      </svg>
    )}

    {/* Dual Timer Mode: Element Time row with Finish button */}
    {dualTimerMode && (
      <div className="element-time-row">
        <span className="element-time-label">Element:</span>
        <span className={`element-time-value ${elementTimer.isRunning ? 'running' : ''}`}>
          {elementTimer.formatTime(elementTimer.time)}
        </span>
        {(stopwatch.isRunning || elementTimer.isRunning) && (
          <button
            className="timer-btn-finish"
            onClick={onDualFinish}
            title="Stop both timers (final alert)"
          >
            Finish
          </button>
        )}
      </div>
    )}

    {/* Main Search Time Display */}
    <div className={`timer-display-large ${stopwatch.shouldShow30SecondWarning() ? 'warning' : ''} ${stopwatch.isTimeExpired() ? 'expired' : ''}`}>
      {stopwatch.formatTime(stopwatch.time)}
    </div>

    {/* Remaining Time / Max Time */}
    <div className="timer-countdown-display">
      {stopwatch.time > 0 || elementTimer.time > 0 ? (
        <>Remaining: {dualTimerMode ? getRemainingFromElement(elementTimer.time, maxTime) : stopwatch.getRemainingTime()}</>
      ) : (
        <>Max Time: {maxTime}</>
      )}
    </div>

    {/* Timer Controls */}
    <div className="timer-controls-flutter">
      {dualTimerMode ? (
        <DualTimerControls
          searchIsRunning={stopwatch.isRunning}
          elementIsRunning={elementTimer.isRunning}
          searchTime={stopwatch.time}
          onStart={onDualStart}
          onPause={onDualPause}
          onResume={onDualResume}
          onResumeAll={onDualResumeAll}
          onReset={onDualReset}
        />
      ) : (
        <SingleTimerControls
          isRunning={stopwatch.isRunning}
          time={stopwatch.time}
          isTimeExpired={stopwatch.isTimeExpired()}
          onStart={stopwatch.start}
          onStop={onSingleStop}
          onReset={stopwatch.reset}
        />
      )}
    </div>
  </div>
  );
};

// ==========================================================================
// MAIN COMPONENT
// ==========================================================================

export const UKCNoseworkScoresheet: React.FC = () => {
  // ==========================================================================
  // SHARED HOOKS
  // ==========================================================================

  // Core scoresheet state management
  const core = useScoresheetCore({ sportType: 'UKC_NOSEWORK' });

  // Entry navigation and loading
  const navigation = useEntryNavigation({
    classId: core.classId,
    entryId: core.entryId,
    sportType: 'UKC_NOSEWORK',
    onLoadingChange: core.setIsLoadingEntry
  });

  // Destructure for convenience
  const {
    qualifying, setQualifying,
    nonQualifyingReason, setNonQualifyingReason,
    faultCount, setFaultCount,
    isSubmitting,
    showConfirmation, setShowConfirmation,
    isLoadingEntry,
    isSyncing, hasError,
    navigateBackWithRingCleanup,
    CelebrationModal
  } = core;

  const { currentEntry } = navigation;

  // Settings for voice announcements
  const settings = useSettingsStore(state => state.settings);

  // ==========================================================================
  // UKC-SPECIFIC STATE
  // ==========================================================================

  const [searchTime, setSearchTime] = useState<string>('');
  const [elementTime, setElementTime] = useState<string>('');

  // Default max time for UKC Nosework (3 minutes)
  const maxTime = '3:00.00';

  // Determine if we need dual timer mode
  const dualTimerMode = useMemo(
    () => isDualTimerLevel(currentEntry?.level),
    [currentEntry?.level]
  );

  // ==========================================================================
  // STOPWATCH (Search Time - pausable)
  // ==========================================================================

  const stopwatch = useStopwatch({
    maxTime: maxTime,
    level: currentEntry?.level,
    enableVoiceAnnouncements: settings.voiceAnnouncements,
    onTimeExpired: (formattedTime) => {
      // Auto-fill the time field when timer expires
      setSearchTime(formattedTime);
      if (dualTimerMode) {
        // Also capture element time
        setElementTime(elementTimer.formatTime(elementTimer.time));
        elementTimer.stop();
      }
      // Auto-set result to NQ with Max Time reason
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    }
  });

  // ==========================================================================
  // ELEMENT TIMER (continuous - for Superior/Master/Elite)
  // ==========================================================================

  const elementTimer = useElementTimer();

  // ==========================================================================
  // TIMER CONTROLS - SINGLE MODE (Novice/Advanced)
  // ==========================================================================

  const handleSingleStop = useCallback(() => {
    stopwatch.pause();
    setSearchTime(stopwatch.formatTime(stopwatch.time));
  }, [stopwatch]);

  // ==========================================================================
  // TIMER CONTROLS - DUAL MODE (Superior/Master/Elite)
  // ==========================================================================

  // Start both timers
  const handleDualStart = useCallback(() => {
    stopwatch.start();
    elementTimer.start();
  }, [stopwatch, elementTimer]);

  // Pause search only (element continues)
  const handleDualPause = useCallback(() => {
    stopwatch.pause();
    // Update search time display
    setSearchTime(stopwatch.formatTime(stopwatch.time));
  }, [stopwatch]);

  // Resume search only
  const handleDualResume = useCallback(() => {
    stopwatch.start();
  }, [stopwatch]);

  // Finish - stop BOTH timers
  const handleDualFinish = useCallback(() => {
    stopwatch.pause();
    elementTimer.stop();
    // Capture both times
    setSearchTime(stopwatch.formatTime(stopwatch.time));
    setElementTime(elementTimer.formatTime(elementTimer.time));
  }, [stopwatch, elementTimer]);

  // Resume both timers (after Finish, for edge cases)
  const handleDualResumeAll = useCallback(() => {
    stopwatch.start();
    elementTimer.resume();
  }, [stopwatch, elementTimer]);

  // Reset both timers
  const handleDualReset = useCallback(() => {
    stopwatch.reset();
    elementTimer.reset();
    setSearchTime('');
    setElementTime('');
  }, [stopwatch, elementTimer]);

  // ==========================================================================
  // INPUT HELPERS
  // ==========================================================================

  const clearTimeInput = () => {
    setSearchTime('');
  };

  const handleSmartTimeInput = (rawInput: string) => {
    setSearchTime(rawInput);
  };

  const handleTimeInputBlur = (rawInput: string) => {
    const parsedTime = parseSmartTime(rawInput);
    setSearchTime(parsedTime);
  };

  // ==========================================================================
  // NAVIGATION & SUBMIT
  // ==========================================================================

  const handleNavigateWithRingCleanup = useCallback(() => {
    navigateBackWithRingCleanup(currentEntry);
  }, [navigateBackWithRingCleanup, currentEntry]);

  const handleEnhancedSubmit = async () => {
    if (!currentEntry) return;

    // Submit score using the shared core hook's submitScore
    await core.submitScore(currentEntry, {
      resultText: qualifying || 'NQ',
      searchTime: searchTime,
      faultCount: faultCount,
      nonQualifyingReason: qualifying !== 'Q' ? nonQualifyingReason : undefined,
      // UKC doesn't use areas, so we pass empty
      areas: {},
      correctCount: 0,
      incorrectCount: 0,
      finishCallErrors: 0,
      points: 0,
      areaTimes: [searchTime]
    });
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  const warningMessage = stopwatch.getWarningMessage();

  // ==========================================================================
  // CONDITIONAL RENDERING
  // ==========================================================================

  if (isLoadingEntry) {
    return (
      <div className="scoresheet-container">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!currentEntry) {
    return null;
  }

  return (
    <>
      {CelebrationModal}
      <div className="scoresheet-container">
        <div className="scoresheet">
          {/* Header */}
          <header className="page-header mobile-header">
            <HamburgerMenu
              backNavigation={{
                label: "Back to Entry List",
                action: handleNavigateWithRingCleanup
              }}
              currentPage="entries"
            />
            <div className="header-content">
              <h1>
                <ClipboardCheck className="title-icon" />
                UKC Nosework
              </h1>
              <div className="header-trial-info">
                <span>{currentEntry.element} {currentEntry.level}</span>
              </div>
            </div>
          </header>

          {/* Content Wrapper */}
          <div className="scoresheet-content-wrapper">
            {/* Dog Info Card */}
            <div className="scoresheet-dog-info-card">
              <ArmbandBadge number={currentEntry.armband} />
              <div className="scoresheet-dog-details">
                <div className="scoresheet-dog-name">{currentEntry.callName}</div>
                <div className="scoresheet-dog-breed">{currentEntry.breed}</div>
                <div className="scoresheet-dog-handler">Handler: {currentEntry.handler}</div>
              </div>
            </div>

            {/* Timer Section */}
            <TimerSection
              dualTimerMode={dualTimerMode}
              stopwatch={stopwatch}
              elementTimer={elementTimer}
              onDualReset={handleDualReset}
              onDualStart={handleDualStart}
              onDualPause={handleDualPause}
              onDualResume={handleDualResume}
              onDualFinish={handleDualFinish}
              onDualResumeAll={handleDualResumeAll}
              onSingleStop={handleSingleStop}
              maxTime={maxTime}
            />

            {/* Timer Warning Message */}
            {warningMessage && (
              <div className={`timer-warning ${warningMessage === 'Time Expired' ? 'expired' : 'warning'}`}>
                {warningMessage}
              </div>
            )}

            {/* Time Input */}
            <div className="scoresheet-time-card">
              <div className="time-input-flutter">
                <div className="scoresheet-time-input-wrapper">
                  <input
                    type="text"
                    value={searchTime}
                    onChange={(e) => handleSmartTimeInput(e.target.value)}
                    onBlur={(e) => handleTimeInputBlur(e.target.value)}
                    placeholder="Type: 12345 or 1:23.45"
                    className="scoresheet-time-input single-area"
                  />
                  {searchTime && (
                    <button
                      type="button"
                      className="scoresheet-time-clear-button"
                      onClick={clearTimeInput}
                      title="Clear time"
                    >
                      <X size={16} style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                    </button>
                  )}
                </div>
                <div className="max-time-display">
                  Max: {maxTime}
                </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="results-section">
              <ResultChoiceChips
                selectedResult={
                  qualifying === 'Q' ? 'Qualified' :
                  qualifying === 'ABS' ? 'Absent' :
                  qualifying === 'EX' ? 'Excused' :
                  null
                }
                onResultChange={(result) => {
                  if (result === 'Qualified') {
                    setQualifying('Q');
                  } else if (result === 'Absent') {
                    setQualifying('ABS');
                    setNonQualifyingReason('Absent');
                  } else if (result === 'Excused') {
                    setQualifying('EX');
                    setNonQualifyingReason('Excused');
                  }
                }}
                showNQ={true}
                showEX={true}
                onNQClick={() => {
                  setQualifying('NQ');
                  setNonQualifyingReason('Incorrect call selected');
                }}
                onEXClick={() => {
                  setQualifying('EX');
                  setNonQualifyingReason('Dog eliminated in area');
                }}
                selectedResultInternal={qualifying || ''}
                faultCount={faultCount}
                onFaultCountChange={setFaultCount}
                nqReason={nonQualifyingReason}
                onNQReasonChange={setNonQualifyingReason}
                excusedReason={nonQualifyingReason}
                onExcusedReasonChange={setNonQualifyingReason}
                isNationalsMode={false}
              />
            </div>

            {/* Validation message */}
            {qualifying === 'Q' && !searchTime && (
              <div style={{
                padding: '8px 16px',
                marginBottom: '8px',
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '6px',
                color: '#92400e',
                fontSize: '14px',
                textAlign: 'center'
              }}>
                Search time is required for a Qualified score
              </div>
            )}

            {/* Action Buttons */}
            <div className="scoresheet-actions">
              <button className="scoresheet-btn-cancel" onClick={handleNavigateWithRingCleanup}>
                Cancel
              </button>
              <button
                className="scoresheet-btn-save btn-primary"
                onClick={() => { haptic.medium(); setShowConfirmation(true); }}
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !searchTime)}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>

            {/* Sync Status */}
            {(isSyncing || hasError) && (
              <div style={{ textAlign: 'center', marginTop: '-8px', marginBottom: '8px' }}>
                {isSyncing && <SyncIndicator status="syncing" />}
                {hasError && <SyncIndicator status="error" />}
              </div>
            )}

            {/* Confirmation Dialog */}
            <ScoreConfirmationDialog
              isOpen={showConfirmation}
              onClose={() => setShowConfirmation(false)}
              onConfirm={handleEnhancedSubmit}
              isSubmitting={isSubmitting}
              trialDate=""
              trialNumber=""
              entry={currentEntry}
              qualifying={qualifying}
              areas={[{ areaName: 'Search', time: searchTime, found: true, correct: true }]}
              faultCount={faultCount}
              nonQualifyingReason={nonQualifyingReason}
              calculateTotalTime={() => searchTime}
              elementTime={dualTimerMode ? elementTime : undefined}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default UKCNoseworkScoresheet;
