import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { CompetitorCard } from '../../../components/scoring/CompetitorCard';
import { useScoringStore, useEntryStore, useOfflineQueueStore } from '../../../stores';
import { markInRing } from '../../../services/entryService';
import { useAuth } from '../../../contexts/AuthContext';
import { useOptimisticScoring } from '../../../hooks/useOptimisticScoring';
import { HamburgerMenu } from '../../../components/ui/HamburgerMenu';
import { SyncIndicator } from '../../../components/ui';
import { ClipboardCheck } from 'lucide-react';
import { ensureReplicationManager } from '../../../utils/replicationHelper';
import type { Entry as ReplicatedEntry } from '../../../services/replication/tables/ReplicatedEntriesTable';
import type { Class } from '../../../services/replication/tables/ReplicatedClassesTable';
import type { Entry } from '../../../stores/entryStore';
import { logger } from '@/utils/logger';
import { haptic } from '@/hooks/useHapticFeedback';
import '../BaseScoresheet.css';
import './UKCObedienceScoresheet.css';

type QualifyingResult = 'Q' | 'NQ' | 'EX' | 'DQ';

export const UKCObedienceScoresheet: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { showContext } = useAuth();

  // Get paired class ID from location state (for combined Novice A & B view)
  const pairedClassId = (location.state as { pairedClassId?: number } | null)?.pairedClassId;
  
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
  const [points, setPoints] = useState<string>('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('Q');
  const [nonQualifyingReason, setNonQualifyingReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  
  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const toggleTheme = () => {
    setDarkMode(!darkMode);
  };

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
            'UKC_OBEDIENCE',
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

  const handlePointsChange = (value: string) => {
    // Allow only numbers and one decimal point
    const regex = /^\d{0,3}(\.\d{0,1})?$/;
    if (regex.test(value) || value === '') {
      setPoints(value);
    }
  };
  
  const calculateQualifying = (score: number): QualifyingResult => {
    // UKC Obedience qualifying scores (example thresholds)
    if (score >= 170) return 'Q';
    return 'NQ';
  };
  
  const handleSubmit = () => {
    if (!currentEntry || !points) return;
    setShowConfirmation(true);
  };
  
  const confirmSubmit = async () => {
    if (!currentEntry || !points) return;

    setShowConfirmation(false);

    const scoreValue = parseFloat(points);
    const finalQualifying = qualifying === 'Q' ? calculateQualifying(scoreValue) : qualifying;

    // Submit score optimistically
    await submitScoreOptimistically({
      entryId: currentEntry.id,
      classId: parseInt(classId!),
      armband: currentEntry.armband,
      className: currentEntry.className,
      pairedClassId, // For combined A & B - enables completion check on both classes
      scoreData: {
        resultText: finalQualifying,
        points: scoreValue,
        nonQualifyingReason: finalQualifying !== 'Q' ? nonQualifyingReason : undefined,
      },
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

          // Reset form
          setPoints('');
          setQualifying('Q');
          setNonQualifyingReason('');
        } else {
          // All entries scored
          endScoringSession();
          navigate(-1);
        }
      },
      onError: (error) => {
        logger.error('❌ UKC Obedience score submission failed:', error);
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
    <div className="scoresheet-container ukc-obedience" data-theme={darkMode ? 'dark' : 'light'}>
      {/* Theme Toggle */}
      <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
        {darkMode ? '☀️' : '🌙'}
      </button>
      <header className="page-header scoresheet-header">
        <HamburgerMenu />
        <h1>
          <ClipboardCheck className="title-icon" />
          UKC Obedience
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
        
        <div className="scoring-form form-section">
          <h3>Obedience Scoring</h3>
          <div className="score-input-section">
            <label htmlFor="points">Score Points</label>
            <input
              id="points"
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={points}
              onChange={(e) => handlePointsChange(e.target.value)}
              className="points-input"
              autoFocus
            />
            <span className="max-points">out of 200.0</span>
          </div>
          
          <div className="qualifying-section">
            <label>Qualifying Result</label>
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
                className={`qual-button ${qualifying === 'EX' ? 'active' : ''}`}
                onClick={() => setQualifying('EX')}
              >
                EX
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
              <label htmlFor="reason">Non-Qualifying Reason</label>
              <textarea
                id="reason"
                value={nonQualifyingReason}
                onChange={(e) => setNonQualifyingReason(e.target.value)}
                placeholder="Enter reason for NQ/EX/DQ..."
                rows={3}
              />
            </div>
          )}
          
          <div className="action-buttons">
            <button
              className="nav-button btn-secondary"
              onClick={handlePrevious}
              disabled={currentIndex === 1}
            >
              Previous
            </button>

            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className="submit-button btn-primary"
                onClick={() => { haptic.medium(); handleSubmit(); }}
                disabled={!points || isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Score'}
              </button>
              {isSyncing && <SyncIndicator status="syncing" />}
              {hasError && <SyncIndicator status="error" />}
            </div>

            <button
              className="nav-button btn-secondary"
              onClick={handleNext}
              disabled={currentIndex === currentClassEntries.length}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      
      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="confirmation-overlay">
          <div className="confirmation-dialog">
            <h2>Confirm Score</h2>
            <div className="confirmation-details">
              <p><strong>Dog:</strong> {currentEntry.callName} (#{currentEntry.armband})</p>
              <p><strong>Score:</strong> {points} / 200.0</p>
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