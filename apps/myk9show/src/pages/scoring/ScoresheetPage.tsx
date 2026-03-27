/**
 * ScoresheetPage
 *
 * Router component that dispatches to the appropriate LiveScoresheet
 * based on the organization and sport type. Uses the getScoresheetComponent
 * registry to resolve the correct component at runtime.
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, WifiOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';

import { useAuthContext } from '@/hooks/useAuthContext';
import { useEntryStore } from '@/store/entryStore';
import { logger } from '@/services/LoggingService';
import { getScoresheetComponent, buildResolvedClassRules } from '@myk9/scoring-ui';
import type { ResolvedClassRules, ScoreData } from '@myk9/scoring-ui';

// Ensure all live scoresheets are registered (import triggers self-registration)
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

/**
 * Main scoresheet page - routes to correct scoresheet component
 */
export function ScoresheetPage() {
  const { classId, entryId } = useParams<{ classId: string; entryId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();

  const { submitScoreOptimistically, isSyncing, hasError: hasSyncError } = useOptimisticScoring();

  const [entry, setEntry] = useState<ScoringEntry | null>(null);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [rules, setRules] = useState<ResolvedClassRules | null>(null);
  const [trialSportType, setTrialSportType] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      if (!classId || !entryId) {
        setError('Missing class or entry ID');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Load class and entry count in parallel
        const [cls, allEntries] = await Promise.all([
          replicatedClassesTable.getClassById(classId),
          replicatedEntriesTable.getEntriesByClass(classId),
        ]);

        if (!cls) {
          setError('Class not found');
          return;
        }

        // Derive sport type from show organization + trial type
        const derived = await resolveSportTypeForClass(cls.trialId);
        if (derived) {
          setTrialSportType(derived);
        }

        // Find target entry from the list
        const rawEntry = allEntries.find(e => e.id === entryId);
        if (!rawEntry) {
          setError('Entry not found');
          return;
        }

        // Auto-set check-in status to in-ring when scoresheet opens
        if (rawEntry.checkInStatus !== 'completed') {
          const updateCheckInStatus = useEntryStore.getState().updateCheckInStatus;
          updateCheckInStatus(rawEntry.id, 'in-ring', user?.id ?? 'system');
          replicatedEntriesTable.updateEntry(rawEntry.id, {
            ring_entry_time: new Date().toISOString(),
          });
        }

        // Load only the needed dog
        const dog = rawEntry.dogId ? await replicatedDogsTable.get(rawEntry.dogId) : null;

        const scoringEntry = toScoringEntry(rawEntry, dog, 0);

        setEntry(scoringEntry);
        setClassInfo(toClassInfo(cls, allEntries.length));
        setRules(buildResolvedClassRules(cls));
      } catch (err) {
        logger.error('Failed to load scoresheet data:', 'pages', {}, err as Error);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [classId, entryId]);

  // Submit handler — passes full ScoreData through to optimistic scoring
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

        // Auto-set check-in status to completed after scoring
        const updateCheckInStatus = useEntryStore.getState().updateCheckInStatus;
        updateCheckInStatus(entry.entryId, 'completed', user?.id ?? 'system');
        replicatedEntriesTable.updateEntry(entry.entryId, {
          ring_exit_time: new Date().toISOString(),
        });
      },
      onError: err => {
        logger.error('Score submission failed:', 'pages', {}, err as Error);
      },
    });
  };

  const handleBack = () => {
    navigate(`/scoring/classes/${classId}/entries`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

  // Use registry to resolve scoresheet component
  const registryKey = toRegistryKey(organization, sportType);
  const LiveScoresheet = registryKey ? getScoresheetComponent(registryKey, 'live') : null;

  if (!LiveScoresheet) {
    return (
      <div className="container max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Go back">
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
      <LiveScoresheet
        entry={toScoresheetEntry(entry, classInfo)}
        classInfo={toScoresheetClassInfo(classInfo)}
        rules={rules}
        onSubmit={handleSubmit}
        onBack={handleBack}
      />
    </>
  );
}

export default ScoresheetPage;
