/**
 * useScoresheetCore Hook
 *
 * Centralized state management for AKC scoresheets.
 * Extracts shared logic from AKCScentWorkScoresheet, AKCScentWorkScoresheet-Enhanced,
 * and AKCNationalsScoresheet to eliminate ~2000 lines of duplicated code.
 *
 * Features:
 * - Scoring state (areas, qualifying result, faults)
 * - UI state (loading, submitting, confirmation dialog)
 * - Score submission with optimistic updates
 * - Class completion celebration
 * - Dialog scroll lock management
 *
 * @see docs/SCORESHEET_REFACTORING_PLAN.md
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useOptimisticScoring } from '../../../hooks/useOptimisticScoring';
import { useClassCompletion } from '../../../hooks/useClassCompletion';
import { markInRing } from '../../../services/entryService';
import type { AreaScore } from '../../../services/scoresheets/areaInitialization';
import type { QualifyingResult } from '../../../stores/scoringStore';
import type { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';

// Extended result types for Nationals
export type NationalsResult = '1st' | '2nd' | '3rd' | '4th';
export type ExtendedResult = QualifyingResult | NationalsResult;

/**
 * Configuration options for the scoresheet core
 */
export interface ScoresheetCoreConfig {
  /** Sport type identifier (for analytics/logging) */
  sportType?: 'AKC_SCENT_WORK' | 'AKC_SCENT_WORK_NATIONAL' | 'AKC_FASTCAT' | 'UKC_NOSEWORK' | 'ASCA_SCENT_DETECTION';
  /** Whether this is a Nationals-style scoresheet with extended results */
  isNationals?: boolean;
}

/**
 * Score data prepared for submission
 */
export interface ScoreSubmitData {
  entryId: number;
  classId: number;
  armband: number;
  className: string;
  scoreData: {
    resultText: string;
    searchTime: string;
    nonQualifyingReason?: string;
    areas: Record<string, string>;
    correctCount: number;
    incorrectCount: number;
    faultCount: number;
    finishCallErrors: number;
    points: number;
    areaTimes: string[];
    element?: string;
    level?: string;
  };
}

/**
 * Return type for useScoresheetCore hook
 */
export interface ScoresheetCoreReturn {
  // Route params
  classId: string | undefined;
  entryId: string | undefined;

  // Scoring state
  areas: AreaScore[];
  setAreas: React.Dispatch<React.SetStateAction<AreaScore[]>>;
  qualifying: ExtendedResult | '';
  setQualifying: React.Dispatch<React.SetStateAction<ExtendedResult | ''>>;
  nonQualifyingReason: string;
  setNonQualifyingReason: React.Dispatch<React.SetStateAction<string>>;
  faultCount: number;
  setFaultCount: React.Dispatch<React.SetStateAction<number>>;

  // Trial metadata
  trialDate: string;
  setTrialDate: React.Dispatch<React.SetStateAction<string>>;
  trialNumber: string;
  setTrialNumber: React.Dispatch<React.SetStateAction<string>>;

  // UI state
  isSubmitting: boolean;
  showConfirmation: boolean;
  setShowConfirmation: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingEntry: boolean;
  setIsLoadingEntry: React.Dispatch<React.SetStateAction<boolean>>;

  // Sync state (from optimistic scoring)
  isSyncing: boolean;
  hasError: boolean;

  // Helper functions
  calculateTotalTime: () => string;
  handleAreaUpdate: (index: number, field: keyof AreaScore, value: AreaScore[keyof AreaScore]) => void;

  // Actions
  submitScore: (currentEntry: Entry, extraData?: Partial<ScoreSubmitData['scoreData']>) => Promise<void>;
  navigateBack: () => void;
  navigateBackWithRingCleanup: (currentEntry: Entry | null) => void;

  // Components
  CelebrationModal: React.ReactElement | null;
}

/**
 * Core hook for scoresheet state management
 *
 * @example
 * ```tsx
 * const core = useScoresheetCore({ sportType: 'AKC_SCENT_WORK' });
 *
 * // Use state
 * core.setQualifying('Q');
 * core.setFaultCount(1);
 *
 * // Submit score
 * await core.submitScore(currentEntry);
 * ```
 */
