/**
 * Row action menu for the club members table: profile, membership type/status,
 * show access and removal. Split from ClubMemberDialogs to keep files under 500 lines.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/hooks/useAuthContext';
import { PEOPLE_ROUTE_ROLES } from '@/routes/peopleRouteRoles';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MoreVertical, Trash2, KeyRound, UserRound } from 'lucide-react';
import type { ClubMember } from '@/types/club-membership-types';
import {
  MEMBERSHIP_TYPE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  type MembershipType,
  type MembershipStatus,
} from '@/types/club-membership-types';

// --- Member Action Menu ---

// This menu used to be hand-rolled: `useState` + `absolute right-0 top-full`,
// which pins the popup below the trigger UNCONDITIONALLY. Measured on staging
// at 1280x600, the last row's trigger sat at y=532 with 24px of space below it
// while the popup is 573px tall, so it rendered 20px of itself and 553px off
// the bottom of the screen — an unreachable sliver. Nothing in that markup
// could ever have flipped or bounded it. DropdownMenu portals to the body and
// carries the collision + max-height handling that makes the last row usable.
//
// min-h-11 holds each row at the 44px touch-target floor (text-sm + py-2.5
// alone is only 40px).
const MENU_ITEM_BASE = 'min-h-11 px-3 py-2.5 text-sm';

const MENU_LABEL_BASE = 'px-3 py-1.5 text-xs uppercase tracking-wider text-muted-foreground';

interface ActionMenuProps {
  member: ClubMember;
  hasShowAccess: boolean;
  onChangeType: (memberId: string, type: MembershipType) => void;
  onChangeStatus: (memberId: string, status: MembershipStatus) => void;
  onRemove: (memberId: string) => void;
  onToggleShowAccess: (personId: string, grant: boolean) => void;
}

export const MemberActionMenu: React.FC<ActionMenuProps> = ({
  member,
  hasShowAccess,
  onChangeType,
  onChangeStatus,
  onRemove,
  onToggleShowAccess,
}) => {
  const navigate = useNavigate();
  const { hasRole } = useAuthContext();
  // A club admin who is not also a secretary or site admin would be refused by /people/:id.
  const canOpenProfile = PEOPLE_ROUTE_ROLES.some(role => hasRole(role));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Actions for ${member.personName || 'member'}`}
      >
        <MoreVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* MYK9-1293: the read-only roster's View Details, for viewers the people route admits. */}
        {canOpenProfile && (
          <>
            <DropdownMenuItem
              onClick={() => navigate(`/people/${member.personId}`)}
              className={MENU_ITEM_BASE}
            >
              <UserRound className="mr-2 h-4 w-4" />
              View profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuGroup>
          <DropdownMenuLabel className={MENU_LABEL_BASE}>Change Type</DropdownMenuLabel>
          {(Object.entries(MEMBERSHIP_TYPE_LABELS) as [MembershipType, string][]).map(
            ([type, label]) => (
              <DropdownMenuItem
                key={type}
                onClick={() => onChangeType(member.id, type)}
                disabled={member.membershipType === type}
                className={MENU_ITEM_BASE}
              >
                {label}
                {member.membershipType === type && (
                  <span className="ml-1 text-xs text-muted-foreground">(current)</span>
                )}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className={MENU_LABEL_BASE}>Change Status</DropdownMenuLabel>
          {(Object.entries(MEMBERSHIP_STATUS_LABELS) as [MembershipStatus, string][]).map(
            ([status, label]) => (
              <DropdownMenuItem
                key={status}
                onClick={() => onChangeStatus(member.id, status)}
                disabled={member.membershipStatus === status}
                className={MENU_ITEM_BASE}
              >
                {label}
                {member.membershipStatus === status && (
                  <span className="ml-1 text-xs text-muted-foreground">(current)</span>
                )}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className={MENU_LABEL_BASE}>Show Access</DropdownMenuLabel>
          {/*
          Appointment is the grant, and it is independent of membership: a club may
          appoint a professional secretary who is a member of none of its clubs, and a
          member going lapsed no longer revokes anything. This item used to be disabled
          for every non-active member, which was the membership rule enforced twice —
          once in the database and once here.
        */}
          <DropdownMenuItem
            onClick={() => onToggleShowAccess(member.personId, !hasShowAccess)}
            className={cn(
              MENU_ITEM_BASE,
              hasShowAccess
                ? 'text-warning focus:bg-warning/10'
                : 'text-success focus:bg-success/10'
            )}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {hasShowAccess ? 'Revoke Show Access' : 'Grant Show Access'}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() => onRemove(member.id)}
          className={cn(MENU_ITEM_BASE, 'text-destructive focus:bg-destructive/10')}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove Member
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
