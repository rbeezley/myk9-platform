/**
 * "Saved views (this device)" control — personal, device-local save/reapply
 * UI over `localViewPreferences.ts` (tasks.md 3.3, design.md Decision 2).
 *
 * This component only calls the existing storage helpers; it never writes to
 * `localStorage` directly and never bypasses `validateOperationalView`.
 * Restoring re-applies through the caller's `onApply`, which every current
 * caller wires to the same normalized-URL setters presets use — never a
 * second state path.
 */
import { useMemo, useState } from 'react';
import { Bookmark, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  clearLocalView,
  restoreLocalView,
  saveLocalView,
  type SavedViewShowScope,
} from '@/features/operational-views/localViewPreferences';
import type { OperationalView, OperationalViewSurfaceId } from '@/features/operational-views/operationalViews';

interface SavedViewsControlProps<TView extends OperationalView> {
  surface: OperationalViewSurfaceId;
  /** Authenticated user id. Saved views are namespaced per user; no id disables the control entirely. */
  userId: string | null | undefined;
  showScope: SavedViewShowScope;
  /** Build the view definition to save from the surface's current filter/display state. */
  buildCurrentView: () => TView;
  /** Apply a restored view back through the surface's own normalized-URL setters. */
  onApply: (view: TView) => void;
}

/**
 * Device-local save/reapply. Only one view per user+surface is stored today
 * (see localViewPreferences.ts key shape) — this is intentionally a single
 * "Save this view" / "Reapply" pair, not a list, matching the SLC scope of
 * this change (no view-naming/multi-slot UI yet).
 */
export function SavedViewsControl<TView extends OperationalView>({
  surface,
  userId,
  showScope,
  buildCurrentView,
  onApply,
}: SavedViewsControlProps<TView>) {
  const [savedAtTick, setSavedAtTick] = useState(0);
  const storage = typeof window !== 'undefined' ? window.localStorage : undefined;

  // Re-derive whenever the show scope, user, or a save/clear happens. Reading
  // here (not in an effect) also lets restoreLocalView prune an invalid/
  // cross-show entry as a side effect without a render loop — the result is
  // stable given the same inputs.
  const savedView = useMemo(
    () => (userId ? restoreLocalView(storage, userId, surface, showScope) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- savedAtTick forces re-read after save/clear writes
    [userId, surface, showScope.showId, showScope.trialId, showScope.classId, storage, savedAtTick]
  );

  if (!userId) return null;

  const handleSave = () => {
    saveLocalView(storage, userId, showScope, buildCurrentView());
    setSavedAtTick(tick => tick + 1);
  };

  const handleReapply = () => {
    if (savedView) onApply(savedView as TView);
  };

  const handleClear = () => {
    clearLocalView(storage, userId, surface);
    setSavedAtTick(tick => tick + 1);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5">
          <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Saved views (this device)</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved views (this device)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {savedView ? (
          <>
            <DropdownMenuItem onSelect={handleReapply}>
              <Check className="mr-2 h-4 w-4" aria-hidden="true" />
              Reapply saved view
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleSave}>Update saved view</DropdownMenuItem>
            <DropdownMenuItem onSelect={handleClear} className="text-destructive">
              Remove saved view
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem onSelect={handleSave}>Save this view</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default SavedViewsControl;
