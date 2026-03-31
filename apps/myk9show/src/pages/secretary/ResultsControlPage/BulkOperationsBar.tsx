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
  hasManualReleaseClasses: boolean;
}

export function BulkOperationsBar({
  showId,
  selectedClasses,
  allClassIds,
  onSelectAll,
  onClearSelection,
  hasManualReleaseClasses,
}: BulkOperationsBarProps) {
  const bulkUpdate = useBulkUpdateClassOverrides();
  const releaseResults = useReleaseResults();

  if (selectedClasses.size === 0) return null;

  function handleBulkPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    const classIds = Array.from(selectedClasses);
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
    const classIds = Array.from(selectedClasses);
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
    const classIds = Array.from(selectedClasses);
    releaseResults.mutate({ classIds, showId }, { onSuccess: () => onClearSelection() });
  }

  const count = selectedClasses.size;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-3 shadow-lg">
      <div className="container mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {count} class{count === 1 ? '' : 'es'} selected
          </span>
          <Button variant="ghost" size="sm" onClick={onSelectAll}>
            Select All ({allClassIds.length})
          </Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select onValueChange={v => handleBulkPreset(v as VisibilityPreset)}>
            <SelectTrigger className="w-36">
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
          <Button variant="outline" size="sm" onClick={() => handleBulkCheckin(true)}>
            Enable Check-in
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleBulkCheckin(false)}>
            Disable Check-in
          </Button>
          <Button
            size="sm"
            onClick={handleReleaseResults}
            disabled={!hasManualReleaseClasses || releaseResults.isPending}
          >
            Release Results
          </Button>
        </div>
      </div>
    </div>
  );
}