export function useScoresheetCore(config: ScoresheetCoreConfig = {}): ScoresheetCoreReturn {
  const { sportType = 'AKC_SCENT_WORK' } = config;

  // Route params
  const { classId, entryId } = useParams<{ classId: string; entryId: string }>();
  const navigate = useNavigate();

  // ==========================================================================
  // SCORING STATE
  // ==========================================================================

  const [areas, setAreas] = useState<AreaScore[]>([]);
  const [qualifying, setQualifying] = useState<ExtendedResult | ''>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState<string>('');
  const [faultCount, setFaultCount] = useState<number>(0);

  // Trial metadata
  const [trialDate, setTrialDate] = useState<string>('');
  const [trialNumber, setTrialNumber] = useState<string>('');

  // ==========================================================================
  // UI STATE
  // ==========================================================================

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmation, setShowConfirmation] = useState<boolean>(false);
  const [isLoadingEntry, setIsLoadingEntry] = useState<boolean>(true);

  // ==========================================================================
  // HOOKS
  // ==========================================================================

  const { submitScoreOptimistically, isSyncing, hasError } = useOptimisticScoring();
  const { CelebrationModal, checkCompletion } = useClassCompletion(classId);

  // ==========================================================================
  // DIALOG SCROLL LOCK
  // ==========================================================================

  useEffect(() => {
    if (showConfirmation) {
      document.body.classList.add('dialog-open');
    } else {
      document.body.classList.remove('dialog-open');
    }

    return () => {
      document.body.classList.remove('dialog-open');
    };
  }, [showConfirmation]);

  // ==========================================================================
  // QUALIFYING SETTER WITH AUTO-CLEAR ON EXCUSED
  // ==========================================================================

  /**
   * Wrapper for setQualifying that auto-clears faults when "EX" is selected
   */
  const handleSetQualifying = useCallback((value: ExtendedResult | '' | ((prev: ExtendedResult | '') => ExtendedResult | '')) => {
    // Handle both direct values and updater functions
    const newValue = typeof value === 'function' ? value(qualifying) : value;

    setQualifying(newValue);

    // Auto-clear when Excused is selected
    if (newValue === 'EX') {
      setFaultCount(0);
      setAreas(prev => prev.map(area => ({
        ...area,
        found: false,
        correct: false
        // Keep time intact for recovery
      })));
    }
  }, [qualifying]);

  // ==========================================================================
  // HELPER FUNCTIONS
  // ==========================================================================

  /**
   * Calculate total time from all areas
   */
  const calculateTotalTime = useCallback((): string => {
    const validTimes = areas
      .filter(area => area.time && area.time !== '')
      .map(area => area.time);

    if (validTimes.length === 0) return '0.00';

    // For single area, use that time
    if (validTimes.length === 1) {
      return validTimes[0];
    }

    // Sum multiple areas
    const totalSeconds = validTimes.reduce((sum, time) => {
      const parts = time.split(':');
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]) || 0;
        const seconds = parseFloat(parts[1]) || 0;
        return sum + (minutes * 60 + seconds);
      }
      return sum + (parseFloat(time) || 0);
    }, 0);

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(2);
    return `${minutes}:${seconds.padStart(5, '0')}`;
  }, [areas]);

  /**
   * Update a single area's field
   */
  const handleAreaUpdate = useCallback((
    index: number,
    field: keyof AreaScore,
    value: AreaScore[keyof AreaScore]
  ) => {
    setAreas(prev => prev.map((area, i) =>
      i === index ? { ...area, [field]: value } : area
    ));
  }, []);

  // ==========================================================================
  // NAVIGATION
  // ==========================================================================

  const navigateBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  /**
   * Remove dog from ring and navigate back
   * Uses fire-and-forget pattern for instant navigation
   */
  const navigateBackWithRingCleanup = useCallback((currentEntry: Entry | null) => {
     
    logger.log('🚪 [useScoresheetCore] navigateBackWithRingCleanup called:', {
      hasEntry: !!currentEntry,
      entryId: currentEntry?.id,
      armband: currentEntry?.armband
    });

    // Fire-and-forget: update status in background, navigate immediately
    if (currentEntry?.id) {
       
      logger.log('🚪 [useScoresheetCore] Firing markInRing(', currentEntry.id, ', false) in background');
      markInRing(currentEntry.id, false)
        .then(() => {
           
          logger.log('✅ [useScoresheetCore] markInRing completed successfully');
        })
        .catch((error) => {
          logger.error('❌ Failed to remove dog from ring:', error);
        });
    } else {
      logger.warn('⚠️ [useScoresheetCore] No currentEntry - skipping markInRing');
    }

    // Navigate immediately - don't wait for DB
    navigate(-1);
  }, [navigate]);

  // ==========================================================================
  // SCORE SUBMISSION
  // ==========================================================================

  /**
   * Submit score with optimistic updates
   */
  const submitScore = useCallback(async (
    currentEntry: Entry,
    extraData: Partial<ScoreSubmitData['scoreData']> = {}
  ) => {
     
    logger.log('📝 [useScoresheetCore] submitScore called:', {
      entryId: currentEntry?.id,
      armband: currentEntry?.armband,
      qualifying,
      hasCurrentEntry: !!currentEntry
    });

if (!currentEntry) {
      logger.warn('⚠️ [useScoresheetCore] No currentEntry - aborting');
      return;
    }

    setShowConfirmation(false);
    setIsSubmitting(true);

    // Prepare score data
    const finalQualifying = qualifying || 'NQ';
    const finalTotalTime = calculateTotalTime() || '0.00';

    // Get the appropriate reason based on the result type
    const getFinalReason = () => {
      if (finalQualifying === 'Q') return undefined;
      return nonQualifyingReason || undefined;
    };

    // Prepare area results
    const areaResults: Record<string, string> = {};
    areas.forEach(area => {
      areaResults[area.areaName.toLowerCase()] =
        `${area.time}${area.found ? ' FOUND' : ' NOT FOUND'}${area.correct ? ' CORRECT' : ' INCORRECT'}`;
    });

    try {
      await submitScoreOptimistically({
        entryId: currentEntry.id,
        classId: parseInt(classId!),
        armband: currentEntry.armband,
        className: currentEntry.className,
        scoreData: {
          resultText: finalQualifying,
          searchTime: finalTotalTime,
          nonQualifyingReason: getFinalReason(),
          areas: areaResults,
          correctCount: extraData.correctCount ?? 0,
          incorrectCount: extraData.incorrectCount ?? 0,
          faultCount: faultCount,
          finishCallErrors: extraData.finishCallErrors ?? 0,
          points: extraData.points ?? 0,
          areaTimes: areas.map(area => area.time).filter(time => time && time !== ''),
          element: currentEntry.element,
          level: currentEntry.level,
          ...extraData
        },
        onSuccess: async () => {
// Check if class is completed and show celebration
          await checkCompletion();

          // Remove from ring before navigating back
          if (currentEntry?.id) {
            try {
              await markInRing(currentEntry.id, false);
} catch (error) {
              logger.error('❌ Failed to remove dog from ring:', error);
            }
          }

          // Navigate back to entry list
          navigate(-1);
        },
        onError: (error) => {
          logger.error('❌ Score submission failed:', error);
          alert(`Failed to submit score: ${error.message}`);
          setIsSubmitting(false);
        }
      });
    } catch (error) {
      logger.error('❌ Unexpected error during submission:', error);
      setIsSubmitting(false);
    }
  }, [
    sportType,
    classId,
    qualifying,
    nonQualifyingReason,
    faultCount,
    areas,
    calculateTotalTime,
    submitScoreOptimistically,
    checkCompletion,
    navigate
  ]);

  // ==========================================================================
  // RETURN
  // ==========================================================================

  return {
    // Route params
    classId,
    entryId,

    // Scoring state
    areas,
    setAreas,
    qualifying,
    setQualifying: handleSetQualifying,
    nonQualifyingReason,
    setNonQualifyingReason,
    faultCount,
    setFaultCount,

    // Trial metadata
    trialDate,
    setTrialDate,
    trialNumber,
    setTrialNumber,

    // UI state
    isSubmitting,
    showConfirmation,
    setShowConfirmation,
    isLoadingEntry,
    setIsLoadingEntry,

    // Sync state
    isSyncing,
    hasError,

    // Helper functions
    calculateTotalTime,
    handleAreaUpdate,

    // Actions
    submitScore,
    navigateBack,
    navigateBackWithRingCleanup,

    // Components
    CelebrationModal
  };
}
