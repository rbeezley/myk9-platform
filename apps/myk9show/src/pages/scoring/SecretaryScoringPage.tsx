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
import { logger } from '@/services/LoggingService';
import { getScoresheetComponent, buildResolvedClassRules } from '@myk9/scoring-ui';
import type { ScoreData, ResolvedClassRules } from '@myk9/scoring-ui';

// Ensure all scoresheets are registered (import triggers self-registration)
import '@myk9/scoring-ui';

import type { ScoringEntry, ClassInfo } from './types';
import {
  toScoringEntry,
  toClassInfo,
  resolveSportTypeForClass,
  mapSportType,
  detectScoresheetType,
  toRegistryKey,
  toScoresheetEntry,
  toScoresheetClassInfo,
  toOptimisticScorePayload,
} from './types';

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

        // Derive sport type from show organization + trial type
        const derived = await resolveSportTypeForClass(cls.trialId);
        if (derived) {
          setTrialSportType(derived);
        }

        const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);

        // Load all dogs in parallel (deduplicate by dogId)
        const uniqueDogIds = [...new Set(rawEntries.map(e => e.dogId).filter(Boolean))] as string[];
        const dogs = await Promise.all(uniqueDogIds.map(id => replicatedDogsTable.get(id)));
        const dogsMap = new Map<string, NonNullable<(typeof dogs)[number]>>();
        dogs.forEach((dog, i) => {
          if (dog) dogsMap.set(uniqueDogIds[i], dog);
        });

        const scoringEntries = rawEntries.map((e, i) => {
          const dog = e.dogId ? (dogsMap.get(e.dogId) ?? null) : null;
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
      scoreData: toOptimisticScorePayload(scoreData),
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

  // Resolve sport type from trial (preferred) or class name (fallback)
  const { organization, sportType } = trialSportType
    ? mapSportType(trialSportType)
    : detectScoresheetType(classInfo);

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

  const scoresheetEntry = toScoresheetEntry(entry, classInfo);
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
