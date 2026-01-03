/**
 * AKC Nationals Scent Work Scoresheet
 *
 * Nationals-only scoresheet with simplified scoring:
 * - Point counter components for Nationals scoring
 * - Qualifying results: Qualified, Absent, Excused (no NQ)
 * - Dual storage: tbl_entry_queue + nationals_scores
 * - Auto-calculated areas based on alerts
 *
 * Refactored to use shared hooks for reduced code duplication.
 * @see docs/SCORESHEET_REFACTORING_PLAN.md
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAuth } from '../../../contexts/AuthContext';
import { NationalsCounterSimple } from '../../../components/scoring/NationalsCounterSimple';
import { ResultChoiceChips } from '../../../components/scoring/ResultChoiceChips';
import { HamburgerMenu, SyncIndicator, ArmbandBadge } from '../../../components/ui';
import { X, ClipboardCheck } from 'lucide-react';
import { nationalsScoring } from '../../../services/nationalsScoring';
import voiceAnnouncementService from '../../../services/voiceAnnouncementService';
import { parseSmartTime } from '../../../utils/timeInputParsing';
import { haptic } from '@/hooks/useHapticFeedback';

// Shared hooks from refactoring
import { useScoresheetCore, useEntryNavigation } from '../hooks';

// Extracted sub-components (complexity refactoring)
import { NationalsTimerSection } from './components/NationalsTimerSection';
import { NationalsConfirmationDialog } from './components/NationalsConfirmationDialog';
import { logger } from '@/utils/logger';

// Extracted helpers (complexity refactoring)
import {
  type NationalsQualifyingResult,
  formatStopwatchTime,
  convertTimeToSeconds,
  parseMaxTimeToMs,
  calculateNationalsPoints,
  mapElementToNationalsType,
  shouldShow30SecondWarning,
  isTimeExpired,
  getTimerWarningMessage,
  getRemainingTimeString,
  createExcusedAreas,
  calculateTotalMaxTime,
  updateAreasFromAlerts
} from './AKCNationalsScoresheetHelpers';

import '../BaseScoresheet.css';
import './AKCScentWorkScoresheet-Nationals.css';
import './scoresheet-shared.css';
import './AKCScentWorkScoresheet-JudgeDialog.css';
import '../../../styles/containers.css';
import '../../../components/wireframes/NationalsWireframe.css';

export const AKCNationalsScoresheet: React.FC = () => {
  const { showContext } = useAuth();

  // ==========================================================================
  // SHARED HOOKS (from refactoring)
  // ==========================================================================

  // Core scoresheet state management
  const core = useScoresheetCore({
    sportType: 'AKC_SCENT_WORK_NATIONAL',
    isNationals: true
  });

  // Entry navigation and loading
  const navigation = useEntryNavigation({
    classId: core.classId,
    entryId: core.entryId,
    isNationals: true,
    sportType: 'AKC_SCENT_WORK_NATIONAL',
    onEntryLoaded: (entry, areas) => {
      core.setAreas(areas);
    },
    onTrialDateLoaded: core.setTrialDate,
    onTrialNumberLoaded: core.setTrialNumber,
    onLoadingChange: core.setIsLoadingEntry
  });

  // Destructure for convenience
  const {
    areas, setAreas,
    faultCount, setFaultCount,
    isSubmitting,
    showConfirmation, setShowConfirmation,
    isLoadingEntry,
    trialDate, trialNumber,
    isSyncing, hasError,
    calculateTotalTime,
    handleAreaUpdate,
    navigateBackWithRingCleanup,
    CelebrationModal
  } = core;

  const {
    currentEntry,
    getMaxTimeForArea
  } = navigation;

  // ==========================================================================
  // NATIONALS-SPECIFIC STATE
  // ==========================================================================

  const [qualifying, setQualifying] = useState<NationalsQualifyingResult | ''>('');
  const [alertsCorrect, setAlertsCorrect] = useState(0);
  const [alertsIncorrect, setAlertsIncorrect] = useState(0);
  const [finishCallErrors, setFinishCallErrors] = useState(0);
  const [isExcused, setIsExcused] = useState(false);
  const [totalTime, setTotalTime] = useState<string>('');

  // ==========================================================================
  // TIMER STATE (unique to this component)
  // ==========================================================================

  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [isStopwatchRunning, setIsStopwatchRunning] = useState(false);
  const [stopwatchInterval, setStopwatchInterval] = useState<NodeJS.Timeout | null>(null);

  // Settings for voice announcements
  const settings = useSettingsStore(state => state.settings);

  // Ref for stopwatch cleanup
  const stopwatchIntervalRef = useRef(stopwatchInterval);

  useEffect(() => {
    stopwatchIntervalRef.current = stopwatchInterval;
  }, [stopwatchInterval]);

  // Cleanup stopwatch on unmount
  useEffect(() => {
    return () => {
      const interval = stopwatchIntervalRef.current;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  // ==========================================================================
  // NATIONALS-SPECIFIC CALCULATIONS (use imported helpers)
  // ==========================================================================

  // Calculate Nationals points using imported helper
  const getNationalsPoints = useCallback(() => {
    return calculateNationalsPoints(isExcused, alertsCorrect, alertsIncorrect, faultCount, finishCallErrors);
  }, [isExcused, alertsCorrect, alertsIncorrect, faultCount, finishCallErrors]);

  // Auto-calculate areas based on alerts using imported helper
  useEffect(() => {
    if (areas.length > 0) {
      const updatedAreas = updateAreasFromAlerts(areas, alertsCorrect, alertsIncorrect);
      setAreas(updatedAreas);
    }
  }, [alertsCorrect, alertsIncorrect]);

  // Handle result change with special handling for Excused
  // Note: State setters from useState are stable, but included to satisfy React Compiler
  const handleResultChange = useCallback((result: NationalsQualifyingResult | '') => {
    setQualifying(result);

    if (result === 'Excused') {
      setIsExcused(true);

      // Nationals: zero points and max search time
      setAlertsCorrect(0);
      setAlertsIncorrect(0);
      setFinishCallErrors(0);
      setFaultCount(0);

      // Set max search time for all areas using helper
      const updatedAreas = createExcusedAreas(areas, getMaxTimeForArea);
      setAreas(updatedAreas);

      // Set total time to sum of all max times using helper
      const totalMaxTimeStr = calculateTotalMaxTime(updatedAreas, convertTimeToSeconds);
      setTotalTime(totalMaxTimeStr);
    } else {
      setIsExcused(false);
    }
  }, [
    areas, getMaxTimeForArea, setAreas, setTotalTime,
    setQualifying, setIsExcused, setAlertsCorrect, setAlertsIncorrect, setFinishCallErrors, setFaultCount
  ]);

  // ==========================================================================
  // NATIONALS-SPECIFIC HELPERS
  // ==========================================================================

  // Note: mapElementToNationalsType is now imported from helpers

  const getCurrentDay = useCallback((): 1 | 2 | 3 => {
    // This should be determined by your trial/class data
    // For now, return 1 as default
    return 1;
  }, []);

  // ==========================================================================
  // SUBMIT HANDLER (Nationals-specific with dual submission)
  // ==========================================================================

  const handleEnhancedSubmit = useCallback(async () => {
    if (!currentEntry) {
      return;
    }

    setShowConfirmation(false);

    // Prepare score data
    const finalQualifying = qualifying || 'Qualified';
    const finalTotalTime = totalTime || calculateTotalTime() || '0.00';

    // Use core's submitScore but with Nationals-specific data
    await core.submitScore(currentEntry, {
      correctCount: alertsCorrect,
      incorrectCount: alertsIncorrect,
      finishCallErrors: finishCallErrors,
      points: getNationalsPoints()
    });

    // Also submit to nationals_scores table for TV dashboard
    if (showContext?.licenseKey) {
      try {
        const timeInSeconds = convertTimeToSeconds(finalTotalTime || '0');
        const elementType = mapElementToNationalsType(currentEntry.element || '');
        const day = getCurrentDay();

        await nationalsScoring.submitScore({
          entry_id: currentEntry.id,
          armband: currentEntry.armband.toString(),
          element_type: elementType,
          day: day,
          alerts_correct: alertsCorrect,
          alerts_incorrect: alertsIncorrect,
          faults: faultCount,
          finish_call_errors: finishCallErrors,
          time_seconds: timeInSeconds,
          excused: isExcused || finalQualifying === 'Excused',
          notes: undefined
        });

      } catch (nationalsError) {
        logger.error('❌ Failed to submit Nationals score:', nationalsError);
        // Don't fail the whole submission - regular score still saved
      }
    }
  }, [
    currentEntry,
    qualifying,
    totalTime,
    alertsCorrect,
    alertsIncorrect,
    finishCallErrors,
    faultCount,
    isExcused,
    showContext?.licenseKey,
    calculateTotalTime,
    getNationalsPoints,
    getCurrentDay,
    core,
    setShowConfirmation
  ]);

  // ==========================================================================
  // TIMER FUNCTIONS (formatStopwatchTime imported from helpers)
  // ==========================================================================

  const getNextEmptyAreaIndex = useCallback((): number => {
    return areas.findIndex(area => !area.time);
  }, [areas]);

  const getRemainingTime = useCallback((): string => {
    const activeAreaIndex = getNextEmptyAreaIndex();
    const areaIndex = activeAreaIndex >= 0 ? activeAreaIndex : 0;
    const maxTimeStr = getMaxTimeForArea(areaIndex);
    if (!maxTimeStr) return '';

    const maxTimeMs = parseMaxTimeToMs(maxTimeStr);
    return getRemainingTimeString(stopwatchTime, maxTimeMs);
  }, [getNextEmptyAreaIndex, getMaxTimeForArea, stopwatchTime]);

  const resetStopwatch = useCallback(() => {
    setStopwatchTime(0);
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
      setStopwatchInterval(null);
    }
    setIsStopwatchRunning(false);
  }, [stopwatchInterval]);

  const startStopwatch = useCallback(() => {
    setIsStopwatchRunning(true);
    const startTime = Date.now() - stopwatchTime;
    const interval = setInterval(() => {
      const currentTime = Date.now() - startTime;
      setStopwatchTime(currentTime);

      // Auto-stop when time expires
      const activeAreaIndex = areas.findIndex(area => !area.time);
      const areaIndex = activeAreaIndex >= 0 ? activeAreaIndex : 0;
      const maxTimeStr = getMaxTimeForArea(areaIndex);
      if (maxTimeStr) {
        const maxTimeMs = parseMaxTimeToMs(maxTimeStr);

        if (currentTime >= maxTimeMs) {
          setIsStopwatchRunning(false);
          clearInterval(interval);
          setStopwatchInterval(null);
          setStopwatchTime(maxTimeMs);

          if (areas.length === 1) {
            const formattedMaxTime = formatStopwatchTime(maxTimeMs);
            handleAreaUpdate(0, 'time', formattedMaxTime);
          }
        }
      }
    }, 10);
    setStopwatchInterval(interval);
  }, [stopwatchTime, areas, getMaxTimeForArea, handleAreaUpdate]);

  const stopStopwatch = useCallback(() => {
    setIsStopwatchRunning(false);
    if (stopwatchInterval) {
      clearInterval(stopwatchInterval);
      setStopwatchInterval(null);
    }

    if (areas.length === 1) {
      const formattedTime = formatStopwatchTime(stopwatchTime);
      handleAreaUpdate(0, 'time', formattedTime);
    }
  }, [stopwatchInterval, areas.length, stopwatchTime, handleAreaUpdate]);

  const recordTimeForArea = useCallback((areaIndex: number) => {
    const formattedTime = formatStopwatchTime(stopwatchTime);
    handleAreaUpdate(areaIndex, 'time', formattedTime);
    resetStopwatch();
  }, [stopwatchTime, handleAreaUpdate, resetStopwatch]);

  // ==========================================================================
  // 30-SECOND WARNING (using imported helpers)
  // ==========================================================================

  // Get current max time in milliseconds for active area
  const getCurrentMaxTimeMs = useCallback((): number => {
    const activeAreaIndex = getNextEmptyAreaIndex();
    const areaIndex = activeAreaIndex >= 0 ? activeAreaIndex : 0;
    const maxTimeStr = getMaxTimeForArea(areaIndex);
    return maxTimeStr ? parseMaxTimeToMs(maxTimeStr) : 0;
  }, [getNextEmptyAreaIndex, getMaxTimeForArea]);

  const checkShow30SecondWarning = useCallback((): boolean => {
    const maxTimeMs = getCurrentMaxTimeMs();
    return shouldShow30SecondWarning({
      isStopwatchRunning,
      stopwatchTime,
      level: currentEntry?.level || '',
      maxTimeMs
    });
  }, [isStopwatchRunning, stopwatchTime, currentEntry?.level, getCurrentMaxTimeMs]);

  const checkTimeExpired = useCallback((): boolean => {
    const maxTimeMs = getCurrentMaxTimeMs();
    return isTimeExpired(stopwatchTime, maxTimeMs);
  }, [stopwatchTime, getCurrentMaxTimeMs]);

  const getWarningMessage = useCallback((): string | null => {
    const maxTimeMs = getCurrentMaxTimeMs();
    return getTimerWarningMessage(stopwatchTime, maxTimeMs, {
      isStopwatchRunning,
      stopwatchTime,
      level: currentEntry?.level || '',
      maxTimeMs
    });
  }, [stopwatchTime, isStopwatchRunning, currentEntry?.level, getCurrentMaxTimeMs]);

  // Voice announcement for 30-second warning
  const has30SecondAnnouncedRef = useRef(false);

  useEffect(() => {
    if (!settings.voiceAnnouncements) {
      return;
    }

    if (!isStopwatchRunning) {
      has30SecondAnnouncedRef.current = false;
      return;
    }

    const level = currentEntry?.level?.toLowerCase() || '';
    if (level === 'master' || level === 'masters') return;

    const maxTimeMs = getCurrentMaxTimeMs();
    if (maxTimeMs <= 0) return;

    const remainingMs = maxTimeMs - stopwatchTime;
    const remainingSeconds = Math.floor(remainingMs / 1000);

    if (remainingSeconds <= 30 && remainingSeconds > 29 && !has30SecondAnnouncedRef.current) {
      voiceAnnouncementService.announceTimeRemaining(30);
      has30SecondAnnouncedRef.current = true;
    }

    if (remainingSeconds > 30 && has30SecondAnnouncedRef.current) {
      has30SecondAnnouncedRef.current = false;
    }
  }, [stopwatchTime, isStopwatchRunning, settings.voiceAnnouncements, currentEntry?.level, getCurrentMaxTimeMs]);

  // Set scoring active state
  useEffect(() => {
    voiceAnnouncementService.setScoringActive(isStopwatchRunning);

    return () => {
      voiceAnnouncementService.setScoringActive(false);
    };
  }, [isStopwatchRunning]);

  // ==========================================================================
  // LOCAL INPUT HELPERS
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

  const handleNavigateWithRingCleanup = useCallback(async () => {
    await navigateBackWithRingCleanup(currentEntry);
  }, [navigateBackWithRingCleanup, currentEntry]);

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

  // ==========================================================================
  // RENDER
  // ==========================================================================

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
            🏆 AKC Nationals
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

      {/* Dog Info Card */}
      <div className="scoresheet-dog-info-card">
        <ArmbandBadge number={currentEntry.armband} />
        <div className="scoresheet-dog-details">
          <div className="scoresheet-dog-name">{currentEntry.callName}</div>
          <div className="scoresheet-dog-breed">{currentEntry.breed}</div>
          <div className="scoresheet-dog-handler">Handler: {currentEntry.handler}</div>
        </div>
      </div>

      {/* Timer Section - Extracted Component */}
      <NationalsTimerSection
        stopwatchTime={stopwatchTime}
        isStopwatchRunning={isStopwatchRunning}
        showWarning={checkShow30SecondWarning()}
        isExpired={checkTimeExpired()}
        remainingTime={getRemainingTime()}
        remainingTimeMs={Math.max(0, getCurrentMaxTimeMs() - stopwatchTime)}
        maxTimeDisplay={getMaxTimeForArea(getNextEmptyAreaIndex() >= 0 ? getNextEmptyAreaIndex() : 0)}
        maxTimeMs={getCurrentMaxTimeMs()}
        warningMessage={getWarningMessage()}
        onReset={resetStopwatch}
        onStart={startStopwatch}
        onStop={stopStopwatch}
      />

      {/* Time Input */}
      {areas.map((area, index) => (
        <div key={index} className="scoresheet-time-card">
          <div className="time-input-flutter">
            {areas.length > 1 && (
              <>
                {!area.time ? (
                  <button
                    className={`area-record-btn ${getNextEmptyAreaIndex() === index && stopwatchTime > 0 && !isStopwatchRunning ? 'next-in-sequence' : ''}`}
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
          selectedResult={qualifying as 'Qualified' | 'Absent' | 'Excused' | null}
          onResultChange={(result) => {
            handleResultChange(result as NationalsQualifyingResult);
          }}
          showNQ={false}
          showEX={true}
          onNQClick={() => {}}
          onEXClick={() => {
            handleResultChange('Excused');
          }}
          selectedResultInternal={qualifying || ''}
          faultCount={faultCount}
          onFaultCountChange={setFaultCount}
          nqReason={''}
          onNQReasonChange={() => {}}
          excusedReason={''}
          onExcusedReasonChange={() => {}}
          isNationalsMode={true}
        />
      </div>

      {/* Nationals Counters */}
      <NationalsCounterSimple
        alertsCorrect={alertsCorrect}
        alertsIncorrect={alertsIncorrect}
        faults={faultCount}
        finishCallErrors={finishCallErrors}
        onAlertsCorrectChange={setAlertsCorrect}
        onAlertsIncorrectChange={setAlertsIncorrect}
        onFaultsChange={setFaultCount}
        onFinishCallErrorsChange={setFinishCallErrors}
      />

      {/* Validation message for incomplete Qualified scores */}
      {qualifying === 'Qualified' && !areas.every(area => area.time && area.time !== '') && (
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
          disabled={isSubmitting || !qualifying || (qualifying === 'Qualified' && !areas.every(area => area.time && area.time !== ''))}
        >
          {isSubmitting ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Sync Status Indicators */}
      {(isSyncing || hasError) && (
        <div style={{ textAlign: 'center', marginTop: '-8px', marginBottom: '8px' }}>
          {isSyncing && <SyncIndicator status="syncing" />}
          {hasError && <SyncIndicator status="error" />}
        </div>
      )}

      {/* Judge Confirmation Dialog - Extracted Component */}
      <NationalsConfirmationDialog
        show={showConfirmation}
        entry={{
          armband: currentEntry.armband,
          callName: currentEntry.callName,
          breed: currentEntry.breed,
          handler: currentEntry.handler,
          element: currentEntry.element,
          level: currentEntry.level
        }}
        trialDate={trialDate}
        trialNumber={trialNumber}
        qualifying={qualifying}
        areas={areas}
        totalTime={totalTime || calculateTotalTime()}
        alertsCorrect={alertsCorrect}
        alertsIncorrect={alertsIncorrect}
        faultCount={faultCount}
        finishCallErrors={finishCallErrors}
        nationalsPoints={getNationalsPoints()}
        isSubmitting={isSubmitting}
        onCancel={() => setShowConfirmation(false)}
        onConfirm={handleEnhancedSubmit}
      />
      </div>
    </div>
    </>
  );
};

export default AKCNationalsScoresheet;
