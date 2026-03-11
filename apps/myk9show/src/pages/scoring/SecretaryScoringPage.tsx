/**
 * SecretaryScoringPage
 *
 * Renders the correct EntryScoresheet component for a given sport type,
 * allowing secretaries to manually enter scores after a run.
 *
 * Mirrors ScoresheetPage.tsx but uses Entry variants (keyboard-first,
 * compact form layout) instead of Live variants (mobile touch targets).
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { logger } from '@/services/LoggingService';
import { getScoresheetComponent, buildResolvedClassRules } from '@myk9/scoring-ui';
import type {
  ScoresheetEntry,
  ScoresheetClassInfo,
  ScoresheetSportType,
  ScoreData,
  ResolvedClassRules,
} from '@myk9/scoring-ui';

import type { ScoringEntry, ClassInfo } from './types';
import { toScoringEntry, toClassInfo } from './types';

/**
 * Map organization + sport string to registry key.
 * Input comes from mapSportType() in ScoresheetPage (e.g., 'AKC' + 'scent-work').
 */
function toRegistryKey(org: string, sport: string): ScoresheetSportType | null {
  const key = `${org}:${sport}`;
  switch (key) {
    case 'AKC:scent-work':
      return 'AKC_SCENT_WORK';
    case 'AKC:scent-work-nationals':
      return 'AKC_SCENT_WORK_NATIONAL';
    case 'AKC:fast-cat':
      return 'AKC_FASTCAT';
    case 'UKC:nosework':
      return 'UKC_NOSEWORK';
    case 'UKC:rally':
      return 'UKC_RALLY';
    case 'UKC:obedience':
      return 'UKC_OBEDIENCE';
    case 'ASCA:scent-work':
      return 'ASCA_SCENT_DETECTION';
    default:
      return null;
  }
}

type Organization = 'AKC' | 'UKC' | 'ASCA' | 'Unknown';
type SportType =
  | 'scent-work'
  | 'scent-work-nationals'
  | 'nosework'
  | 'rally'
  | 'obedience'
  | 'fast-cat'
  | 'unknown';

/**
 * Map trial sport_type code to organization and sport type.
 * Duplicated from ScoresheetPage — could be extracted to shared util.
 */
function mapSportType(sportTypeCode: string): {
  organization: Organization;
  sportType: SportType;
} {
  switch (sportTypeCode) {
    case 'akc-scent-work':
      return { organization: 'AKC', sportType: 'scent-work' };
    case 'akc-scent-work-nationals':
      return { organization: 'AKC', sportType: 'scent-work-nationals' };
    case 'akc-fast-cat':
      return { organization: 'AKC', sportType: 'fast-cat' };
    case 'ukc-nosework':
      return { organization: 'UKC', sportType: 'nosework' };
    case 'ukc-rally':
      return { organization: 'UKC', sportType: 'rally' };
    case 'ukc-obedience':
      return { organization: 'UKC', sportType: 'obedience' };
    case 'asca-scent-detection':
      return { organization: 'ASCA', sportType: 'scent-work' };
    default:
      return { organization: 'Unknown', sportType: 'unknown' };
  }
}

/** Convert ScoringEntry to ScoresheetEntry for scoresheet props */
function toScoresheetEntry(
  entry: ScoringEntry
): Pick<ScoresheetEntry, 'id' | 'armband' | 'dogName' | 'handlerName'> {
  return {
    id: parseInt(entry.entryId, 10) || 0,
    armband: entry.armband,
    dogName: entry.callName,
    handlerName: entry.handler,
  };
}

/** Convert ClassInfo to ScoresheetClassInfo for scoresheet props */
function toScoresheetClassInfo(info: ClassInfo): ScoresheetClassInfo {
  return {
    element: info.element || '',
    level: info.level || '',
  };
}

