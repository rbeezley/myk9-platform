import React from 'react';
import { AlertTriangle, Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Club } from '@/types/club-types';
import type { ClubMember } from '@/types/club-membership-types';
import { MemberList } from '../members/MemberList';
import { RequestShowAccessCard } from './RequestShowAccessCard';

interface MembersTabProps {
  club: Club;
  members: ClubMember[];
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  onRetry: () => void;
  canManageMembers: boolean;
  /** Whether this viewer reads the whole roster, not just her own row. Defaults to `canManageMembers`. */
  canSeeFullRoster?: boolean;
  onAddMember: () => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  club,
  members,
  isLoading,
  isRefreshing,
  isError,
  onRetry,
  canManageMembers,
  canSeeFullRoster = canManageMembers,
  onAddMember,
}) => {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading club members" className="space-y-4">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(index => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
        <h3 className="text-lg font-semibold">We couldn&apos;t load club members</h3>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          Check your connection and try again. Your club membership data is unchanged.
        </p>
        <Button onClick={onRetry} className="mt-4">
          Try again
        </Button>
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <RequestShowAccessCard key={club.id} club={club} />
        </div>
        <div className="text-center py-16 px-8 bg-muted/50 rounded-2xl border border-dashed border-border">
          <Users className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-60" />
          {/* MYK9-2467: this list is read by people who are not the club's admin, and they can
              read at most their own row. An empty list here says nothing about the club, so it
              never claims the club has no members. */}
          <div className="text-lg font-medium mb-2 text-foreground">
            {canManageMembers ? 'No Members Yet' : 'Member list'}
          </div>
          <div className="text-sm text-muted-foreground leading-relaxed mb-5">
            {canManageMembers
              ? "This club doesn't have any members yet. Add your first member to get started."
              : "Only this club's admins can see the member list."}
          </div>
          {canManageMembers && (
            <Button onClick={onAddMember} className="inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add First Member
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">
              {canSeeFullRoster ? 'Club Members' : 'Your membership'}
            </h3>
            {/* Anyone but an admin reads only her own row: say so, or one name reads as the club. */}
            {!canSeeFullRoster && (
              <p className="text-sm text-muted-foreground">
                Only this club&apos;s admins can see the full member list.
              </p>
            )}
          </div>
          {isRefreshing && (
            <span
              role="status"
              aria-label="Updating members"
              className="text-sm text-muted-foreground"
            >
              Updating members…
            </span>
          )}
          <div className="flex items-center gap-2">
            <RequestShowAccessCard key={club.id} club={club} />
            {canManageMembers && (
              <Button onClick={onAddMember} className="min-h-[44px]">
                <Plus className="w-5 h-5 mr-2" />
                Add Member
              </Button>
            )}
          </div>
        </div>
        <MemberList club={club} members={members} canManageMembers={canManageMembers} />
      </div>
    </div>
  );
};
