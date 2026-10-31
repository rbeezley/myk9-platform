/**
 * Everything a class-picker card needs beyond its own facts (MYK9-1506): the
 * heart, the info icon, the ellipsis and the upload indicator, plus the dialogs
 * they open. The page spreads `rowProps(entry)` onto each card and renders
 * `dialogs` once.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { getClassIds, isCombinedEntry, type ClassEntry } from '@myk9/ringside';
import { getTrialTimezone } from '@/features/registries';
import type { ReplicatedTrial } from '@/services/replication/ReplicatedTrialsTable';
import { AtShowClassCardDialogs, type ActiveClassCard } from './AtShowClassCardDialogs';
import { useAtShowClassFavorites } from './atShowClassFavorites';
import { useQueuedScoresByClass } from './useQueuedScoresByClass';
import { useRingsideEffectiveRole } from './useRingsideEffectiveRole';
import type { AtShowClassGroup } from './atShowClassListAdapter';

/** A finger is the primary pointer: details dock as a bottom sheet instead of anchoring. */
function prefersTouchSheet(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export interface ClassCardRowProps {
  queuedScoreCount: number;
  onToggleFavorite: (entry: ClassEntry) => void;
  onShowDetails: (entry: ClassEntry, anchor: HTMLElement, countsTrusted: boolean) => void;
  /** Undefined hides the ellipsis for roles that may not open Class Options. */
  onOpenOptions: ((entry: ClassEntry, anchor: HTMLElement) => void) | undefined;
}

export function useAtShowClassCards(showId: string | undefined, groups: AtShowClassGroup[]) {
  const trialIds = useMemo(() => groups.map(group => group.trial.id), [groups]);
  const { favoriteClassIds, toggleClassFavorite } = useAtShowClassFavorites(showId, trialIds);
  const queuedByClass = useQueuedScoresByClass(showId);
  const { hasPermission } = useRingsideEffectiveRole(showId);
  const canManageClasses = hasPermission('canManageClasses');

  const trialByClassId = useMemo(() => {
    const map = new Map<string, ReplicatedTrial>();
    for (const group of groups) for (const cls of group.classes) map.set(cls.id, group.trial);
    return map;
  }, [groups]);

  const anchorRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState<ActiveClassCard | null>(null);
  const [sheet, setSheet] = useState(false);
  const sessionRef = useRef(0);

  const open = useCallback(
    (mode: ActiveClassCard['mode']) =>
      (entry: ClassEntry, anchor: HTMLElement, countsTrusted = false) => {
        const trial = trialByClassId.get(entry.id) ?? null;
        anchorRef.current = anchor;
        setSheet(mode === 'details' && prefersTouchSheet());
        sessionRef.current += 1;
        setActive({
          entry,
          mode,
          trial,
          trialTimeZone: getTrialTimezone(trial),
          countsTrusted,
          session: sessionRef.current,
        });
      },
    [trialByClassId]
  );
  const close = useCallback(() => {
    // Hand focus back to the control that opened the dialog.
    const anchor = anchorRef.current;
    setActive(null);
    if (anchor?.isConnected) anchor.focus();
  }, []);

  const onShowDetails = useMemo(() => open('details'), [open]);
  const onOpenOptions = useMemo(() => open('options'), [open]);

  const rowProps = useCallback(
    (entry: ClassEntry): ClassCardRowProps => ({
      queuedScoreCount: getClassIds(entry).reduce(
        (sum, id) => sum + (queuedByClass.get(id) ?? 0),
        0
      ),
      onToggleFavorite: card =>
        void toggleClassFavorite(trialByClassId.get(card.id)?.id, getClassIds(card)),
      onShowDetails,
      // Class Options is the entry list's own gate: managers only, and one class at a
      // time (a combined A/B card has no single class to act on).
      onOpenOptions: canManageClasses && !isCombinedEntry(entry) ? onOpenOptions : undefined,
    }),
    [
      canManageClasses,
      onOpenOptions,
      onShowDetails,
      queuedByClass,
      toggleClassFavorite,
      trialByClassId,
    ]
  );

  const dialogs: ReactNode = (
    <AtShowClassCardDialogs
      active={active}
      anchorRef={anchorRef}
      sheet={sheet}
      canManageClasses={canManageClasses}
      showId={showId}
      onClose={close}
    />
  );

  return { favoriteClassIds, rowProps, dialogs };
}
