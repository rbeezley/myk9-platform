/**
 * Dialogs and shared components for club member management.
 *
 * Extracted from ClubMembersPage to keep files under 500 lines.
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
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
import { Plus, Shield, Search, MoreVertical, Trash2, KeyRound } from 'lucide-react';
import type { User } from '@/types/user-types';
import type { ClubMember } from '@/types/club-membership-types';
import {
  MEMBERSHIP_TYPE_LABELS,
  MEMBERSHIP_STATUS_LABELS,
  OFFICER_POSITION_LABELS,
  OFFICER_POSITION_ORDER,
  type MembershipType,
  type MembershipStatus,
  type OfficerPosition,
} from '@/types/club-membership-types';

// --- Badge color constants ---

// Membership badges use semantic theme tokens (not raw palette) so they stay
// WCAG-AA legible in both light and dark mode. info uses text-info-strong, the
// AA-safe text shade for the bg-info/10 tint pattern.
//
// Every entry pins its own `hover:` background on purpose. Badge's default
// variant carries `hover:bg-primary/80`, and tailwind-merge does NOT drop it
// when a className overrides the base `bg-*` - verified against the repo's own
// tailwind-merge. Without these, hovering any chip repainted it solid clay
// while keeping the semantic text colour: 1.15:1 to 2.58:1 depending on the
// chip, on every badge on the page.
//
// `full` deliberately does NOT use the accent. `bg-primary/10` + `text-primary`
// measures 4.13:1 on Dusk and 3.91:1 on Heather in dark mode - below AA - so a
// membership *category* keyed to the user's chosen accent is legible for some
// users and not others. Categories take a fixed chip pair; the accent stays the
// user's brand preference.
//
// Purple specifically, not teal: the chip vocabulary reserves purple for "tag",
// which is what a membership category is. Teal is BOTH the default --primary in
// apps/myk9show/DESIGN.md and the existing "Paid" chip in entryManagementUtils,
// so it would have re-keyed the category to the accent's own hue while reading
// as a payment state on a page that has a Payments sibling.
// eslint-disable-next-line react-refresh/only-export-components
export const TYPE_BADGE_CLASSES: Record<MembershipType, string> = {
  full: 'bg-[color:var(--chip-purple-bg)] text-[color:var(--chip-purple-fg)] border-transparent hover:bg-[color:var(--chip-purple-bg)]',
  associate: 'bg-info/10 text-info-strong border-info/20 hover:bg-info/10',
  junior: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/10',
  honorary: 'bg-success/10 text-success border-success/20 hover:bg-success/10',
};

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_BADGE_CLASSES: Record<MembershipStatus, string> = {
  active: 'bg-success/10 text-success border-success/20 hover:bg-success/10',
  lapsed: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/10',
  suspended: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10',
  // --chip-stone-*, not bg-muted: --muted and --card are the same hex in dark,
  // so "Resigned" rendered as bare text in a column of pills - reading as "no
  // status set" rather than resigned.
  resigned:
    'bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] border-transparent hover:bg-[color:var(--chip-stone-bg)]',
};

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
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Actions for ${member.personName || 'member'}`}
    >
      <MoreVertical className="h-4 w-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-56">
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
            hasShowAccess ? 'text-warning focus:bg-warning/10' : 'text-success focus:bg-success/10'
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

// --- Add Member Dialog ---

interface AddMemberDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (personId: string, membershipType: MembershipType) => void;
  people: User[];
  existingMemberIds: Set<string>;
  isSaving: boolean;
}

export const AddMemberDialog: React.FC<AddMemberDialogProps> = ({
  open,
  onClose,
  onSave,
  people,
  existingMemberIds,
  isSaving,
}) => {
  const [search, setSearch] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [membershipType, setMembershipType] = useState<MembershipType>('full');

  const availablePeople = useMemo(() => {
    const filtered = people.filter(p => !existingMemberIds.has(p.id));
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    );
  }, [people, existingMemberIds, search]);

  const handleSave = () => {
    if (!selectedPersonId) return;
    onSave(selectedPersonId, membershipType);
    setSelectedPersonId('');
    setMembershipType('full');
    setSearch('');
  };

  const handleClose = () => {
    setSelectedPersonId('');
    setMembershipType('full');
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && handleClose()}>
      {/* max-h + overflow so the dialog stays usable at --font-scale 1.4,
          where the hand-rolled fixed-inset shell pushed Save off-screen with
          no way to scroll to it. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Plus className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold text-foreground">Add Member</DialogTitle>
          </div>
        </div>
        <div className="space-y-4 pt-2">
          {/* Person search */}
          <FormField label="Person" fieldId="member-search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="member-search"
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
                    className={`w-full text-left px-3 py-2 text-sm min-h-11 transition-colors ${
                      selectedPersonId === person.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-card text-foreground'
                    }`}
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

          {/* Membership type */}
          <FormField label="Membership Type" fieldId="membership-type">
            <select
              id="membership-type"
              value={membershipType}
              onChange={e => setMembershipType(e.target.value as MembershipType)}
              className="w-full min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
            >
              {(Object.entries(MEMBERSHIP_TYPE_LABELS) as [MembershipType, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                )
              )}
            </select>
          </FormField>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="border-border">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!selectedPersonId || isSaving}>
              {isSaving ? 'Adding...' : 'Add Member'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- Assign Officer Dialog ---

interface AssignOfficerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (personId: string, position: OfficerPosition) => void;
  members: ClubMember[];
  people: User[];
  isSaving: boolean;
}

