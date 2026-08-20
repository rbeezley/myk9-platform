/**
 * Members and Officers table renderers for the Club Members page.
 *
 * Extracted from ClubMembersPage to keep files under 500 lines. Presentation
 * only — all mutation handlers are passed in from the page.
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Users, Plus, Shield, Trash2, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import {
  MEMBERSHIP_TYPE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  OFFICER_POSITION_LABELS,
  type MembershipType,
  type MembershipStatus,
  type ClubMember,
  type ClubOfficer,
} from '@/types/club-membership-types';
import { MemberActionMenu, TYPE_BADGE_CLASSES, STATUS_BADGE_CLASSES } from './ClubMemberDialogs';

/** Placeholder for an empty table cell (ASCII hyphen — no em dash in UI copy). */
const EMPTY_CELL = '-';

// --- Members table ---

interface MembersTableProps {
  members: ClubMember[];
  showManagerIds: Set<string>;
  searchQuery: string;
  onAddMember: () => void;
  onChangeType: (memberId: string, type: MembershipType) => void;
  onChangeStatus: (memberId: string, status: MembershipStatus) => void;
  onRemove: (memberId: string) => void;
  onToggleShowAccess: (personId: string, grant: boolean) => void;
}

export const MembersTable: React.FC<MembersTableProps> = ({
  members,
  showManagerIds,
  searchQuery,
  onAddMember,
  onChangeType,
  onChangeStatus,
  onRemove,
  onToggleShowAccess,
}) => (
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
        {members.map(member => (
          <tr key={member.id} className="border-b border-border hover:bg-accent transition-colors">
            <td className="px-4 py-3 font-medium text-foreground">
              <span className="flex flex-wrap items-center gap-2">
                {member.personName || 'Unknown'}
                {showManagerIds.has(member.personId) && (
                  <Badge className="bg-success/10 text-success border-success/20 text-xs">
                    <KeyRound className="h-3 w-3 mr-1" />
                    Show Manager
                  </Badge>
                )}
              </span>
            </td>
            <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
              {member.personEmail || EMPTY_CELL}
            </td>
            <td className="px-4 py-3">
              <Badge className={TYPE_BADGE_CLASSES[member.membershipType]}>
                {MEMBERSHIP_TYPE_LABELS[member.membershipType]}
              </Badge>
            </td>
            <td className="px-4 py-3">
              <Badge className={STATUS_BADGE_CLASSES[member.membershipStatus]}>
                {MEMBERSHIP_STATUS_LABELS[member.membershipStatus]}
              </Badge>
            </td>
            <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
              {member.joinedDate ? format(new Date(member.joinedDate), 'MMM d, yyyy') : EMPTY_CELL}
            </td>
            <td className="px-4 py-3 text-right">
              <MemberActionMenu
                member={member}
                hasShowAccess={showManagerIds.has(member.personId)}
                onChangeType={onChangeType}
                onChangeStatus={onChangeStatus}
                onRemove={onRemove}
                onToggleShowAccess={onToggleShowAccess}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>

    {members.length === 0 && (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="bg-[color:var(--chip-stone-bg)] rounded-full p-6 mb-4">
          <Users className="h-12 w-12 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-foreground">
          {searchQuery ? 'No Members Found' : 'No Members Yet'}
        </h3>
        <p className="text-muted-foreground mb-4 text-center max-w-sm">
          {searchQuery
            ? 'Try adjusting your search terms.'
            : 'Add your first club member to get started.'}
        </p>
        {!searchQuery && (
          <Button onClick={onAddMember}>
            <Plus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        )}
      </div>
    )}
  </div>
);

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
              <Badge className="bg-primary/10 text-primary border-primary/20">
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
              {officer.termStart && officer.termEnd
                ? `${format(new Date(officer.termStart), 'MMM yyyy')} - ${format(new Date(officer.termEnd), 'MMM yyyy')}`
                : officer.termStart
                  ? `From ${format(new Date(officer.termStart), 'MMM yyyy')}`
                  : EMPTY_CELL}
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
