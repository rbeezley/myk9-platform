import { useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle, List, PanelTop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useScoringBreadcrumb } from './useScoringBreadcrumb';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { replicatedShowsTable } from '@/services/replication/ReplicatedShowsTable';
import { replicatedTrialsTable } from '@/services/replication/ReplicatedTrialsTable';
import { supabase } from '@/services/database/supabaseClient';
import { organizationMatches } from '@/lib/dogRegistrationBreed';
import { useAuthContext } from '@/hooks/useAuthContext';
import { toScoringEntry, calculatePlacements } from './types';
import { usePaperScoring } from './hooks/usePaperScoring';
import { SessionToolbar } from './components/SessionToolbar';
import { SplitPanelView } from './components/SplitPanelView';
import { SequentialView } from './components/SequentialView';
import { sortByExhibitorOrder } from './paper-scoring-types';
import { cn } from '@/lib/utils';
import type { ScoringEntry } from './types';
import type { PaperResult, PaperScoringMode } from './paper-scoring-types';

/** Fetch all entries for a class with their dog data, parallelising dog lookups. */
async function loadEntriesWithDogs(classId: string): Promise<ScoringEntry[]> {
  const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
  const uniqueDogIds = [...new Set(rawEntries.map(e => e.dogId).filter(Boolean))] as string[];
  const dogs = await Promise.all(uniqueDogIds.map(id => replicatedDogsTable.get(id)));
  const dogsMap = new Map(uniqueDogIds.map((id, i) => [id, dogs[i] ?? null]));
  const organization = await loadShowOrganizationForClass(classId);
  const registeredBreedByDogId = await loadRegisteredBreedsByDogId(uniqueDogIds, organization);
  return rawEntries.map((e, i) =>
    toScoringEntry(
      e,
      dogsMap.get(e.dogId ?? '') ?? null,
      i,
      e.dogId ? registeredBreedByDogId.get(e.dogId) : undefined
    )
  );
}

async function loadShowOrganizationForClass(classId: string): Promise<string | undefined> {
  const cls = await replicatedClassesTable.getClassById(classId);
  if (!cls?.trialId) return undefined;
  const trial = await replicatedTrialsTable.getTrialById(cls.trialId);
  if (!trial?.showId) return undefined;
  const show = await replicatedShowsTable.get(trial.showId);
  return show?.organization || undefined;
}

