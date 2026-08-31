/**
 * Show Access — who is appointed to run this club's shows.
 *
 * WHY THIS TAB EXISTS. Show access used to be a badge on a club_members row, which
 * worked only because appointment required an active membership: every appointee had a
 * roster row to hang the badge on. Once appointment stopped requiring membership
 * (20260830210000), that arrangement broke in both directions at once — a club could
 * appoint a professional secretary who then appeared nowhere in the UI, could not be
 * revoked (Revoke Show Access lives in a member row's menu), and could not have been
 * appointed in the first place, because Grant Show Access lives in that same menu.
 *
 * So this is not a second copy of the roster. It is the only surface that can show a
 * person who is not on the roster, which is exactly the case the permission change was
 * made to serve.
 *
 * INTENT: a club admin should be able to answer "who can touch our shows?" by looking,
 * not by asking. Membership status is shown next to each appointee because it is useful
 * context, and deliberately NOT as a warning — a lapsed member who is still appointed is
 * a normal state now, not a problem to fix.
 */

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/common/FormField';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { KeyRound, Search, Plus, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { User } from '@/types/user-types';
import type { ClubShowManager } from '@/services/database/club-memberships';
import { MEMBERSHIP_STATUS_LABELS, type MembershipStatus } from '@/types/club-membership-types';
import { STATUS_BADGE_CLASSES } from './ClubMemberDialogs';

// --- Appoint dialog ---

interface AppointDialogProps {
  open: boolean;
  onClose: () => void;
  onAppoint: (personId: string) => void;
  people: User[];
  appointedIds: Set<string>;
  isSaving: boolean;
}

export const AppointSecretaryDialog: React.FC<AppointDialogProps> = ({
  open,
  onClose,
  onAppoint,
  people,
  appointedIds,
  isSaving,
}) => {
  const [search, setSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');

  // Deliberately NOT filtered to club members. That filter is the bug this tab exists
  // to fix: the people most likely to be appointed are the ones with no membership.
  const availablePeople = useMemo(() => {
    const filtered = people.filter(p => !appointedIds.has(p.id));
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    );
  }, [people, appointedIds, search]);

  const reset = () => {
    setSelectedPersonId('');
    setSearch('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <div className="flex items-center gap-3 pb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <DialogTitle className="text-lg font-semibold text-foreground">
            Appoint Show Secretary
          </DialogTitle>
        </div>
        <div className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            They will be able to create and run any of this club&apos;s shows. Club membership is
            not required.
          </p>
          <FormField label="Person" fieldId="secretary-search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="secretary-search"
                placeholder="Search by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 border-border"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-[color:var(--chip-stone-bg)]">
              {availablePeople.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">No people found</p>
              ) : (
                availablePeople.slice(0, 20).map(person => (
                  <button
                    key={person.id}
                    onClick={() => setSelectedPersonId(person.id)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm min-h-11 transition-colors',
                      selectedPersonId === person.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-card text-foreground'
                    )}
                  >
                    <span className="font-medium">
                      {person.firstName} {person.lastName}
                    </span>
                    {person.email && (
                      <span className="text-muted-foreground ml-2">{person.email}</span>
                    )}
                  </button>
                ))
              )}
            </div>
            {availablePeople.length > 20 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Showing the first 20 of {availablePeople.length}. Keep typing to narrow the list.
              </p>
            )}
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="border-border">
              Cancel
            </Button>
            <Button
              onClick={() => selectedPersonId && onAppoint(selectedPersonId)}
              disabled={!selectedPersonId || isSaving}
            >
              {isSaving ? 'Appointing...' : 'Appoint'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- Tab ---

interface ClubShowAccessTabProps {
  managers: ClubShowManager[];
  unavailable: boolean;
  onRetry: () => void;
  onAppoint: () => void;
  onRevoke: (personId: string, personName: string) => void;
  upcomingShowCount: number;
}

export const ClubShowAccessTab: React.FC<ClubShowAccessTabProps> = ({
  managers,
  unavailable,
  onRetry,
  onAppoint,
  onRevoke,
  upcomingShowCount,
}) => {
  if (unavailable) {
    // Never render an empty list as "nobody has access" — that is a claim this tab
    // cannot support when the query failed, and it is the claim most likely to be
    // acted on.
    return (
      <p
        role="status"
        className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
      >
        We couldn&apos;t load who has show access. This isn&apos;t the same as nobody having it.{' '}
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  }

  const isLastSecretary = managers.length === 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {managers.length === 0
            ? 'Nobody is appointed to run this club’s shows.'
            : `${managers.length} ${managers.length === 1 ? 'person' : 'people'} can create and run this club’s shows.`}
        </p>
        <Button onClick={onAppoint} className="gap-2">
          <Plus className="h-4 w-4" />
          Appoint Secretary
        </Button>
      </div>

      {managers.length === 0 && upcomingShowCount > 0 && (
        <p
          role="status"
          className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          This club has {upcomingShowCount} upcoming {upcomingShowCount === 1 ? 'show' : 'shows'}{' '}
          and nobody appointed to run {upcomingShowCount === 1 ? 'it' : 'them'}. Club admins can
          still manage shows, but no secretary can.
        </p>
      )}

      {managers.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center">
          <KeyRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Appoint a secretary and they can run any of this club&apos;s shows. They do not need to
            be a club member.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {managers.map(manager => (
            <li
              key={manager.personId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">
                    {manager.personName ?? 'Unnamed person'}
                  </span>
                  {manager.isClubMember ? (
                    <Badge
                      className={cn(
                        'text-xs',
                        STATUS_BADGE_CLASSES[
                          (manager.membershipStatus ?? 'active') as MembershipStatus
                        ] ?? ''
                      )}
                    >
                      {MEMBERSHIP_STATUS_LABELS[
                        (manager.membershipStatus ?? 'active') as MembershipStatus
                      ] ?? manager.membershipStatus}
                    </Badge>
                  ) : (
                    // The case the roster structurally cannot show.
                    <Badge className="bg-info/10 text-info-strong border-info/20 hover:bg-info/10 text-xs">
                      Not a club member
                    </Badge>
                  )}
                </span>
                {manager.personEmail && (
                  <span className="block text-sm text-muted-foreground">{manager.personEmail}</span>
                )}
              </div>
              <Button
                variant="outline"
                className="gap-2 border-border text-warning"
                onClick={() => onRevoke(manager.personId, manager.personName ?? 'this person')}
              >
                <UserMinus className="h-4 w-4" />
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isLastSecretary && upcomingShowCount > 0 && (
        <p className="text-sm text-muted-foreground">
          This is the club&apos;s only appointed secretary, with {upcomingShowCount} upcoming{' '}
          {upcomingShowCount === 1 ? 'show' : 'shows'}. Appoint someone else before revoking them.
        </p>
      )}
    </div>
  );
};
