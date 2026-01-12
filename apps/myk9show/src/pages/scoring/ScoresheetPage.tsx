/**
 * ScoresheetPage
 *
 * Router component that dispatches to the appropriate scoresheet
 * based on the organization and sport type.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, WifiOff } from 'lucide-react';

// UI Components
import { Button } from '@/components/ui/button';

// Offline-first scoring
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';

// Replication
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';

// Scoresheets from shared package
import {
import { logger } from '@/services/LoggingService';
  AKCScentWorkScoresheet,
  AKCNationalsScoresheet,
  AKCFastCatScoresheet,
  UKCNoseworkScoresheet,
  UKCRallyScoresheet,
  UKCObedienceScoresheet,
  ASCAScentDetectionScoresheet,
} from '@myk9/scoring-ui';

// Types
import type { ScoringEntry, ClassInfo } from './types';
import { toScoringEntry, toClassInfo } from './types';

/**
 * Organization and sport type detection
 */
type Organization = 'AKC' | 'UKC' | 'ASCA' | 'Unknown';
type SportType = 'scent-work' | 'scent-work-nationals' | 'nosework' | 'rally' | 'obedience' | 'agility' | 'fast-cat' | 'unknown';

interface ScoresheetContext {
  entry: ScoringEntry;
  classInfo: ClassInfo;
  organization: Organization;
  sportType: SportType;
  onSave: (result: ScoringResult) => Promise<void>;
  onNavigate: (direction: 'prev' | 'next') => void;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ScoringResult {
  time: number;
  faults: number;
  qualification: string;
  notes?: string;
}

/**
 * Main scoresheet page - routes to correct scoresheet component
 */
export function ScoresheetPage() {
  const { classId, entryId } = useParams<{ classId: string; entryId: string }>();
  const navigate = useNavigate();

  // Offline-first scoring hook
  const {
    submitScoreOptimistically,
    isSyncing,
    hasError: hasSyncError,
  } = useOptimisticScoring();

  // Data state
  const [entry, setEntry] = useState<ScoringEntry | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [allEntries, setAllEntries] = useState<ScoringEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data
  useEffect(() => {
    async function loadData() {
      if (!classId || !entryId) {
        setError('Missing class or entry ID');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Load class info
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) {
          setError('Class not found');
          return;
        }

        // Load all entries for navigation
        const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);

        // Load dogs
        const dogsMap = new Map();
        for (const e of rawEntries) {
          if (e.dogId) {
            const dog = await replicatedDogsTable.get(e.dogId);
            if (dog) {
              dogsMap.set(e.dogId, dog);
            }
          }
        }

        // Convert to ScoringEntry
        const scoringEntries = rawEntries.map((e, i) => {
          const dog = e.dogId ? dogsMap.get(e.dogId) : null;
          return toScoringEntry(e, dog, i);
        });

        // Sort by run order
        scoringEntries.sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);

        // Find current entry
        const currentEntry = scoringEntries.find((e) => e.entryId === entryId);
        if (!currentEntry) {
          setError('Entry not found');
          return;
        }

        setAllEntries(scoringEntries);
        setEntry(currentEntry);
        setClassInfo(toClassInfo(cls, scoringEntries.length));
      } catch (err) {
        logger.error('Failed to load scoresheet data:', 'pages', {}, err as Error);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [classId, entryId]);

  // Navigation handlers
  const currentIndex = allEntries.findIndex((e) => e.entryId === entryId);
  const hasNext = currentIndex < allEntries.length - 1;
  const hasPrev = currentIndex > 0;

  const handleNavigate = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    const newEntry = allEntries[newIndex];
    if (newEntry) {
      navigate(`/scoring/classes/${classId}/entries/${newEntry.entryId}`);
    }
  };

  // Save handler with offline-first support
  const handleSave = async (result: ScoringResult) => {
    if (!entry || !classInfo) return;

    // Convert time from ms to formatted string (M:SS.ss)
    const formatTimeForSubmission = (ms: number): string => {
      const totalSeconds = ms / 1000;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = (totalSeconds % 60).toFixed(2);
      return `${minutes}:${seconds.padStart(5, '0')}`;
    };

    // Map qualification string to result text
    const mapQualification = (qual: string): string => {
      switch (qual) {
        case 'Q':
        case 'Qualified':
          return 'Q';
        case 'NQ':
        case 'Not Qualified':
          return 'NQ';
        case 'ABS':
        case 'Absent':
          return 'ABS';
        case 'EX':
        case 'Excused':
          return 'EX';
        default:
          return qual;
      }
    };

    // Submit with offline-first optimistic update
    await submitScoreOptimistically({
      entryId: parseInt(entry.entryId, 10),
      classId: parseInt(classInfo.id, 10),
      armband: entry.armband,
      className: classInfo.name,
      scoreData: {
        resultText: mapQualification(result.qualification),
        searchTime: formatTimeForSubmission(result.time),
        faultCount: result.faults,
        nonQualifyingReason: result.notes,
        element: classInfo.element,
        level: classInfo.level,
      },
      onSuccess: () => {
        // Update local state to reflect scored status
        setEntry((prev) =>
          prev ? { ...prev, isScored: true, status: 'scored' } : null
        );
      },
      onError: (err) => {
        logger.error('Score submission failed:', 'pages', {}, err as Error);
        // Error is handled by the hook - score is queued for retry
      },
    });
  };

