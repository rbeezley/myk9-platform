import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { CompetitorCard } from '../../../components/scoring/CompetitorCard';
import { Timer } from '../../../components/scoring/Timer';
import { HamburgerMenu } from '../../../components/ui/HamburgerMenu';
import { useScoringStore, useEntryStore, useOfflineQueueStore } from '../../../stores';
import { markInRing } from '../../../services/entryService';
import { useAuth } from '../../../contexts/AuthContext';
import { useOptimisticScoring } from '../../../hooks/useOptimisticScoring';
import { SyncIndicator } from '../../../components/ui';
import { ClipboardCheck } from 'lucide-react';
import { ensureReplicationManager } from '../../../utils/replicationHelper';
import { FASTCAT_COURSE } from '../../../constants/fastcatConstants';
import type { Entry as ReplicatedEntry } from '../../../services/replication/tables/ReplicatedEntriesTable';
import type { Class } from '../../../services/replication/tables/ReplicatedClassesTable';
import type { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';
import { haptic } from '@/hooks/useHapticFeedback';
import '../BaseScoresheet.css';
import './AKCFastCatScoresheet.css';

type QualifyingResult = 'Q' | 'NQ' | 'E' | 'DQ';

export const AKCFastCatScoresheet: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showContext } = useAuth();

  // Get paired class ID from location state (if coming from combined Novice A & B view)
  const pairedClassId = (location.state as { pairedClassId?: number })?.pairedClassId;
  
  // Store hooks
  const {
    isScoring,
    startScoringSession,
    submitScore: _addScoreToSession,
    moveToNextEntry,
    moveToPreviousEntry,
    endScoringSession
  } = useScoringStore();

  const {
    currentClassEntries,
    currentEntry,
    setCurrentClassEntries,
    setCurrentEntry,
    markAsScored: _markAsScored,
    getPendingEntries
  } = useEntryStore();

  const { addToQueue: _addToQueue, isOnline } = useOfflineQueueStore();

  // Optimistic scoring hook
  const { submitScoreOptimistically, isSyncing, hasError } = useOptimisticScoring();

  // Local state
  const [runTime, setRunTime] = useState<string>('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('Q');
  const [nonQualifyingReason, setNonQualifyingReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // FastCat course length from constants
  const COURSE_LENGTH = FASTCAT_COURSE.LENGTH_YARDS;

  // Helper function - defined before useMemo
  const parseTimeToSeconds = (timeString: string): number => {
    if (!timeString) return 0;

    const parts = timeString.split(':');
    if (parts.length === 2) {
      // MM:SS.ms format
      const minutes = parseInt(parts[0]) || 0;
      const seconds = parseFloat(parts[1]) || 0;
      return (minutes * 60) + seconds;
    } else {
      // SS.ms format
      return parseFloat(timeString) || 0;
    }
  };

  // Calculate MPH and points automatically when runTime changes
  const { mph, points } = useMemo(() => {
    if (!runTime || !currentEntry) {
      return { mph: 0, points: 0 };
    }

    const timeInSeconds = parseTimeToSeconds(runTime);
    if (timeInSeconds <= 0) {
      return { mph: 0, points: 0 };
    }

    // Calculate MPH: (Distance in yards * SECONDS_PER_HOUR) / (Time in seconds * YARDS_PER_MILE)
    const calculatedMph = (COURSE_LENGTH * FASTCAT_COURSE.SECONDS_PER_HOUR) / (timeInSeconds * FASTCAT_COURSE.YARDS_PER_MILE);
    const roundedMph = Math.round(calculatedMph * 100) / 100; // Round to 2 decimal places

    // Calculate points based on speed (simplified formula - see constants for full AKC formula notes)
    const basePoints = Math.round(calculatedMph * FASTCAT_COURSE.POINTS_MULTIPLIER);

    return { mph: roundedMph, points: basePoints };
  }, [runTime, currentEntry, COURSE_LENGTH]);

  const loadEntries = async () => {
    if (!classId || !showContext?.licenseKey) return;

    try {
      // Load from replicated cache (direct replacement, no feature flags)
// Ensure replication manager is initialized (handles recovery scenarios)
      const manager = await ensureReplicationManager();

      const entriesTable = manager.getTable('entries');
      const classesTable = manager.getTable('classes');

      if (!entriesTable || !classesTable) {
        throw new Error('Required tables not registered');
      }

      // Get class information
      const classData = await classesTable.get(classId) as Class | undefined;
      if (!classData) {
        throw new Error(`Class ${classId} not found in cache`);
      }

      // Get all entries for this class
      const allEntries = await entriesTable.getAll() as ReplicatedEntry[];
      const classEntries = allEntries.filter(entry => entry.class_id === classId);

// Transform to Entry format for store
      const transformedEntries: Entry[] = classEntries.map(entry => ({
        id: parseInt(entry.id),
        armband: entry.armband_number,
        callName: entry.dog_call_name || 'Unknown',
        breed: entry.dog_breed || 'Unknown',
        handler: entry.handler_name || 'Unknown',
        isScored: entry.is_scored || false,
        status: (entry.entry_status as Entry['status']) || 'no-status',
        classId: parseInt(entry.class_id),
        className: `${classData.element} ${classData.level}`,
        element: classData.element,
        level: classData.level,
        section: classData.section,
      }));

      setCurrentClassEntries(parseInt(classId));

      // Set first pending entry as current
      const pending = transformedEntries.filter(e => !e.isScored);
      if (pending.length > 0) {
        setCurrentEntry(pending[0]);

        // Mark dog as in-ring when scoresheet opens
        // Pass current status so it can be restored if scoresheet is canceled
        if (pending[0].id) {
          markInRing(pending[0].id, true, pending[0].status).catch(error => {
            logger.error('Failed to mark dog in-ring on scoresheet open:', error);
          });
        }

        // Start scoring session if not already started
        if (!isScoring) {
          startScoringSession(
            parseInt(classId),
            pending[0].className,
            'AKC_FASTCAT',
            showContext.licenseKey,
            transformedEntries.length
          );
        }
      }
    } catch (error) {
      logger.error('Error loading entries:', error);
    }
  };

  // Load class entries on mount
  useEffect(() => {
    if (classId && showContext?.licenseKey) {
      loadEntries();
    }
  }, [classId, showContext, loadEntries]);

  // Clear in-ring status when leaving scoresheet
  useEffect(() => {
    return () => {
      if (currentEntry?.id) {
        markInRing(currentEntry.id, false).catch(error => {
          logger.error('Failed to clear in-ring status on unmount:', error);
        });
      }
    };
  }, []); // Fixed: removed currentEntry?.id dependency

  const handleSubmit = () => {
    if (!runTime) {
      alert('Please enter a run time');
      return;
    }

    // mph and points are automatically calculated via useMemo
    setShowConfirmation(true);
  };
  
  const confirmSubmit = async () => {
    if (!currentEntry) return;

    setShowConfirmation(false);

    // Submit score optimistically
    await submitScoreOptimistically({
      entryId: currentEntry.id,
      classId: parseInt(classId!),
      armband: currentEntry.armband,
      className: currentEntry.className,
      scoreData: {
        resultText: qualifying,
        searchTime: runTime,
        mph: mph,
        points: points,
        nonQualifyingReason: qualifying !== 'Q' ? nonQualifyingReason : undefined,
      },
      pairedClassId: pairedClassId,
      onSuccess: async () => {
// Remove from ring
        if (currentEntry?.id) {
          try {
            await markInRing(currentEntry.id, false);
} catch (error) {
            logger.error('❌ Failed to remove dog from ring:', error);
          }
        }

        // Move to next entry
        const pendingEntries = getPendingEntries();
        if (pendingEntries.length > 0) {
          setCurrentEntry(pendingEntries[0]);
          moveToNextEntry();

          // Reset form (mph and points will auto-reset to 0 when runTime is cleared)
          setRunTime('');
          setQualifying('Q');
          setNonQualifyingReason('');
        } else {
          // All entries scored
          endScoringSession();
          navigate(-1);
        }
      },
      onError: (error) => {
        logger.error('❌ FastCAT score submission failed:', error);
        alert(`Failed to submit score: ${error.message}`);
        setIsSubmitting(false);
      }
    });
  };
  
  const handlePrevious = () => {
    const currentIndex = currentClassEntries.findIndex(e => e.id === currentEntry?.id);
    if (currentIndex > 0) {
      setCurrentEntry(currentClassEntries[currentIndex - 1]);
      moveToPreviousEntry();
    }
  };
  
  const handleNext = () => {
    const currentIndex = currentClassEntries.findIndex(e => e.id === currentEntry?.id);
    if (currentIndex < currentClassEntries.length - 1) {
      setCurrentEntry(currentClassEntries[currentIndex + 1]);
      moveToNextEntry();
    }
  };
  
  if (!currentEntry) {
    return (
      <div className="scoresheet-container">
        <div className="no-entries">
          <h2>No pending entries</h2>
          <button onClick={() => navigate(-1)}>Back to Class List</button>
        </div>
      </div>
    );
  }
  
  const currentIndex = currentClassEntries.findIndex(e => e.id === currentEntry.id) + 1;
  
  return (
    <div className="scoresheet-container akc-fastcat">
      <header className="page-header scoresheet-header">
        <HamburgerMenu />
        <h1>
          <ClipboardCheck className="title-icon" />
          AKC FastCAT
        </h1>
        <div className="sync-status">
          {isOnline ? (
            <span className="online">● Online</span>
          ) : (
            <span className="offline">● Offline</span>
          )}
        </div>
      </header>
      
      <div className="scoresheet-content">
        <CompetitorCard
          entry={currentEntry}
          currentPosition={currentIndex}
          totalEntries={currentClassEntries.length}
        />
        
        {/* Timer Section */}
        <div className="timer-section">
          <Timer
            areaId="fastcat-run"
            areaName="FastCAT Run"
            showControls={true}
            size="large"
            maxTime={60000} // 60 seconds max
          />
        </div>
        
        {/* Time Input Section */}
        <div className="time-section">
          <h3>Run Time</h3>
          <div className="time-input">
            <label htmlFor="runTime">Time (seconds)</label>
            <input
              id="runTime"
              type="text"
              placeholder="SS.ms or MM:SS.ms"
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
            />
          </div>
        </div>
        
        {/* Results Display */}
        {runTime && mph > 0 && (
          <div className="results-section">
            <div className="result-card">
              <h3>Speed</h3>
              <div className="result-value">{mph} MPH</div>
            </div>
            <div className="result-card">
              <h3>Points</h3>
              <div className="result-value">{points}</div>
            </div>
          </div>
        )}
        
        {/* Qualifying Section */}
        <div className="qualifying-section">
          <label>Result</label>
          <div className="qualifying-buttons">
            <button
              className={`qual-button ${qualifying === 'Q' ? 'active' : ''}`}
              onClick={() => setQualifying('Q')}
            >
              Q
            </button>
            <button
              className={`qual-button ${qualifying === 'NQ' ? 'active' : ''}`}
              onClick={() => setQualifying('NQ')}
            >
              NQ
            </button>
            <button
              className={`qual-button ${qualifying === 'E' ? 'active' : ''}`}
              onClick={() => setQualifying('E')}
            >
              E
            </button>
            <button
              className={`qual-button ${qualifying === 'DQ' ? 'active' : ''}`}
              onClick={() => setQualifying('DQ')}
            >
              DQ
            </button>
          </div>
        </div>
        
        {qualifying !== 'Q' && (
          <div className="reason-section">
            <label htmlFor="reason">Reason</label>
            <textarea
              id="reason"
              value={nonQualifyingReason}
              onChange={(e) => setNonQualifyingReason(e.target.value)}
              placeholder="Enter reason for NQ/E/DQ..."
              rows={3}
            />
          </div>
        )}
        
        <div className="action-buttons">
          <button
            className="nav-button"
            onClick={handlePrevious}
            disabled={currentIndex === 1}
          >
            Previous
          </button>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="submit-button btn-primary"
              onClick={() => { haptic.medium(); handleSubmit(); }}
              disabled={!runTime || isSubmitting}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Score'}
            </button>
            {isSyncing && <SyncIndicator status="syncing" />}
            {hasError && <SyncIndicator status="error" />}
          </div>

          <button
            className="nav-button"
            onClick={handleNext}
            disabled={currentIndex === currentClassEntries.length}
          >
            Next
          </button>
        </div>
      </div>
      
      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <h2>Confirm Score</h2>
            <div className="confirmation-details">
              <p><strong>Dog:</strong> {currentEntry.callName} (#{currentEntry.armband})</p>
              <p><strong>Run Time:</strong> {runTime} seconds</p>
              <p><strong>Speed:</strong> {mph} MPH</p>
              <p><strong>Points:</strong> {points}</p>
              <p><strong>Result:</strong> {qualifying}</p>
              {nonQualifyingReason && (
                <p><strong>Reason:</strong> {nonQualifyingReason}</p>
              )}
            </div>
            <div className="confirmation-buttons">
              <button onClick={() => setShowConfirmation(false)}>Cancel</button>
              <button onClick={() => { haptic.success(); confirmSubmit(); }} className="confirm-button btn-primary">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};