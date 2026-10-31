import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getClassesWithCapacity } from '@/services/database/day-of-operations';
import {
  usePageExportAction,
  useShowDeskToolsRegistration,
} from '@/features/actions/pageEditTarget';
import type { ShowToolItem } from '@/features/actions/showToolActions';
import {
  getShowDeskPeopleAtShowHref,
  SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID,
} from '@/features/show-desk-people-roster/peopleRosterRoutes';
import { buildShowDeskLateEntryPath } from '@/pages/RegistrationWizardPage.routes';
import {
  buildEntryListTools,
  sumEntryListCounts,
  type EntryListCounts,
} from '@/components/entries/management/entryManagementViews';

interface UseEntryManagementHeaderActionsOptions {
  showId: string | undefined;
  /** The viewer manages this show (resolved), the gate the header applies to every tool row. */
  canManage: boolean;
  counts: EntryListCounts;
  /** Set when the viewer manages the show but is not its trial secretary. */
  secretaryOnlyReason: string | undefined;
  /** A show is open and no status change is in flight (the export's own gate). */
  exportEnabled: boolean;
  onExport: () => void;
}

/** Same key the retired Late entry card used, so a cached answer is shared. */
const classCapacityKey = (showId: string) => ['show-workbench', showId, 'class-capacity'] as const;

async function hasOpenClass(showId: string): Promise<boolean> {
  const { data, error } = await getClassesWithCapacity(showId);
  if (error) throw error;
  return (data ?? []).some(cls => cls.available_spots > 0);
}

/**
 * What Entry Forms hands the header Actions menu (MYK9-1594): the four entry lists (badged when
 * one has something waiting, which also lights the Actions button), People at show and Add late
 * entry, and Export CSV. These were the toolbar's Show: select, More popover and Add Entry; the
 * header menu is the one menu, and the show page's own `useShowDeskToolsRegistration` replaces
 * this registration when the viewer leaves for it.
 */
export function useEntryManagementHeaderActions({
  showId,
  canManage,
  counts,
  secretaryOnlyReason,
  exportEnabled,
  onExport,
}: UseEntryManagementHeaderActionsOptions): void {
  const { pulls, moveUps, registrationNeeded } = counts;
  // No capacity read at all when the viewer could not act on the answer. While it loads the row
  // stays enabled: a disabled flash is worse than a wizard that says the class is full.
  const capacity = useQuery({
    queryKey: classCapacityKey(showId ?? ''),
    queryFn: () => hasOpenClass(showId ?? ''),
    enabled: Boolean(showId) && secretaryOnlyReason === undefined,
  });
  // The role reason outranks the capacity one.
  const lateEntryReason =
    secretaryOnlyReason ??
    (capacity.isError
      ? 'Class availability is unavailable'
      : capacity.data === false
        ? 'No classes with space'
        : undefined);
  const tools = useMemo<ShowToolItem[]>(() => {
    if (!showId) return [];
    return [
      ...buildEntryListTools(showId, { pulls, moveUps, registrationNeeded }),
      {
        id: SHOW_DESK_PEOPLE_AT_SHOW_TOOL_ID,
        group: 'show-day',
        title: 'People at show',
        href: getShowDeskPeopleAtShowHref({ showId }),
      },
      {
        // Late entry is a mode of the secretary flow, not a second way to add an entry
        // (MYK9-954 -> MYK9-1242), so it keeps the flow's own access reason.
        id: 'late-entry',
        group: 'show-day',
        title: 'Add late entry',
        href: buildShowDeskLateEntryPath(showId),
        ...(lateEntryReason !== undefined && { disabledReason: lateEntryReason }),
      },
    ];
  }, [showId, pulls, moveUps, registrationNeeded, lateEntryReason]);

  useShowDeskToolsRegistration(
    tools,
    {
      count: sumEntryListCounts({ pulls, moveUps, registrationNeeded }),
      tone: 'routine',
      incomplete: false,
    },
    canManage,
    showId
  );
  usePageExportAction({ id: 'entries', enabled: exportEnabled, run: onExport });
}
