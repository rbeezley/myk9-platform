/**
 * Members and Officers table renderers for the Club Members page.
 *
 * Extracted from ClubMembersPage to keep files under 500 lines. Presentation
 * only — all mutation handlers are passed in from the page.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Plus, Shield, Trash2, KeyRound, ShieldCheck } from 'lucide-react';
import { formatMonthYear, formatShortCalendarDate } from '@/lib/format/dates';
import {
  MEMBERSHIP_TYPE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  OFFICER_POSITION_LABELS,
  type MembershipType,
  type MembershipStatus,
  type ClubOfficer,
} from '@/types/club-membership-types';
import { TYPE_BADGE_CLASSES, STATUS_BADGE_CLASSES } from './ClubMemberDialogs';
import { MemberActionMenu, type RoleActions } from './MemberActionMenu';
import type { ClubPersonRow } from './clubMemberRows';

/** Placeholder for an empty table cell (ASCII hyphen — no em dash in UI copy). */
const EMPTY_CELL = '-';

/** "Jun 2025 - Jun 2027", "From Jun 2025" or the empty cell. */
function termLabel(officer: ClubOfficer): string {
  if (officer.termStart && officer.termEnd) {
    return `${formatMonthYear(officer.termStart)} - ${formatMonthYear(officer.termEnd)}`;
  }
  return officer.termStart ? `From ${formatMonthYear(officer.termStart)}` : EMPTY_CELL;
}

const ROLE_BADGE_CLASS = 'text-xs';
const UNKNOWN_BADGE_CLASS =
  'text-xs border-dashed bg-transparent text-muted-foreground hover:bg-transparent';

/**
 * The role badges on a person's Name cell (MYK9-2364). A role whose list could not be read shows
 * as "unknown", never as absent: "no badge" has to mean the person does not hold the role.
 */
const RoleBadges: React.FC<{ row: ClubPersonRow }> = ({ row }) => (
  <>
    {row.isAdmin === true && (
      <Badge
        className={`${ROLE_BADGE_CLASS} bg-info/10 text-info-strong border-info/20 hover:bg-info/10`}
      >
        <ShieldCheck className="h-3 w-3 mr-1" />
        Admin
      </Badge>
    )}
    {row.isAdmin === null && <Badge className={UNKNOWN_BADGE_CLASS}>Admin unknown</Badge>}
    {row.isShowSecretary === true && (
      <Badge
        className={`${ROLE_BADGE_CLASS} bg-success/10 text-success border-success/20 hover:bg-success/10`}
      >
        <KeyRound className="h-3 w-3 mr-1" />
        Show secretary
      </Badge>
    )}
    {row.isShowSecretary === null && (
      <Badge className={UNKNOWN_BADGE_CLASS}>Show secretary unknown</Badge>
    )}
    {row.officerTitles.map(officer => (
      <Badge
        key={officer.id}
        title={`Term: ${termLabel(officer)}`}
        className={`${ROLE_BADGE_CLASS} bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] border-transparent hover:bg-[color:var(--chip-stone-bg)]`}
      >
        <Shield className="h-3 w-3 mr-1" />
        {OFFICER_POSITION_LABELS[officer.position]}
      </Badge>
    ))}
    {!row.officersKnown && <Badge className={UNKNOWN_BADGE_CLASS}>Officer titles unknown</Badge>}
  </>
);

// --- Members table ---

interface MembersTableProps {
  rows: ClubPersonRow[];
  roleActions: RoleActions;
  searchQuery: string;
  /** A role view, status or search is narrowing the list; defaults to whether there is a search. */
  filtered?: boolean;
  /** A role list is missing, so "no match" cannot be confirmed from what loaded. */
  incomplete?: boolean;
  onShowAll?: () => void;
  onAddMember: () => void;
  onChangeType: (memberId: string, type: MembershipType) => void;
  onChangeStatus: (memberId: string, status: MembershipStatus) => void;
  onRemove: (memberId: string) => void;
  onToggleShowAccess: (personId: string, grant: boolean, personName?: string) => void;
}

