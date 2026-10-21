/**
 * ResultsBulkBar — Results Control's bulk actions on the shared list-toolkit
 * `FloatingBulkBar` (MYK9-812 surface 4): the kit's count/noun/Clear, the same
 * "Select All (M)" button (owner decision, matching Self check-in) and the
 * "Apply Preset" `Select`.
 *
 * Releasing and hiding results is NOT here (MYK9-1318): a class is released
 * from its detail on the Results tab, the one release path. This bar only sets
 * visibility.
 *
 * "Apply Preset" (via `useBulkUpdateClassOverrides`) writes the online-only
 * `show_visibility_settings`/`*_visibility_overrides` path, which has no offline
 * replication path (MYK9-849 option (b)): it disables with a "Needs a
 * connection" hint while offline instead of failing after the fact.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import { useBulkUpdateClassOverrides } from '@/hooks/mutations/useShowSettingsMutations';
import { useConnectionHint } from '@/hooks/useConnectionHint';
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';

const CLASS_NOUN = ['class', 'classes'] as const;

interface ResultsBulkBarProps {
  showId: string;
  selectedClasses: Set<string>;
  allClassIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
}

/** Filter selected classes to only those belonging to the current show */
function getValidClassIds(selectedClasses: Set<string>, allClassIds: string[]): string[] {
  const validSet = new Set(allClassIds);
  return Array.from(selectedClasses).filter(id => validSet.has(id));
}

export function ResultsBulkBar({
  showId,
  selectedClasses,
  allClassIds,
  onSelectAll,
  onClearSelection,
}: ResultsBulkBarProps) {
  const bulkUpdate = useBulkUpdateClassOverrides();
  const connectionHint = useConnectionHint();

  if (selectedClasses.size === 0) return null;

  const presetDisabled = bulkUpdate.isPending || Boolean(connectionHint);

  function handleBulkPreset(preset: VisibilityPreset) {
    const cfg = PRESET_CONFIGS[preset];
    const classIds = getValidClassIds(selectedClasses, allClassIds);
    if (classIds.length === 0) {
      toast.warning('Those classes are no longer in this show. The selection has been cleared.');
      onClearSelection();
      return;
    }
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

  const count = selectedClasses.size;

  return (
    <FloatingBulkBar count={count} noun={CLASS_NOUN} onClear={onClearSelection}>
      <BulkBarButton
        onClick={onSelectAll}
        icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
      >
        Select All ({allClassIds.length})
      </BulkBarButton>
      <Select
        onValueChange={v => handleBulkPreset(v as VisibilityPreset)}
        disabled={presetDisabled}
      >
        <SelectTrigger className="h-11 w-36 shrink-0" title={connectionHint}>
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
      {connectionHint && (
        <span
          className="whitespace-nowrap px-2 text-xs text-muted-foreground"
          role="status"
          aria-label={`Apply Preset: ${connectionHint}`}
        >
          {connectionHint}
        </span>
      )}
    </FloatingBulkBar>
  );
}
