import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, LayoutPanelLeft, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useScoringBreadcrumb } from './useScoringBreadcrumb';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { useAuthContext } from '@/hooks/useAuthContext';
import { toScoringEntry, calculatePlacements } from './types';
import { usePaperScoring } from './hooks/usePaperScoring';
import { SessionToolbar } from './components/SessionToolbar';
import { SplitPanelView } from './components/SplitPanelView';
import { SequentialView } from './components/SequentialView';
import { sortByExhibitorOrder } from './paper-scoring-types';
import { cn } from '@/lib/utils';
import type { ScoringEntry } from './types';
import type { PaperResult } from './paper-scoring-types';

/** Fetch all entries for a class with their dog data, parallelising dog lookups. */
async function loadEntriesWithDogs(classId: string): Promise<ScoringEntry[]> {
  const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
  const uniqueDogIds = [...new Set(rawEntries.map(e => e.dogId).filter(Boolean))] as string[];
  const dogs = await Promise.all(uniqueDogIds.map(id => replicatedDogsTable.get(id)));
  const dogsMap = new Map(uniqueDogIds.map((id, i) => [id, dogs[i] ?? null]));
  return rawEntries.map((e, i) => toScoringEntry(e, dogsMap.get(e.dogId ?? '') ?? null, i));
}

export function PaperScoresheetPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const breadcrumb = useScoringBreadcrumb(classId);

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

  const reloadEntries = async () => {
    if (!classId) return;
    setEntries(calculatePlacements(await loadEntriesWithDogs(classId)));
  };

  const handleSave = async (result: PaperResult, timeDigits: string, faults: number) => {
    if (!scoring.selectedEntryId) return;
    await scoring.saveEntry(scoring.selectedEntryId, result, timeDigits, faults);
    await reloadEntries();
  };

  const handleSaveAndNext = async (result: PaperResult, timeDigits: string, faults: number) => {
    if (!scoring.selectedEntryId) return;
    await scoring.saveAndNext(scoring.selectedEntryId, result, timeDigits, faults);
    await reloadEntries();
  };

  const sortedEntries = useMemo(() => sortByExhibitorOrder(entries), [entries]);

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
  const allScored = entries.length > 0 && scoredCount === entries.length;

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
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            variant={scoring.mode === 'split' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => scoring.setMode('split')}
            title="Split panel"
          >
            <LayoutPanelLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={scoring.mode === 'sequential' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => scoring.setMode('sequential')}
            title="Sequential"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SessionToolbar settings={scoring.sessionSettings} onChange={scoring.setSessionSettings} />

      {allScored && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-8">
          <p className="text-2xl font-bold">All dogs scored!</p>
          <p className="text-muted-foreground">{entries.length} entries complete.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back to Class
          </Button>
        </div>
      )}

      {!allScored && (
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
              isSaving={scoring.isSaving}
            />
          ) : (
            <SequentialView
              entries={entries}
              currentIndex={Math.max(0, scoring.currentIndex)}
              settings={scoring.sessionSettings}
              onNavigate={index => {
                if (sortedEntries[index]) scoring.selectEntry(sortedEntries[index].entryId);
              }}
              onSave={handleSave}
              onSaveAndNext={handleSaveAndNext}
              isSaving={scoring.isSaving}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default PaperScoresheetPage;
