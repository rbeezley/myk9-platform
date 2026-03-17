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
import { Card, CardContent } from '@/components/ui/card';
import { UserPlus, Shield, Search, X, MoreVertical, Trash2, KeyRound } from 'lucide-react';
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

// eslint-disable-next-line react-refresh/only-export-components
export const TYPE_BADGE_CLASSES: Record<MembershipType, string> = {
  full: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  associate: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  junior: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  honorary: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

// eslint-disable-next-line react-refresh/only-export-components
export const STATUS_BADGE_CLASSES: Record<MembershipStatus, string> = {
  active: 'bg-success-green/10 text-success-green border-success-green/20',
  lapsed: 'bg-warning-orange/10 text-warning-orange border-warning-orange/20',
  suspended: 'bg-error-red/10 text-error-red border-error-red/20',
  resigned: 'bg-muted text-muted-foreground border-border',
};

// --- Member Action Menu ---

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
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border/50 bg-card shadow-xl backdrop-blur-xl py-1">
            {/* Change Type submenu */}
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Change Type
            </div>
            {(Object.entries(MEMBERSHIP_TYPE_LABELS) as [MembershipType, string][]).map(
              ([type, label]) => (
                <button
                  key={type}
                  onClick={() => {
                    onChangeType(member.id, type);
                    setOpen(false);
                  }}
                  disabled={member.membershipType === type}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    member.membershipType === type
                      ? 'text-muted-foreground/50 cursor-default'
                      : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  {label}
                  {member.membershipType === type && (
                    <span className="ml-1 text-xs text-muted-foreground">(current)</span>
                  )}
                </button>
              )
            )}

            <div className="my-1 border-t border-border/30" />

            {/* Change Status submenu */}
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Change Status
            </div>
            {(Object.entries(MEMBERSHIP_STATUS_LABELS) as [MembershipStatus, string][]).map(
              ([status, label]) => (
                <button
                  key={status}
                  onClick={() => {
                    onChangeStatus(member.id, status);
                    setOpen(false);
                  }}
                  disabled={member.membershipStatus === status}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    member.membershipStatus === status
                      ? 'text-muted-foreground/50 cursor-default'
                      : 'hover:bg-muted/50 text-foreground'
                  }`}
                >
                  {label}
                  {member.membershipStatus === status && (
                    <span className="ml-1 text-xs text-muted-foreground">(current)</span>
                  )}
                </button>
              )
            )}

            <div className="my-1 border-t border-border/30" />

            {/* Show Access */}
            <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Show Access
            </div>
            <button
              onClick={() => {
                onToggleShowAccess(member.personId, !hasShowAccess);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                hasShowAccess
                  ? 'text-warning-orange hover:bg-warning-orange/10'
                  : 'text-success-green hover:bg-success-green/10'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {hasShowAccess ? 'Revoke Show Access' : 'Grant Show Access'}
            </button>

            <div className="my-1 border-t border-border/30" />

            <button
              onClick={() => {
                onRemove(member.id);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm text-error-red hover:bg-error-red/10 transition-colors flex items-center gap-2"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove Member
            </button>
          </div>
        </>
      )}
    </div>
  );
};

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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <Card className="relative z-10 w-full max-w-md mx-4 bg-gradient-to-br from-card to-card/90 border-border/50 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <UserPlus className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Add Member</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <CardContent className="space-y-4 pt-2">
          {/* Person search */}
          <FormField label="Person" fieldId="member-search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="member-search"
                placeholder="Search by name or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-muted/30 border-border/50"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/30 bg-muted/20">
              {availablePeople.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">No people found</p>
              ) : (
                availablePeople.slice(0, 20).map(person => (
                  <button
                    key={person.id}
                    onClick={() => setSelectedPersonId(person.id)}
                    className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                      selectedPersonId === person.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted/50 text-foreground'
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
          </FormField>

          {/* Membership type */}
          <FormField label="Membership Type" fieldId="membership-type">
            <select
              id="membership-type"
              value={membershipType}
              onChange={e => setMembershipType(e.target.value as MembershipType)}
              className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground"
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
            <Button variant="outline" onClick={handleClose} className="border-border/50">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!selectedPersonId || isSaving}>
              {isSaving ? 'Adding...' : 'Add Member'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      <Card className="relative z-10 w-full max-w-md mx-4 bg-gradient-to-br from-card to-card/90 border-border/50 backdrop-blur-xl shadow-2xl">
        <div className="flex items-center justify-between p-6 pb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Assign Officer</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <CardContent className="space-y-4 pt-2">
          {/* Person search */}
          <FormField label="Person" fieldId="officer-search">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="officer-search"
                placeholder="Search members..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 bg-muted/30 border-border/50"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border/30 bg-muted/20">
              {candidateList.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground text-center">No people found</p>
              ) : (
                candidateList.slice(0, 20).map(person => {
                  const isMember = members.some(m => m.personId === person.id);
                  return (
                    <button
                      key={person.id}
                      onClick={() => setSelectedPersonId(person.id)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        selectedPersonId === person.id
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted/50 text-foreground'
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
          </FormField>

          {/* Position select */}
          <FormField label="Position" fieldId="officer-position">
            <select
              id="officer-position"
              value={position}
              onChange={e => setPosition(e.target.value as OfficerPosition)}
              className="w-full rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm text-foreground"
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
            <Button variant="outline" onClick={handleClose} className="border-border/50">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!selectedPersonId || isSaving}>
              {isSaving ? 'Assigning...' : 'Assign Officer'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
