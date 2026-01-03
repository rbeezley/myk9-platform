/**
 * ASCA Scent Detection Scoresheet
 *
 * Australian Shepherd Club of America Scent Detection scoresheet.
 * Based on AKC Scent Work scoresheet architecture.
 *
 * @see src/pages/scoresheets/AKC/AKCScentWorkScoresheet.tsx
 */

import React, { useCallback, useMemo } from 'react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { ResultChoiceChips } from '../../../components/scoring/ResultChoiceChips';
import { HamburgerMenu, SyncIndicator, ArmbandBadge } from '../../../components/ui';
import { X, ClipboardCheck } from 'lucide-react';
import { parseSmartTime } from '../../../utils/timeInputParsing';
import { haptic } from '@/hooks/useHapticFeedback';

// Shared hooks from refactoring
import { useScoresheetCore, useEntryNavigation, useStopwatch } from '../hooks';

// Extracted components
import { ScoreConfirmationDialog } from '../components/ScoreConfirmationDialog';

import '../BaseScoresheet.css';
import '../AKC/scoresheet-shared.css';
import '../AKC/AKCScentWorkScoresheet-JudgeDialog.css';
import '../../../styles/containers.css';

export const ASCAScentDetectionScoresheet: React.FC = () => {
  // ==========================================================================
  // SHARED HOOKS
  // ==========================================================================

  // Core scoresheet state management
  const core = useScoresheetCore({ sportType: 'ASCA_SCENT_DETECTION' });

  // Entry navigation and loading
  const navigation = useEntryNavigation({
    classId: core.classId,
    entryId: core.entryId,
    sportType: 'ASCA_SCENT_DETECTION',
    onEntryLoaded: (entry, areas) => {
      core.setAreas(areas);
    },
    onTrialDateLoaded: core.setTrialDate,
    onTrialNumberLoaded: core.setTrialNumber,
    onLoadingChange: core.setIsLoadingEntry
  });

  // Destructure for convenience
  const {
    areas,
    qualifying, setQualifying,
    nonQualifyingReason, setNonQualifyingReason,
    faultCount, setFaultCount,
    isSubmitting,
    showConfirmation, setShowConfirmation,
    isLoadingEntry,
    trialDate, trialNumber,
    isSyncing, hasError,
    calculateTotalTime,
    handleAreaUpdate,
    submitScore,
    navigateBackWithRingCleanup,
    CelebrationModal
  } = core;

  const { currentEntry, getMaxTimeForArea } = navigation;

  // Settings for voice announcements
  const settings = useSettingsStore(state => state.settings);

  // ==========================================================================
  // STOPWATCH (using extracted hook)
  // ==========================================================================

  // Get the next empty area index for determining max time
  const getNextEmptyAreaIndex = useCallback((): number => {
    return areas.findIndex(area => !area.time);
  }, [areas]);

  // Get max time for the active area
  const activeAreaMaxTime = useMemo(() => {
    const activeAreaIndex = getNextEmptyAreaIndex();
    const areaIndex = activeAreaIndex >= 0 ? activeAreaIndex : 0;
    return getMaxTimeForArea(areaIndex);
  }, [getNextEmptyAreaIndex, getMaxTimeForArea]);

  // Use the extracted stopwatch hook
  const stopwatch = useStopwatch({
    maxTime: activeAreaMaxTime,
    level: currentEntry?.level,
    enableVoiceAnnouncements: settings.voiceAnnouncements,
    onTimeExpired: (formattedTime) => {
      // For single-area classes, auto-fill the time field when timer expires
      if (areas.length === 1) {
        handleAreaUpdate(0, 'time', formattedTime);
      }
      // Auto-set result to NQ with Max Time reason when timer expires
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    }
  });

  // ==========================================================================
  // TIMER CONTROLS
  // ==========================================================================

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    // For single-area classes, automatically copy time to search time field
    if (areas.length === 1) {
      handleAreaUpdate(0, 'time', stopwatch.formatTime(stopwatch.time));
    }
  }, [stopwatch, areas.length, handleAreaUpdate]);

  const recordTimeForArea = useCallback((areaIndex: number) => {
    handleAreaUpdate(areaIndex, 'time', stopwatch.formatTime(stopwatch.time));
    stopwatch.reset(); // Auto-reset stopwatch after recording
  }, [stopwatch, handleAreaUpdate]);

  // ==========================================================================
  // INPUT HELPERS
  // ==========================================================================

  const clearTimeInput = (index: number) => {
    handleAreaUpdate(index, 'time', '');
  };

  const handleSmartTimeInput = (index: number, rawInput: string) => {
    handleAreaUpdate(index, 'time', rawInput);
  };

  const handleTimeInputBlur = (index: number, rawInput: string) => {
    const parsedTime = parseSmartTime(rawInput);
    handleAreaUpdate(index, 'time', parsedTime);
  };

  // ==========================================================================
  // NAVIGATION & SUBMIT
  // ==========================================================================

  const handleNavigateWithRingCleanup = useCallback(() => {
    navigateBackWithRingCleanup(currentEntry);
  }, [navigateBackWithRingCleanup, currentEntry]);

  const handleEnhancedSubmit = async () => {
    if (!currentEntry) return;
    await submitScore(currentEntry);
  };

  // ==========================================================================
  // COMPUTED VALUES
  // ==========================================================================

  const warningMessage = stopwatch.getWarningMessage();
  const isAllTimesComplete = areas.every(area => area.time && area.time !== '');

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
                ASCA Scent Detection
              </h1>
              <div className="header-trial-info">
                <span>{trialDate}</span>
                <span className="trial-separator">•</span>
                <span>Trial {trialNumber}</span>
                <span className="trial-separator">•</span>
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
            <div className="scoresheet-timer-card">
              {/* Countdown ring - top left corner */}
              {(() => {
                const maxTimeMs = stopwatch.getMaxTimeMs();
                const remainingMs = stopwatch.getRemainingTimeMs();
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

                return maxTimeMs > 0 ? (
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
                ) : null;
              })()}

              <button
                className="timer-btn-reset btn-destructive"
                onClick={() => { haptic.heavy(); stopwatch.reset(); }}
                disabled={stopwatch.isRunning}
                title={stopwatch.isRunning ? "Reset disabled while timer is running" : "Reset timer"}
              >
                ⟲
              </button>

              <div className={`timer-display-large ${stopwatch.shouldShow30SecondWarning() ? 'warning' : ''} ${stopwatch.isTimeExpired() ? 'expired' : ''}`}>
                {stopwatch.formatTime(stopwatch.time)}
              </div>
              <div className="timer-countdown-display">
                {stopwatch.time > 0 ? (
                  <>Remaining: {stopwatch.getRemainingTime()}</>
                ) : (
                  <>Max Time: {activeAreaMaxTime}</>
                )}
              </div>
              <div className="timer-controls-flutter">
                {stopwatch.isRunning ? (
                  <button className="timer-btn-start stop btn-destructive" onClick={() => { haptic.heavy(); handleStopTimer(); }}>
                    Stop
                  </button>
                ) : stopwatch.time > 0 ? (
                  stopwatch.isTimeExpired() ? (
                    <button className="timer-btn-start reset btn-destructive" onClick={() => { haptic.heavy(); stopwatch.reset(); }} title="Reset timer">
                      Reset
                    </button>
                  ) : (
                    <button className="timer-btn-start resume btn-primary" onClick={() => { haptic.medium(); stopwatch.start(); }} title="Continue timing">
                      Resume
                    </button>
                  )
                ) : (
                  <button className="timer-btn-start start btn-primary" onClick={() => { haptic.heavy(); stopwatch.start(); }}>
                    Start
                  </button>
                )}
              </div>
            </div>

            {/* Timer Warning Message */}
            {warningMessage && (
              <div className={`timer-warning ${warningMessage === 'Time Expired' ? 'expired' : 'warning'}`}>
                {warningMessage}
              </div>
            )}

            {/* Time Inputs */}
            {areas.map((area, index) => (
              <div key={index} className="scoresheet-time-card">
                <div className="time-input-flutter">
                  {areas.length > 1 && (
                    <>
                      {!area.time ? (
                        <button
                          className={`area-record-btn ${getNextEmptyAreaIndex() === index && stopwatch.time > 0 && !stopwatch.isRunning ? 'next-in-sequence' : ''}`}
                          onClick={() => recordTimeForArea(index)}
                          title={`Record time from stopwatch for Area ${index + 1}`}
                        >
                          Record Area {index + 1}
                        </button>
                      ) : (
                        <div className="area-badge recorded">
                          Area {index + 1}
                        </div>
                      )}
                    </>
                  )}
                  <div className="scoresheet-time-input-wrapper">
                    <input
                      type="text"
                      value={area.time || ''}
                      onChange={(e) => handleSmartTimeInput(index, e.target.value)}
                      onBlur={(e) => handleTimeInputBlur(index, e.target.value)}
                      placeholder="Type: 12345 or 1:23.45"
                      className={`scoresheet-time-input ${areas.length === 1 ? 'single-area' : ''}`}
                    />
                    {area.time && (
                      <button
                        type="button"
                        className="scoresheet-time-clear-button"
                        onClick={() => clearTimeInput(index)}
                        title="Clear time"
                      >
                        <X size={16} style={{ width: '16px', height: '16px', flexShrink: 0 }} />
                      </button>
                    )}
                  </div>
                  <div className="max-time-display">
                    Max: {getMaxTimeForArea(index)}
                  </div>
                </div>
              </div>
            ))}

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
                    setNonQualifyingReason('Extreme Stress/Fear/Aggression');
                  }
                }}
                showNQ={true}
                showEX={true}
                onNQClick={() => {
                  setQualifying('NQ');
                  setNonQualifyingReason('Incorrect Call');
                }}
                onEXClick={() => {
                  setQualifying('EX');
                  setNonQualifyingReason('Extreme Stress/Fear/Aggression');
                }}
                selectedResultInternal={qualifying || ''}
                faultCount={faultCount}
                onFaultCountChange={setFaultCount}
                nqReason={nonQualifyingReason}
                onNQReasonChange={setNonQualifyingReason}
                excusedReason={nonQualifyingReason}
                onExcusedReasonChange={setNonQualifyingReason}
                isNationalsMode={false}
                sportType="ASCA_SCENT_DETECTION"
                level={currentEntry?.level}
              />
            </div>

            {/* Validation message */}
            {qualifying === 'Q' && !isAllTimesComplete && (
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
                ⚠️ All area times must be completed for a Qualified score
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
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isAllTimesComplete)}
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
              trialDate={trialDate}
              trialNumber={trialNumber}
              entry={currentEntry}
              qualifying={qualifying}
              areas={areas}
              faultCount={faultCount}
              nonQualifyingReason={nonQualifyingReason}
              calculateTotalTime={calculateTotalTime}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default ASCAScentDetectionScoresheet;
