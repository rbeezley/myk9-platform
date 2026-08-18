/**
 * BulkRoleDialog
 * Bulk role assignment (Add / Remove / Replace) for the admin Users bulk bar.
 * Mirrors ManageUserRolesDialog's vocabulary and club-scope pattern (design.md
 * "Bulk dialog semantics"), applied to multiple users at once via
 * `useBulkActions().handleBulkRoleChange`.
 */

import React, { useState } from 'react';
import { Shield, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import {
  CLUB_SCOPED_ROLES,
  LOCKED_ROLES,
  MANAGEABLE_ROLES,
  ROLE_LABELS,
} from '@/services/rbac/roleUiConstants';
import type { SelectedUser } from '@/pages/admin/UserManagementPage';

export type BulkRoleMode = 'add' | 'remove' | 'replace';

export interface BulkRoleSubmitConfig {
  mode: BulkRoleMode;
  roleNames: string[];
  clubIds: string[];
}

interface BulkRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUsers: SelectedUser[];
  isProcessing: boolean;
  error: string | null;
  notice?: string | null;
  onSubmit: (config: BulkRoleSubmitConfig) => void;
}

export const BulkRoleDialog: React.FC<BulkRoleDialogProps> = ({
  open,
  onOpenChange,
  selectedUsers,
  isProcessing,
  error,
  notice = null,
  onSubmit,
}) => {
  const [mode, setMode] = useState<BulkRoleMode>('add');
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [clubIds, setClubIds] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const {
    data: clubs = [],
    isLoading: clubsLoading,
    error: clubsError,
    refetch: refetchClubs,
  } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['clubs-list'],
    queryFn: async () => {
      const { data, error: fetchError } = await supabase
        .from('clubs')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (fetchError) throw fetchError;
      return data as { id: string; name: string }[];
    },
    enabled: open,
  });

  // Reset local state on the false->true open transition, adjusted during render
  // rather than in an effect (avoids the cascading-render effect lint rule) —
  // React's documented "adjust state while rendering" pattern. Tracked via state
  // (not a ref): the React Compiler forbids reading/writing ref.current at render
  // time, so a state variable is the sanctioned way to remember the prior prop.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMode('add');
      setSelectedRoles(new Set());
      setClubIds([]);
      setLocalError(null);
    }
  }

  const requiresClub = Array.from(selectedRoles).some(role => CLUB_SCOPED_ROLES.has(role));
  const availableRolesForMode = MANAGEABLE_ROLES.filter(role => {
    // Locked roles are always-assigned — never offered in remove/replace-removal.
    if (mode !== 'add' && LOCKED_ROLES.has(role)) return false;
    return true;
  });

  const handleRoleToggle = (roleName: string, checked: boolean) => {
    setSelectedRoles(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(roleName);
      } else {
        next.delete(roleName);
      }
      return next;
    });
  };

  const handleAddClub = (clubId: string) => {
    setClubIds(prev => (prev.includes(clubId) ? prev : [...prev, clubId]));
  };

  const handleRemoveClub = (clubId: string) => {
    setClubIds(prev => prev.filter(id => id !== clubId));
  };

  const clubName = (clubId: string) => clubs.find(c => c.id === clubId)?.name ?? clubId;
  const availableToAdd = clubs.filter(c => !clubIds.includes(c.id));

  // A scoped role needs the clubs list to be usable — block Apply while it's
  // still loading or failed, so the operator sees the real problem instead of
  // the misleading "select at least one club".
  const clubsUnavailable = requiresClub && (clubsLoading || !!clubsError);

  const handleSubmit = () => {
    setLocalError(null);
    if (selectedRoles.size === 0) {
      setLocalError('Select at least one role.');
      return;
    }
    if (requiresClub && clubIds.length === 0) {
      setLocalError('Select at least one club for the club-scoped role(s) selected.');
      return;
    }
    onSubmit({ mode, roleNames: Array.from(selectedRoles), clubIds });
  };

  const displayError = localError ?? error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Change Roles
          </DialogTitle>
          <DialogDescription>
            Applies to {selectedUsers.length} selected user
            {selectedUsers.length === 1 ? '' : 's'}.
          </DialogDescription>
        </DialogHeader>

        {displayError && (
          <Alert variant="destructive">
            <AlertDescription>{displayError}</AlertDescription>
          </Alert>
        )}

        {notice && (
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={v => setMode(v as BulkRoleMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="add">Add</SelectItem>
                <SelectItem value="remove">Remove</SelectItem>
                <SelectItem value="replace">Replace</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'replace' && (
              <p className="text-xs text-destructive">
                Replace removes every non-locked role not in the selected set below, for each
                selected user, then adds the selected roles.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Roles</Label>
            {availableRolesForMode.map(roleName => {
              const isLocked = LOCKED_ROLES.has(roleName);
              return (
                <div key={roleName} className="flex items-center gap-3">
                  <Checkbox
                    id={`bulk-role-${roleName}`}
                    checked={isLocked && mode === 'add' ? true : selectedRoles.has(roleName)}
                    onCheckedChange={c => handleRoleToggle(roleName, !!c)}
                    disabled={isLocked && mode === 'add'}
                  />
                  <Label
                    htmlFor={`bulk-role-${roleName}`}
                    className={
                      isLocked && mode === 'add'
                        ? 'font-medium text-muted-foreground'
                        : 'cursor-pointer font-medium'
                    }
                  >
                    {ROLE_LABELS[roleName] ?? roleName}
                    {isLocked && mode === 'add' && (
                      <span className="ml-2 text-xs">(always assigned)</span>
                    )}
                  </Label>
                </div>
              );
            })}
          </div>

          {requiresClub && (
            <div className="space-y-2">
              <Label>Clubs (applies to club-scoped roles selected above)</Label>
              {clubsError ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-center justify-between gap-2">
                    <span>Could not load clubs.</span>
                    <Button variant="outline" size="sm" onClick={() => void refetchClubs()}>
                      Retry
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : clubsLoading ? (
                <p className="text-xs text-muted-foreground">Loading clubs…</p>
              ) : null}
              {clubIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clubIds.map(clubId => (
                    <Badge key={clubId} variant="secondary" className="gap-1 pr-1">
                      {clubName(clubId)}
                      <button
                        onClick={() => handleRemoveClub(clubId)}
                        className="ml-0.5 rounded hover:text-destructive"
                        aria-label={`Remove ${clubName(clubId)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              {availableToAdd.length > 0 && (
                <Select onValueChange={handleAddClub}>
                  <SelectTrigger className="h-8 text-sm w-full">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Plus className="h-3 w-3" />
                      <span>Add a club…</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {availableToAdd.map(club => (
                      <SelectItem key={club.id} value={club.id}>
                        {club.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing || clubsUnavailable}>
            {isProcessing ? 'Applying…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
