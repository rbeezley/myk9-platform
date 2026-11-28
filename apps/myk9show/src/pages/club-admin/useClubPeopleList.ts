/**
 * The merged "one list" behind the club Members tab (MYK9-2364): rows from members, admins, show
 * secretaries and officers, the role views carried in `?view=`, the Status filter field carried in
 * `?status=`, and the admin actions that open the same confirms the Admins tab uses.
 */

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { patchSearchParams } from '@/components/list-toolkit';
import type { ListFilterField, ListView } from '@/components/list-toolkit';
import type { ClubMember, ClubOfficer } from '@/types/club-membership-types';
import { MEMBERSHIP_STATUS_LABELS, type MembershipStatus } from '@/types/club-membership-types';
import type { ClubShowManager } from '@/services/database/club-memberships';
import { useOnlineStatus } from '@/lib/networkUtils';
import { useClubAdmins } from './useClubAdmins';
import {
  buildRoleViews,
  filterClubPersonRows,
  mergeClubPersonRows,
  parseRoleView,
  type ClubPersonRow,
  type ClubRowSources,
} from './clubMemberRows';
import { filterClubMembers, type MemberStatusFilter } from './clubMemberListViews';

const STATUS_IDS = Object.keys(MEMBERSHIP_STATUS_LABELS) as MembershipStatus[];

interface ClubPeopleListInput {
  clubId: string;
  members: ClubMember[];
  /** Null while the source is unavailable (its query failed). */
  officers: ClubOfficer[] | null;
  showManagers: ClubShowManager[] | null;
  searchQuery: string;
}

export function useClubPeopleList({
  clubId,
  members,
  officers,
  showManagers,
  searchQuery,
}: ClubPeopleListInput) {
  const [searchParams, setSearchParams] = useSearchParams();
  const admins = useClubAdmins(clubId);
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null);

  const view = parseRoleView(searchParams.get('view'));
  const rawStatus = searchParams.get('status');
  // An unknown ?status= has no control to show or reset it, so it reads as 'all'.
  const status = (STATUS_IDS.find(id => id === rawStatus) ?? 'all') as MemberStatusFilter;

  // The admin list is online-only: offline (even with a cached copy, which may be stale), still
  // loading or failed, admin badges are unknown and admin actions are off.
  const online = useOnlineStatus();
  const adminsOffline = !online || admins.isOffline;
  const adminsUnavailable = adminsOffline || admins.isError;
  const adminsKnown = !adminsUnavailable && !admins.isLoading;

  const sources = useMemo<ClubRowSources>(
    () => ({ members, admins: adminsKnown ? admins.admins : null, showManagers, officers }),
    [members, adminsKnown, admins.admins, showManagers, officers]
  );
  const complete =
    sources.admins !== null && sources.showManagers !== null && sources.officers !== null;
  const rows = useMemo(() => mergeClubPersonRows(sources), [sources]);
  const views = useMemo<ListView[]>(() => buildRoleViews(rows, sources), [rows, sources]);
  const filteredRows = useMemo(
    () => filterClubPersonRows(rows, { view, status, search: searchQuery }),
    [rows, view, status, searchQuery]
  );

  const statusField: ListFilterField = {
    kind: 'options',
    key: 'status',
    label: 'Status',
    allLabel: 'Any status',
    value: status === 'all' ? null : status,
    onChange: value => patchSearchParams(setSearchParams, { status: value }),
    options: STATUS_IDS.map(id => ({
      value: id,
      label: MEMBERSHIP_STATUS_LABELS[id],
      count: filterClubMembers(members, id, '').length,
    })),
  };

  const confirmAdd = async () => {
    const target = confirmingEmail;
    setConfirmingEmail(null);
    if (!target) return;
    try {
      await admins.addAdmin(target);
    } catch {
      // The hook already told the admin.
    }
  };

  return {
    rows,
    views,
    filteredRows,
    view,
    status,
    statusField,
    hasActiveFilters: view !== 'all' || status !== 'all' || searchQuery.trim() !== '',
    adminsUnavailable,
    adminsOffline,
    complete,
    retryAdmins: admins.retry,
    selectView: (id: string) =>
      patchSearchParams(setSearchParams, { view: id === 'all' ? null : id }),
    showAll: () => patchSearchParams(setSearchParams, { view: null, status: null, q: null }),
    adminDialogProps: {
      confirmingEmail,
      onCancelAdd: () => setConfirmingEmail(null),
      onConfirmAdd: () => void confirmAdd(),
      pendingRemoval: admins.pendingRemoval,
      onCancelRemoval: admins.cancelRemoval,
      onConfirmRemoval: admins.confirmRemoval,
    },
    makeAdmin: (row: ClubPersonRow) => {
      if (row.email) setConfirmingEmail(row.email);
    },
    removeAdmin: (row: ClubPersonRow) => {
      if (!row.personId) return;
      admins.requestRemoval({
        personId: row.personId,
        personName: row.name,
        personEmail: row.email,
      });
    },
  };
}