export const MembersTable: React.FC<MembersTableProps> = ({
  rows,
  roleActions,
  searchQuery,
  filtered,
  incomplete = false,
  onShowAll,
  onAddMember,
  onChangeType,
  onChangeStatus,
  onRemove,
  onToggleShowAccess,
}) => {
  const isFiltered = filtered ?? !!searchQuery;
  // Unknown role flags match nobody, so an empty result is only a finding when every list loaded.
  const unverified = isFiltered && incomplete;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-[color:var(--chip-stone-bg)]">
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Name</th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">
              Email
            </th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Type</th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
            <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">
              Joined
            </th>
            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-b border-border hover:bg-accent transition-colors">
              <td className="px-4 py-3 font-medium text-foreground">
                <span className="flex flex-wrap items-center gap-2">
                  {row.name}
                  <RoleBadges row={row} />
                </span>
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                {row.email || EMPTY_CELL}
              </td>
              <td className="px-4 py-3">
                {row.member ? (
                  <Badge className={TYPE_BADGE_CLASSES[row.member.membershipType]}>
                    {MEMBERSHIP_TYPE_LABELS[row.member.membershipType]}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Not a club member</span>
                )}
              </td>
              <td className="px-4 py-3">
                {row.member ? (
                  <Badge className={STATUS_BADGE_CLASSES[row.member.membershipStatus]}>
                    {MEMBERSHIP_STATUS_LABELS[row.member.membershipStatus]}
                  </Badge>
                ) : (
                  EMPTY_CELL
                )}
              </td>
              <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                {row.member?.joinedDate
                  ? formatShortCalendarDate(row.member.joinedDate)
                  : EMPTY_CELL}
              </td>
              <td className="px-4 py-3 text-right">
                <MemberActionMenu
                  row={row}
                  onChangeType={onChangeType}
                  onChangeStatus={onChangeStatus}
                  onRemove={onRemove}
                  onToggleShowAccess={onToggleShowAccess}
                  roleActions={roleActions}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <div className="bg-[color:var(--chip-stone-bg)] rounded-full p-6 mb-4">
            <Users className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2 text-foreground">
            {unverified
              ? "Can't tell who matches yet"
              : searchQuery
                ? 'No Members Found'
                : isFiltered
                  ? 'Nobody in this view'
                  : 'No Members Yet'}
          </h3>
          <p className="text-muted-foreground mb-4 text-center max-w-sm">
            {unverified
              ? "Some lists couldn't be loaded, so we can't confirm that nobody matches. Reconnect or try again, or show everyone."
              : searchQuery
                ? 'Try adjusting your search terms.'
                : isFiltered
                  ? 'Nobody matches the view and filters you picked.'
                  : 'Add your first club member to get started.'}
          </p>
          {isFiltered && onShowAll && (
            <Button variant="outline" onClick={onShowAll}>
              Show all people
            </Button>
          )}
          {!isFiltered && (
            <Button onClick={onAddMember}>
              <Plus className="h-4 w-4 mr-2" />
              Add Member
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

// --- Officers table ---

interface OfficersTableProps {
  officers: ClubOfficer[];
  onAssignOfficer: () => void;
  onRemoveOfficer: (officerId: string) => void;
}

export const OfficersTable: React.FC<OfficersTableProps> = ({
  officers,
  onAssignOfficer,
  onRemoveOfficer,
}) => (
  <div className="overflow-x-auto rounded-xl border border-border">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border bg-[color:var(--chip-stone-bg)]">
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Position</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Name</th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden sm:table-cell">
            Email
          </th>
          <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">
            Term
          </th>
          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {officers.map(officer => (
          <tr key={officer.id} className="border-b border-border hover:bg-accent transition-colors">
            <td className="px-4 py-3">
              <Badge className="bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] border-transparent hover:bg-[color:var(--chip-stone-bg)]">
                {OFFICER_POSITION_LABELS[officer.position]}
              </Badge>
            </td>
            <td className="px-4 py-3 font-medium text-foreground">
              {officer.personName || 'Unknown'}
            </td>
            <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
              {officer.personEmail || EMPTY_CELL}
            </td>
            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
              {termLabel(officer)}
            </td>
            <td className="px-4 py-3 text-right">
              <button
                onClick={() => onRemoveOfficer(officer.id)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="Remove from position"
                aria-label={`Remove ${officer.personName || 'officer'} from ${OFFICER_POSITION_LABELS[officer.position]}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    {officers.length === 0 && (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="bg-[color:var(--chip-stone-bg)] rounded-full p-6 mb-4">
          <Shield className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-foreground">No Officers Assigned</h3>
        <p className="text-muted-foreground mb-4 text-center max-w-sm">
          Assign officers to manage club positions.
        </p>
        <Button onClick={onAssignOfficer}>
          <Shield className="h-4 w-4 mr-2" />
          Assign Officer
        </Button>
      </div>
    )}
  </div>
);
