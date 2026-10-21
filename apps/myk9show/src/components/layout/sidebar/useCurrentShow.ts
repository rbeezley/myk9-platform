import { useCallback, useEffect, useMemo, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useBrowseShowsList } from '@/hooks/useBrowseShowsList';
import { groupShowsForPane, REGROUP_INTERVAL_MS } from '@/components/shows/browse/showsPaneGroups';
import { ShowPermissionValidator } from '@/utils/permissionValidation';
import { getUserManagedShows } from '@/utils/show-relationships';
import type { Show } from '@/types/show-types';
import {
  pickCurrentShow,
  readCurrentShowChoice,
  readLastOpenedShowId,
  writeCurrentShowChoice,
  writeLastOpenedShowId,
} from './currentShow';

export interface CurrentShowState {
  currentShow: Show | null;
  /** Managed shows not yet over, in Managing order; the Switch menu lists these. */
  managingShows: Show[];
  chooseShow: (id: string) => void;
}

/**
 * The current show for the rail, read from the shows replica (`useBrowseShowsList`) so it works
 * offline. "Manages" is what the Shows list's Managing section means (`getUserManagedShows`); a
 * site admin manages every show, so nothing is singled out and they get no item. Also remembers
 * the last managed show opened, however the viewer got there, for the fallback rule.
 */
export function useCurrentShow(): CurrentShowState {
  const { userWithRoles, isAdmin } = useAuthContext();
  const { shows } = useBrowseShowsList();
  const { pathname } = useLocation();
  const [now, setNow] = useState(() => new Date());
  const [choice, setChoice] = useState<string | null>(readCurrentShowChoice);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), REGROUP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const managedShows = useMemo(() => {
    if (isAdmin || !userWithRoles) return [];
    const userId = userWithRoles.databaseUserId ?? userWithRoles.id;
    const visible = ShowPermissionValidator.filterShows(shows, userWithRoles);
    return getUserManagedShows(
      userId,
      visible,
      userWithRoles.roles ?? [],
      userWithRoles.scopes ?? []
    );
  }, [isAdmin, userWithRoles, shows]);

  const managingShows = useMemo(() => {
    const managedIds = new Set(managedShows.map(show => show.id));
    const groups = groupShowsForPane(managedShows, show => managedIds.has(show.id), now);
    return groups.find(group => group.id === 'managing')?.shows ?? [];
  }, [managedShows, now]);

  const openedId = matchPath('/shows/:id/*', pathname)?.params.id ?? null;
  const openedManagedId =
    openedId && managedShows.some(show => show.id === openedId) ? openedId : null;
  useEffect(() => {
    if (!openedManagedId) return;
    writeLastOpenedShowId(openedManagedId);
  }, [openedManagedId]);

  // Inside a managed show that show is the last opened, even before the effect above has written it.
  const currentShow = useMemo(
    () =>
      pickCurrentShow({
        managingShows,
        managedShows,
        // Intentional read: a per-device memory, so it needs no re-render when it changes.
        lastOpenedId: openedManagedId ?? readLastOpenedShowId(),
        rememberedChoice: choice,
      }),
    [managingShows, managedShows, openedManagedId, choice]
  );

  const chooseShow = useCallback((id: string) => {
    writeCurrentShowChoice(id);
    setChoice(id);
  }, []);

  return { currentShow, managingShows, chooseShow };
}
