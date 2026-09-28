/**
 * ResultsBulkBar — Results Control's bulk actions on the shared list-toolkit
 * `FloatingBulkBar` (MYK9-812 surface 4), replacing the page's former
 * fixed-footer `BulkOperationsBar` 1:1: same count/noun/Clear (now the kit's),
 * the same "Select All (M)" button (owner decision, matching Self check-in),
 * the same "Apply Preset" `Select`, and the same AlertDialog-wrapped "Release
 * Results" / "Hide Results" buttons with unchanged eligibility gating and
 * unchanged toast/partial-failure wording.
 *
 * "Apply Preset" (via `useBulkUpdateClassOverrides`) still writes the online-only
 * `show_visibility_settings`/`*_visibility_overrides` path, which has no offline
 * replication path (MYK9-849 option (b)): it disables with a "Needs a
 * connection" hint while offline instead of failing after the fact.
 * "Release Results" / "Hide Results" are already replicated
 * (`useReleaseResults`/`useUnreleaseResults`) and unaffected by this change.
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
import { ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { PRESET_INFO, PRESET_CONFIGS, type VisibilityPreset } from '@myk9/secretary';
import { useBulkUpdateClassOverrides } from '@/hooks/mutations/useShowSettingsMutations';
import { useReleaseResults } from '@/hooks/mutations/useReleaseResults';
import { useUnreleaseResults } from '@/hooks/mutations/useUnreleaseResults';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { NEEDS_CONNECTION_HINT } from '@/lib/needsConnectionHint';
import { FloatingBulkBar, BulkBarButton } from '@/components/list-toolkit';

const CLASS_NOUN = ['class', 'classes'] as const;

interface ResultsBulkBarProps {
  showId: string;
  selectedClasses: Set<string>;
  allClassIds: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Drop specific class IDs from the selection (used to keep only failed releases selected). */
  onDeselectClasses: (classIds: string[]) => void;
  hasManualReleaseClasses: boolean;
  /** Whether at least one selected class currently has results released — gates "Hide results". */
  hasReleasedClasses: boolean;
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
  onDeselectClasses,
  hasManualReleaseClasses,
  hasReleasedClasses,
}: ResultsBulkBarProps) {
  const bulkUpdate = useBulkUpdateClassOverrides();
  const releaseResults = useReleaseResults();
  const unreleaseResults = useUnreleaseResults();
  const { isOnline } = useNetworkStatus();
  const connectionHint = isOnline ? undefined : NEEDS_CONNECTION_HINT;

  if (selectedClasses.size === 0) return null;

  const isPending = bulkUpdate.isPending || releaseResults.isPending || unreleaseResults.isPending;
  const presetDisabled = isPending || !isOnline;

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

  function handleReleaseResults() {
    const classIds = getValidClassIds(selectedClasses, allClassIds);
    if (classIds.length === 0) {
      toast.warning('Those classes are no longer in this show. The selection has been cleared.');
      onClearSelection();
      return;
    }
    releaseResults.mutate(
      { classIds, showId },
      {
        // Clean release → clear everything. Partial release → drop the classes that
        // succeeded so only the failed ones stay selected, making retry re-release just
        // those (no re-stamping resultsReleasedAt on already-released classes). Total
        // failure → keep the whole selection (every class is a failed class).
        // Every branch toasts so the bulk action never resolves silently. This
        // is the ONLY layer that toasts: `useReleaseResults` used to toast as
        // well, so one release produced two differently-worded messages
        // ("Results released for 3 classes" and "Released results for 3
        // classes") and read as two separate operations. The message belongs
        // here because it describes the selection outcome, which only this
        // layer knows.
        onSuccess: ({ released, failed }) => {
          if (failed.length === 0) {
            toast.success(
              `Released results for ${released.length} class${released.length === 1 ? '' : 'es'}`
            );
            onClearSelection();
          } else if (released.length > 0) {
            toast.warning(
              `Released ${released.length}, but ${failed.length} failed. The failed class${failed.length === 1 ? '' : 'es'} stayed selected so you can retry.`
            );
            onDeselectClasses(released);
          } else {
            toast.error('Could not release the selected results. Try again.');
          }
        },
        onError: () => toast.error('Could not release the selected results. Try again.'),
      }
    );
  }

  function handleUnreleaseResults() {
    const classIds = getValidClassIds(selectedClasses, allClassIds);
    if (classIds.length === 0) {
      toast.warning('Those classes are no longer in this show. The selection has been cleared.');
      onClearSelection();
      return;
    }
    unreleaseResults.mutate(
      { classIds, showId },
      {
        // Same success-branch shape as release: clean success clears the whole
        // selection, partial success keeps only the failed classes selected, and
        // total failure keeps everything selected so nothing silently resolves.
        onSuccess: ({ unreleased, failed }) => {
          if (failed.length === 0) {
            toast.success(
              `Hid results for ${unreleased.length} class${unreleased.length === 1 ? '' : 'es'}`
            );
            onClearSelection();
          } else if (unreleased.length > 0) {
            toast.warning(
              `Hid ${unreleased.length}, but ${failed.length} failed. The failed class${failed.length === 1 ? '' : 'es'} stayed selected so you can retry.`
            );
            onDeselectClasses(unreleased);
          } else {
            toast.error('Could not hide the selected results. Try again.');
          }
        },
        onError: () => toast.error('Could not hide the selected results. Try again.'),
      }
    );
  }

  const count = selectedClasses.size;

  // Surface why Release is disabled instead of leaving a silently greyed
  // primary action: nothing in the selection is held for manual review.
  const releaseHint = hasManualReleaseClasses
    ? undefined
    : 'Only classes set to hold for review can be released here.';

  return (
    <FloatingBulkBar count={count} noun={CLASS_NOUN} onClear={onClearSelection}>
      <BulkBarButton
        onClick={onSelectAll}
        icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
      >
        Select All ({allClassIds.length})
      </BulkBarButton>
      <Select onValueChange={v => handleBulkPreset(v as VisibilityPreset)} disabled={presetDisabled}>
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            className="min-h-[44px] shrink-0"
            disabled={!hasManualReleaseClasses || isPending}
            title={releaseHint}
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
              Results become visible to exhibitors and spectators right away. You can hide them
              again from here, but anyone who already viewed the page won&apos;t see it refresh on
              its own.
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
      {hasReleasedClasses && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] shrink-0"
              disabled={isPending}
            >
              Hide Results
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Hide results for {count} class{count === 1 ? '' : 'es'}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Exhibitors and spectators will no longer be able to see these results. Anyone who
                already viewed the results page won&apos;t see it retroactively refresh — it only
                affects new page loads.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleUnreleaseResults} disabled={isPending}>
                Hide Results
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </FloatingBulkBar>
  );
}