async function loadRegisteredBreedsByDogId(
  dogIds: string[],
  organization: string | undefined
): Promise<Map<string, string>> {
  if (!organization || dogIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('dog_registrations')
    .select('dog_id, organization, breed')
    .in('dog_id', dogIds);

  if (error || !data) return new Map();

  const breeds = new Map<string, string>();
  for (const registration of data) {
    if (!registration.dog_id || !registration.breed || !registration.organization) continue;
    if (breeds.has(registration.dog_id)) continue;
    if (organizationMatches(registration.organization, organization)) {
      breeds.set(registration.dog_id, registration.breed);
    }
  }
  return breeds;
}

function getClassDetailsHref({
  showId,
  trialId,
  classId,
}: {
  showId?: string | undefined;
  trialId?: string | undefined;
  classId?: string | undefined;
}): string | null {
  if (!classId) return null;
  if (showId && trialId) return `/shows/${showId}/trials/${trialId}/classes/${classId}`;
  return `/classes/${classId}`;
}

export function PaperScoresheetPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthContext();
  const breadcrumb = useScoringBreadcrumb(classId);
  const requestedEntryId = searchParams.get('entryId');
  const requestedMode = searchParams.get('mode');
  const appliedRequestRef = useRef<string | null>(null);
  const autoSelectedClassRef = useRef<string | null>(null);

  const [entries, setEntries] = useState<ScoringEntry[]>([]);
  const [className, setClassName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!classId) return;
      setIsLoading(true);
      setError(null);
      try {
        const cls = await replicatedClassesTable.getClassById(classId);
        if (!cls) {
          setError('Class not found');
          return;
        }
        const scoringEntries = await loadEntriesWithDogs(classId);
        setEntries(calculatePlacements(scoringEntries));
        setClassName(cls.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [classId]);

  const userId = user?.id ?? 'anonymous';
  const scoring = usePaperScoring(entries, userId);
  const scoringMode = scoring.mode;
  const setScoringMode = scoring.setMode;
  const sortedEntries = useMemo(() => sortByExhibitorOrder(entries), [entries]);
  const sequentialIndex = Math.max(
    0,
    sortedEntries.findIndex(entry => entry.entryId === scoring.selectedEntryId)
  );

  useEffect(() => {
    if (requestedMode !== 'split' && requestedMode !== 'sequential') return;
    if (scoringMode === requestedMode) return;
    setScoringMode(requestedMode);
  }, [requestedMode, scoringMode, setScoringMode]);

  useEffect(() => {
    if (!requestedEntryId || appliedRequestRef.current === requestedEntryId) return;
    if (!entries.some(entry => entry.entryId === requestedEntryId)) return;
    scoring.selectEntry(requestedEntryId);
    appliedRequestRef.current = requestedEntryId;
  }, [entries, requestedEntryId, scoring]);

  useEffect(() => {
    if (!classId || requestedEntryId || entries.length === 0) return;
    if (autoSelectedClassRef.current === classId) return;
    const firstEditableEntry = sortedEntries.find(entry => !entry.isScored) ?? sortedEntries[0];
    if (!firstEditableEntry) return;
    scoring.selectEntry(firstEditableEntry.entryId);
    autoSelectedClassRef.current = classId;
  }, [classId, entries.length, requestedEntryId, scoring, sortedEntries]);

  const reloadEntries = async (): Promise<ScoringEntry[]> => {
    if (!classId) return entries;
    const fresh = calculatePlacements(await loadEntriesWithDogs(classId));
    setEntries(fresh);
    return fresh;
  };

  const handleSave = async (
    result: PaperResult,
    timeDigits: string,
    faults: number,
    reason?: string
  ) => {
    if (!scoring.selectedEntryId) return;
    await scoring.saveEntry(scoring.selectedEntryId, result, timeDigits, faults, reason);
    await reloadEntries();
  };

  const handleSaveAndNext = async (
    result: PaperResult,
    timeDigits: string,
    faults: number,
    reason?: string
  ) => {
    if (!scoring.selectedEntryId) return;
    const currentEntryId = scoring.selectedEntryId;
    await scoring.saveEntry(currentEntryId, result, timeDigits, faults, reason);
    const fresh = await reloadEntries();
    const next = sortByExhibitorOrder(fresh).find(e => !e.isScored && e.entryId !== currentEntryId);
    scoring.selectEntry(next?.entryId ?? null);
  };

  const handleClearResult = async () => {
    if (!scoring.selectedEntryId) return;
    await scoring.clearEntry(scoring.selectedEntryId);
    await reloadEntries();
  };

  const handleModeChange = (mode: PaperScoringMode) => {
    scoring.setMode(mode);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('mode', mode);
    setSearchParams(nextParams, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  const scoredCount = entries.filter(e => e.isScored).length;
  const classDetailsHref = getClassDetailsHref(breadcrumb);

  return (
    <div className="flex flex-col h-full">
      {!breadcrumb.isLoading && (
        <div className="px-4 pt-4">
          <Breadcrumb
            items={[
              ...(breadcrumb.showName
                ? [{ label: breadcrumb.showName, href: `/shows/${breadcrumb.showId}` }]
                : []),
              ...(breadcrumb.trialLabel
                ? [{ label: breadcrumb.trialLabel, href: `/shows/${breadcrumb.showId}` }]
                : []),
              { label: className ?? 'Class', isCurrentPage: true },
            ]}
          />
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h1 className="text-xl font-bold">{className ?? 'Score Entry'}</h1>
          <p className="text-sm text-muted-foreground">
            {scoredCount} of {entries.length} scored
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (classDetailsHref) navigate(classDetailsHref);
              else navigate(-1);
            }}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back to Class</span>
            <span className="sm:hidden">Class</span>
          </Button>
          <ViewModeToggle mode={scoring.mode} onChange={handleModeChange} />
        </div>
      </div>

      <SessionToolbar settings={scoring.sessionSettings} onChange={scoring.setSessionSettings} />

      <div
        className={cn(
          'flex-1 overflow-hidden p-4',
          scoring.mode === 'sequential' && 'overflow-y-auto'
        )}
      >
        {scoring.mode === 'split' ? (
          <SplitPanelView
            entries={entries}
            settings={scoring.sessionSettings}
            selectedEntryId={scoring.selectedEntryId}
            onSelectEntry={scoring.selectEntry}
            onSave={handleSave}
            onSaveAndNext={handleSaveAndNext}
            onClearResult={handleClearResult}
            isSaving={scoring.isSaving}
          />
        ) : (
          <SequentialView
            entries={entries}
            currentIndex={sequentialIndex}
            settings={scoring.sessionSettings}
            onNavigate={index => {
              if (sortedEntries[index]) scoring.selectEntry(sortedEntries[index].entryId);
            }}
            onSave={handleSave}
            onSaveAndNext={handleSaveAndNext}
            onClearResult={handleClearResult}
            isSaving={scoring.isSaving}
          />
        )}
      </div>
    </div>
  );
}

export default PaperScoresheetPage;

function ViewModeToggle({
  mode,
  onChange,
}: {
  mode: PaperScoringMode;
  onChange: (mode: PaperScoringMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Scoring view"
      className="flex items-center gap-1 rounded-lg border bg-background p-1"
    >
      <ViewModeButton
        active={mode === 'split'}
        icon={<List className="h-4 w-4" />}
        label="List"
        onClick={() => onChange('split')}
      />
      <ViewModeButton
        active={mode === 'sequential'}
        icon={<PanelTop className="h-4 w-4" />}
        label="Card"
        onClick={() => onChange('sequential')}
      />
    </div>
  );
}

function ViewModeButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors',
        active
          ? 'bg-accent text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