  // Back to entry list
  const handleBack = () => {
    navigate(`/scoring/classes/${classId}/entries`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !entry || !classInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-medium text-destructive">
          {error || 'Failed to load scoresheet'}
        </p>
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Entry List
        </Button>
      </div>
    );
  }

  // Detect organization and sport type
  const { organization, sportType } = detectScoresheetType(classInfo);

  // Render appropriate scoresheet
  const scoresheetContext: ScoresheetContext = {
    entry,
    classInfo,
    organization,
    sportType,
    onSave: handleSave,
    onNavigate: handleNavigate,
    hasNext,
    hasPrev,
  };

  return (
    <>
      {/* Sync status indicator */}
      {(isSyncing || hasSyncError) && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm">
          {isSyncing && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-full">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing score...
            </div>
          )}
          {hasSyncError && !isSyncing && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-800 rounded-full">
              <WifiOff className="h-4 w-4" />
              Offline - score saved locally
            </div>
          )}
        </div>
      )}
      {renderScoresheet(scoresheetContext, handleBack)}
    </>
  );
}

/**
 * Detect organization and sport type from class info
 */
function detectScoresheetType(classInfo: ClassInfo): {
  organization: Organization;
  sportType: SportType;
} {
  const name = classInfo.name.toLowerCase();

  // Detect organization first
  let organization: Organization = 'AKC'; // Default
  if (name.includes('ukc') || name.includes('united kennel')) {
    organization = 'UKC';
  } else if (name.includes('asca') || name.includes('australian shepherd')) {
    organization = 'ASCA';
  } else if (name.includes('akc') || name.includes('american kennel')) {
    organization = 'AKC';
  }

  // Detect sport type
  let sportType: SportType = 'unknown';

  // Check for Nationals first (special multi-area scoresheet)
  if (name.includes('nationals') || name.includes('national')) {
    sportType = 'scent-work-nationals';
  } else if (name.includes('fast cat') || name.includes('fastcat')) {
    sportType = 'fast-cat';
  } else if (name.includes('nosework')) {
    sportType = 'nosework';
  } else if (name.includes('scent detection')) {
    // ASCA Scent Detection
    sportType = 'scent-work';
  } else if (
    name.includes('container') ||
    name.includes('interior') ||
    name.includes('exterior') ||
    name.includes('buried') ||
    name.includes('scent') ||
    name.includes('handler disc')
  ) {
    sportType = 'scent-work';
  } else if (name.includes('rally')) {
    sportType = 'rally';
  } else if (name.includes('obedience')) {
    sportType = 'obedience';
  } else if (name.includes('agility')) {
    sportType = 'agility';
  }

  return { organization, sportType };
}

/**
 * Render the appropriate scoresheet based on context
 */
function renderScoresheet(
  context: ScoresheetContext,
  onBack: () => void
) {
  const { organization, sportType, entry, classInfo, onSave, onNavigate, hasNext, hasPrev } = context;

  // Common props for all scoresheets
  const scoresheetProps = {
    entry,
    classInfo,
    onSave,
    onNavigate,
    onBack,
    hasNext,
    hasPrev,
  };

  // === AKC Scoresheets ===

  // AKC Scent Work Nationals (multi-area)
  if (organization === 'AKC' && sportType === 'scent-work-nationals') {
    return <AKCNationalsScoresheet {...scoresheetProps} />;
  }

  // AKC Scent Work (single area)
  if (organization === 'AKC' && sportType === 'scent-work') {
    return <AKCScentWorkScoresheet {...scoresheetProps} />;
  }

  // AKC Fast CAT
  if (organization === 'AKC' && sportType === 'fast-cat') {
    return <AKCFastCatScoresheet {...scoresheetProps} />;
  }

  // === UKC Scoresheets ===

  // UKC Nosework
  if (organization === 'UKC' && sportType === 'nosework') {
    return <UKCNoseworkScoresheet {...scoresheetProps} />;
  }

  // UKC Rally
  if (organization === 'UKC' && sportType === 'rally') {
    return <UKCRallyScoresheet {...scoresheetProps} />;
  }

  // UKC Obedience
  if (organization === 'UKC' && sportType === 'obedience') {
    return <UKCObedienceScoresheet {...scoresheetProps} />;
  }

  // === ASCA Scoresheets ===

  // ASCA Scent Detection
  if (organization === 'ASCA' && sportType === 'scent-work') {
    return <ASCAScentDetectionScoresheet {...scoresheetProps} />;
  }

  // Fallback - generic scoresheet
  return (
    <div className="container max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Scoresheet</h1>
          <p className="text-muted-foreground">
            {organization} {sportType} - Not yet implemented
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">Scoresheet Not Available</p>
        <p className="text-muted-foreground">
          The scoresheet for {organization} {sportType} is not yet implemented.
        </p>
      </div>
    </div>
  );
}

export default ScoresheetPage;
