/**
 * BulkOperationsBar — sticky bottom bar with bulk actions for selected classes.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import { useBulkUpdateClassOverrides } from '@/hooks/mutations/useShowSettingsMutations';
import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';

interface BulkOperationsBarProps {
  showId: string;
  selectedClasses: Set<string>;
  allClassIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Drop specific class IDs from the selection (used to keep only failed releases selected). */
  onDeselectClasses: (classIds: string[]) => void;
  hasManualReleaseClasses: boolean;
}

/** Filter selected classes to only those belonging to the current show */
function getValidClassIds(selectedClasses: Set<string>, allClassIds: string[]): string[] {
  const validSet = new Set(allClassIds);
  return Array.from(selectedClasses).filter(id => validSet.has(id));
}

export function BulkOperationsBar({
  showId,
  selectedClasses,
  allClassIds,
  onSelectAll,
  onClearSelection,
  onDeselectClasses,
  hasManualReleaseClasses,
}: BulkOperationsBarProps) {
  const bulkUpdate = useBulkUpdateClassOverrides();
  const releaseResults = useReleaseResults();

  if (selectedClasses.size === 0) return null;

  const isPending = bulkUpdate.isPending || releaseResults.isPending;

  function handleBulkPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    const classIds = getValidClassIds(selectedClasses, allClassIds);
    if (classIds.length === 0) return;
    bulkUpdate.mutate(
      {
        classIds,
        showId,
        preset,
        placementTiming: cfg.placement,
        qualificationTiming: cfg.qualification,
        timeTiming: cfg.time,
        faultsTiming: cfg.faults,
      },
      {
        onSuccess: () => {
          toast.success(
            `Applied "${PRESET_INFO[preset].title}" to ${classIds.length} class${classIds.length === 1 ? '' : 'es'}`
          );
          onClearSelection();
        },
        onError: () => toast.error('Failed to apply preset'),
      }
    );
  }

  function handleBulkCheckin(enabled: boolean) {
    const classIds = getValidClassIds(selectedClasses, allClassIds);
    if (classIds.length === 0) return;
    bulkUpdate.mutate(
      { classIds, showId, selfCheckinEnabled: enabled },
      {
        onSuccess: () => {
          toast.success(
            `Self check-in ${enabled ? 'enabled' : 'disabled'} for ${classIds.length} class${classIds.length === 1 ? '' : 'es'}`
          );
          onClearSelection();
        },
        onError: () => toast.error('Failed to update check-in'),
      }
    );
  }

  function handleReleaseResults() {
    const classIds = getValidClassIds(selectedClasses, allClassIds);
    if (classIds.length === 0) return;
    releaseResults.mutate(
      { classIds, showId },
      {
        // Clean release → clear everything. Partial release → drop the classes that
        // succeeded so only the failed ones stay selected, making retry re-release just
        // those (no re-stamping resultsReleasedAt on already-released classes). Total
        // failure → keep the whole selection (every class is a failed class).
        onSuccess: ({ released, failed }) => {
          if (failed.length === 0) {
            onClearSelection();
          } else if (released.length > 0) {
            onDeselectClasses(released);
          }
        },
      }
    );
  }

  const count = selectedClasses.size;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-medium">
            {count} class{count === 1 ? '' : 'es'} selected
          </span>
          {/* size="sm" keeps the dense bar compact; min-h-[44px] meets the touch floor. */}
          <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={onSelectAll}>
            Select All ({allClassIds.length})
          </Button>
          <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={v => handleBulkPreset(v as VisibilityPreset)} disabled={isPending}>
            <SelectTrigger className="min-h-[44px] w-36">
              <SelectValue placeholder="Apply Preset" />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PRESET_INFO) as VisibilityPreset[]).map(p => (
                <SelectItem key={p} value={p}>
                  {PRESET_INFO[p].title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => handleBulkCheckin(true)}
            disabled={isPending}
          >
            Enable Check-in
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => handleBulkCheckin(false)}
            disabled={isPending}
          >
            Disable Check-in
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                className="min-h-[44px]"
                disabled={!hasManualReleaseClasses || isPending}
              >
                Release Results
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Release results for {count} class{count === 1 ? '' : 'es'}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This makes results publicly visible to exhibitors and spectators right away.
                  It can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReleaseResults} disabled={isPending}>
                  Release Results
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
