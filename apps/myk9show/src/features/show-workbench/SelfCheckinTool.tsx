import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import {
  useClassOverrides,
  useShowSettings,
  useTrialOverrides,
} from '@/hooks/queries/useShowSettingsDatabase';
import { useBulkUpdateClassOverrides } from '@/hooks/mutations/useShowSettingsMutations';
import { OverrideTree } from '@/pages/secretary/ResultsControlPage/OverrideTree';
import { ShowCheckinToggle } from '@/pages/secretary/ResultsControlPage/ShowCheckinToggle';
import { toast } from 'sonner';

export interface SelfCheckinToolClass {
  id: string;
  trialId: string;
  name?: string | undefined;
  element?: string | undefined;
  level?: string | undefined;
  section?: string | undefined;
  className?: string | undefined;
}

interface SelfCheckinToolProps {
  showId: string;
  trials: Array<{ id: string; name?: string | undefined }>;
  classes: SelfCheckinToolClass[];
}

const getClassId = (item: SelfCheckinToolClass) => item.id;

interface CheckinBulkActionsProps {
  showId: string;
  selectedClasses: Set<string>;
  allClassIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
}

function CheckinBulkActions({
  showId,
  selectedClasses,
  allClassIds,
  onSelectAll,
  onClearSelection,
}: CheckinBulkActionsProps) {
  const updateClasses = useBulkUpdateClassOverrides();

  if (selectedClasses.size === 0) return null;

  function updateCheckin(enabled: boolean) {
    const validIds = new Set(allClassIds);
    const classIds = Array.from(selectedClasses).filter(id => validIds.has(id));
    if (classIds.length === 0) {
      toast.warning('Those classes are no longer in this show. The selection has been cleared.');
      onClearSelection();
      return;
    }

    updateClasses.mutate(
      { classIds, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => {
          toast.success(
            `Self check-in ${enabled ? 'enabled' : 'disabled'} for ${classIds.length} class${classIds.length === 1 ? '' : 'es'}`
          );
          onClearSelection();
        },
        onError: () => toast.error('Failed to update self check-in'),
      }
    );
  }

  const count = selectedClasses.size;

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {count} class{count === 1 ? '' : 'es'} selected
        </span>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onSelectAll}>
          Select all ({allClassIds.length})
        </Button>
        <Button type="button" variant="ghost" className="min-h-11" onClick={onClearSelection}>
          Clear
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={updateClasses.isPending}
          onClick={() => updateCheckin(true)}
        >
          Enable self check-in
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={updateClasses.isPending}
          onClick={() => updateCheckin(false)}
        >
          Disable self check-in
        </Button>
      </div>
    </div>
  );
}

export function SelfCheckinTool({ showId, trials, classes }: SelfCheckinToolProps) {
  const settingsQuery = useShowSettings(showId);
  const trialOverridesQuery = useTrialOverrides(showId);
  const classOverridesQuery = useClassOverrides(showId);
  const selection = useBulkSelection({
    items: classes,
    getItemId: getClassId,
    pruneToItems: true,
    resetKey: showId,
  });

  const retryAll = useCallback(() => {
    void settingsQuery.refetch();
    void trialOverridesQuery.refetch();
    void classOverridesQuery.refetch();
  }, [classOverridesQuery, settingsQuery, trialOverridesQuery]);

  const isLoading =
    settingsQuery.isLoading || trialOverridesQuery.isLoading || classOverridesQuery.isLoading;
  const isUnavailable =
    settingsQuery.data === undefined ||
    trialOverridesQuery.data === undefined ||
    classOverridesQuery.data === undefined;
  const hasRefreshError =
    settingsQuery.isError || trialOverridesQuery.isError || classOverridesQuery.isError;

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="self-checkin-loading">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (isUnavailable) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">Couldn&apos;t load self check-in settings.</p>
        <p className="mt-1 text-muted-foreground">
          Show Desk is still available. Try loading these settings again.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 min-h-11"
          aria-label="Retry self check-in settings"
          onClick={retryAll}
        >
          Retry
        </Button>
      </div>
    );
  }

  const allClassIds = classes.map(item => item.id);

  return (
    <div className="space-y-4">
      {hasRefreshError && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="font-medium">Saved settings shown below may be out of date.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-2 min-h-11"
            aria-label="Retry self check-in settings"
            onClick={retryAll}
          >
            Retry
          </Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Choose whether exhibitors can check themselves in. Trial and class overrides inherit from
        the setting above them.
      </p>
      <ShowCheckinToggle showId={showId} enabled={settingsQuery.data.selfCheckinEnabled} />
      <CheckinBulkActions
        showId={showId}
        selectedClasses={selection.selectedIds}
        allClassIds={allClassIds}
        onSelectAll={selection.selectAll}
        onClearSelection={selection.clearSelection}
      />
      <OverrideTree
        facet="checkin"
        showId={showId}
        settings={settingsQuery.data}
        trials={trials}
        classes={classes}
        trialOverrides={trialOverridesQuery.data}
        classOverrides={classOverridesQuery.data}
        selectedClasses={selection.selectedIds}
        onToggleClass={classId => {
          const item = classes.find(candidate => candidate.id === classId);
          if (item) selection.toggleItem(item);
        }}
        onToggleAllInTrial={(_trialId, classIds) => {
          const idSet = new Set(classIds);
          const trialClasses = classes.filter(item => idSet.has(item.id));
          const allSelected = trialClasses.every(item => selection.selectedIds.has(item.id));
          if (allSelected) selection.deselectItems(trialClasses);
          else selection.selectItems(trialClasses);
        }}
      />
    </div>
  );
}