export const AssignOfficerDialog: React.FC<AssignOfficerDialogProps> = ({
  open,
  onClose,
  onSave,
  members,
  people,
  isSaving,
}) => {
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [position, setPosition] = useState<OfficerPosition>('president');
  const [search, setSearch] = useState('');

  // Show members first, then other people
  const candidateList = useMemo(() => {
    const memberPersonIds = new Set(members.map(m => m.personId));
    const memberPeople = people.filter(p => memberPersonIds.has(p.id));
    const otherPeople = people.filter(p => !memberPersonIds.has(p.id));
    const combined = [...memberPeople, ...otherPeople];
    if (!search.trim()) return combined;
    const q = search.toLowerCase();
    return combined.filter(
      p =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q)
    );
  }, [members, people, search]);

  const handleSave = () => {
    if (!selectedPersonId) return;
    onSave(selectedPersonId, position);
    setSelectedPersonId('');
    setPosition('president');
    setSearch('');
  };

  const handleClose = () => {
    setSelectedPersonId('');
    setPosition('president');
    setSearch('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && handleClose()}>
      {/* max-h + overflow so the dialog stays usable at --font-scale 1.4,
          where the hand-rolled fixed-inset shell pushed Save off-screen with
          no way to scroll to it. */}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold text-foreground">
              Assign Officer
            </DialogTitle>
          </div>
        </div>
        <div className="space-y-4 pt-2">
          {/* Person search */}
          <FormField label="Person" fieldId="officer-search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="officer-search"
                placeholder="Search people by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 border-border"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-[color:var(--chip-stone-bg)]">
              {candidateList.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">No people found</p>
              ) : (
                candidateList.slice(0, 20).map(person => {
                  const isMember = members.some(m => m.personId === person.id);
                  return (
                    <button
                      key={person.id}
                      onClick={() => setSelectedPersonId(person.id)}
                      className={`w-full text-left px-3 py-2 text-sm min-h-11 transition-colors ${
                        selectedPersonId === person.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-card text-foreground'
                      }`}
                    >
                      <span className="font-medium">
                        {person.firstName} {person.lastName}
                      </span>
                      {isMember && (
                        <Badge className="ml-2 text-xs bg-primary/10 text-primary border-primary/20">
                          Member
                        </Badge>
                      )}
                      {person.email && (
                        <span className="text-muted-foreground ml-2 text-xs">{person.email}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {candidateList.length > 20 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Showing the first 20 of {candidateList.length}. Keep typing to narrow the list.
              </p>
            )}
          </FormField>

          {/* Position select */}
          <FormField label="Position" fieldId="officer-position">
            <select
              id="officer-position"
              value={position}
              onChange={e => setPosition(e.target.value as OfficerPosition)}
              className="w-full min-h-11 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
            >
              {OFFICER_POSITION_ORDER.map(pos => (
                <option key={pos} value={pos}>
                  {OFFICER_POSITION_LABELS[pos]}
                </option>
              ))}
            </select>
          </FormField>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose} className="border-border">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!selectedPersonId || isSaving}>
              {isSaving ? 'Assigning...' : 'Assign Officer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
