import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, LayoutPanelLeft, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Breadcrumb } from '@/components/common/Breadcrumb';
import { useScoringBreadcrumb } from './useScoringBreadcrumb';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedDogsTable } from '@/services/replication/ReplicatedDogsTable';
import { useAuthContext } from '@/hooks/useAuthContext';
import { toScoringEntry, toClassInfo, calculatePlacements } from './types';
import { usePaperScoring } from './hooks/usePaperScoring';
import { SessionToolbar } from './components/SessionToolbar';
import { SplitPanelView } from './components/SplitPanelView';
import { SequentialView } from './components/SequentialView';
import { cn } from '@/lib/utils';
import type { ScoringEntry, ClassInfo } from './types';
import type { PaperResult } from './paper-scoring-types';

export function PaperScoresheetPage() {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const breadcrumb = useScoringBreadcrumb(classId);

  const [entries, setEntries] = useState<ScoringEntry[]>([]);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
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

        const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
        const dogsMap = new Map();
        for (const e of rawEntries) {
          if (e.dogId && !dogsMap.has(e.dogId)) {
            const dog = await replicatedDogsTable.get(e.dogId);
            if (dog) dogsMap.set(e.dogId, dog);
          }
        }
        const scoringEntries = rawEntries.map((e, i) =>
          toScoringEntry(e, dogsMap.get(e.dogId) ?? null, i)
        );
        setEntries(calculatePlacements(scoringEntries));
        setClassInfo(toClassInfo(cls, scoringEntries.length));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [classId]);

  const userId = user?.id ?? 'anonymous';
  const scoring = usePaperScoring(entries, classId ?? '', userId);

  const reloadEntries = async () => {
    if (!classId) return;
    const rawEntries = await replicatedEntriesTable.getEntriesByClass(classId);
    const dogsMap = new Map();
    for (const e of rawEntries) {
      if (e.dogId && !dogsMap.has(e.dogId)) {
        const dog = await replicatedDogsTable.get(e.dogId);
        if (dog) dogsMap.set(e.dogId, dog);
      }
    }
    const updated = rawEntries.map((e, i) => toScoringEntry(e, dogsMap.get(e.dogId) ?? null, i));
    setEntries(calculatePlacements(updated));
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

  const allScored = entries.length > 0 && entries.every(e => e.isScored);

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
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
              { label: classInfo?.name ?? 'Class', isCurrentPage: true },
            ]}
          />
        </div>
      )}

      {/* Page header with mode toggle */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div>
          <h1 className="text-xl font-bold">{classInfo?.name ?? 'Score Entry'}</h1>
          <p className="text-sm text-muted-foreground">
            {entries.filter(e => e.isScored).length} of {entries.length} scored
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

      {/* Session toolbar */}
      <SessionToolbar settings={scoring.sessionSettings} onChange={scoring.setSessionSettings} />

      {/* All done */}
      {allScored && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center p-8">
          <p className="text-2xl font-bold">All dogs scored!</p>
          <p className="text-muted-foreground">{entries.length} entries complete.</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            Back to Class
          </Button>
        </div>
      )}

      {/* Main content */}
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
                const sorted = [...entries].sort((a, b) => a.exhibitorOrder - b.exhibitorOrder);
                if (sorted[index]) scoring.selectEntry(sorted[index].entryId);
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