export function SecretaryScoringPage() {
  const { classId, entryId } = useParams<{
    classId: string;
    entryId: string;
  }>();
  const navigate = useNavigate();

  const { submitScoreOptimistically, isSyncing, hasError: hasSyncError } = useOptimisticScoring();

  const [entry, setEntry] = useState<ScoringEntry | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [rules, setRules] = useState<ResolvedClassRules | null>(null);
  const [trialSportType, setTrialSportType] = useState<string | undefined>(undefined);
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
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) {
          setError('Class not found');
          return;
        }

        if (cls.trialId) {
          const trial = await replicatedTrialsTable.getTrialById(cls.trialId);
          if (trial?.sportType) {
            setTrialSportType(trial.sportType);
          }
        }

        const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);

        const dogsMap = new Map();
        for (const e of rawEntries) {
          if (e.dogId) {
            const dog = await replicatedDogsTable.get(e.dogId);
            if (dog) {
              dogsMap.set(e.dogId, dog);
            }
          }
        }

        const scoringEntries = rawEntries.map((e, i) => {
          const dog = e.dogId ? dogsMap.get(e.dogId) : null;
          return toScoringEntry(e, dog, i);
        });

        scoringEntries.sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);

        const currentEntry = scoringEntries.find(e => e.entryId === entryId);
        if (!currentEntry) {
          setError('Entry not found');
          return;
        }

        setAllEntries(scoringEntries);
        setEntry(currentEntry);
        setClassInfo(toClassInfo(cls, scoringEntries.length));
        setRules(buildResolvedClassRules(cls));
      } catch (err) {
        logger.error('Failed to load secretary scoring data:', 'pages', {}, err as Error);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [classId, entryId]);

  // Navigation
  const currentIndex = allEntries.findIndex(e => e.entryId === entryId);
  const hasNext = currentIndex < allEntries.length - 1;

  const handleNext = () => {
    const nextEntry = allEntries[currentIndex + 1];
    if (nextEntry) {
      navigate(`/scoring/secretary/classes/${classId}/entries/${nextEntry.entryId}`);
    }
  };

  const handleBack = () => {
    navigate(`/scoring/secretary/classes/${classId}/entries`);
  };

  // Score submission
  const handleSubmit = async (scoreData: ScoreData) => {
    if (!entry || !classInfo) return;

    await submitScoreOptimistically({
      entryId: parseInt(entry.entryId, 10),
      classId: parseInt(classInfo.id, 10),
      armband: entry.armband,
      className: classInfo.name,
      scoreData: {
        resultText: scoreData.resultText,
        searchTime: scoreData.searchTime || '',
        faultCount: scoreData.faultCount || 0,
        ...(scoreData.areaTimes &&
          scoreData.areaTimes.length > 0 && {
            areaTimes: scoreData.areaTimes,
          }),
        ...(scoreData.nonQualifyingReason && {
          nonQualifyingReason: scoreData.nonQualifyingReason,
        }),
        ...(scoreData.element && { element: scoreData.element }),
        ...(scoreData.level && { level: scoreData.level }),
        ...(scoreData.correctCount > 0 && {
          correctCount: scoreData.correctCount,
        }),
        ...(scoreData.incorrectCount > 0 && {
          incorrectCount: scoreData.incorrectCount,
        }),
        ...(scoreData.finishCallErrors > 0 && {
          finishCallErrors: scoreData.finishCallErrors,
        }),
        ...(scoreData.points > 0 && { points: scoreData.points }),
        ...(Object.keys(scoreData.areas).length > 0 && {
          areas: scoreData.areas,
        }),
      },
      onSuccess: () => {
        setEntry(prev => (prev ? { ...prev, isScored: true, status: 'scored' } : null));
      },
      onError: err => {
        logger.error('Secretary score submission failed:', 'pages', {}, err as Error);
      },
    });
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
  if (error || !entry || !classInfo || !rules) {
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

  // Resolve sport type
  const { organization, sportType } = trialSportType
    ? mapSportType(trialSportType)
    : { organization: 'Unknown' as Organization, sportType: 'unknown' as SportType };

  const registryKey = toRegistryKey(organization, sportType);
  const EntryScoresheet = registryKey ? getScoresheetComponent(registryKey, 'entry') : null;

  if (!EntryScoresheet) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Go back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Score Entry</h1>
            <p className="text-muted-foreground">
              {organization} {sportType} - Not yet implemented
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-6 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium mb-2">Entry Scoresheet Not Available</p>
          <p className="text-muted-foreground">
            The entry scoresheet for {organization} {sportType} is not yet implemented.
          </p>
        </div>
      </div>
    );
  }

  const scoresheetEntry: ScoresheetEntry = {
    ...toScoresheetEntry(entry),
    className: classInfo.name,
    ...(classInfo.element != null && { element: classInfo.element }),
    ...(classInfo.level != null && { level: classInfo.level }),
  };

  const scoresheetClassInfo = toScoresheetClassInfo(classInfo);

  return (
    <>
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
      <EntryScoresheet
        entry={scoresheetEntry}
        classInfo={scoresheetClassInfo}
        rules={rules}
        onSubmit={handleSubmit}
        {...(hasNext ? { onNext: handleNext } : {})}
        onBack={handleBack}
      />
    </>
  );
}

export default SecretaryScoringPage;
