/**
 * ManageUserRolesDialog
 * Checkbox-based dialog for viewing and editing a user's roles.
 * Scoped roles (secretary, club_admin) support multiple club assignments.
 */

import React, { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { rbacService } from '@/services/rbac/RBACService';
import { UserRole } from '@/types/auth-types';
import type { User } from '@/types/user-types';

// Roles that must be scoped to a club
const CLUB_SCOPED_ROLES = new Set<string>([UserRole.SECRETARY, UserRole.CLUB_ADMIN]);

const ROLE_LABELS: Record<string, string> = {
  site_admin: 'Site Admin',
  secretary: 'Secretary',
  club_admin: 'Club Admin',
  judge: 'Judge',
  exhibitor: 'Exhibitor',
  steward: 'Steward',
  chairman: 'Chairman',
};

const MANAGEABLE_ROLES = [
  UserRole.SITE_ADMIN,
  UserRole.SECRETARY,
  UserRole.CLUB_ADMIN,
  UserRole.JUDGE,
  UserRole.EXHIBITOR,
  UserRole.STEWARD,
  UserRole.CHAIRMAN,
];

interface CurrentRoleAssignment {
  userRoleId: string;
  roleId: string;
  roleName: string;
  clubId: string | null;
}

interface ManageUserRolesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User;
  onSaved: () => void;
}

export const ManageUserRolesDialog: React.FC<ManageUserRolesDialogProps> = ({
  open,
  onOpenChange,
  user,
  onSaved,
}) => {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State: Map<roleName, string[]>
  // - Non-scoped role assigned: [] (empty array, present in map)
  // - Scoped role: ['clubId1', 'clubId2'] (one entry per club)
  // - Not in map = role not assigned
  const [roleState, setRoleState] = useState<Map<string, string[]>>(new Map());
  const [originalAssignments, setOriginalAssignments] = useState<CurrentRoleAssignment[]>([]);

  const { data: currentAssignments = [], isLoading: loadingRoles } = useQuery<
    CurrentRoleAssignment[]
  >({
    queryKey: ['user-role-assignments', user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id, role_id, club_id, roles(name)')
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) throw error;
      return (data ?? []).map((row: Record<string, unknown>) => ({
        userRoleId: row.id as string,
        roleId: row.role_id as string,
        roleName: (row.roles as { name: string } | null)?.name ?? '',
        clubId: (row.club_id as string | null) ?? null,
      }));
    },
    enabled: open,
  });

  const { data: clubs = [], isLoading: loadingClubs } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['clubs-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clubs')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
    enabled: open,
  });

  // Build initial state from current assignments once both queries are ready
  useEffect(() => {
    if (!open || loadingRoles || loadingClubs) return;
    const map = new Map<string, string[]>();
    for (const a of currentAssignments) {
      if (!CLUB_SCOPED_ROLES.has(a.roleName)) {
        map.set(a.roleName, []);
      } else if (a.clubId) {
        const existing = map.get(a.roleName) ?? [];
        map.set(a.roleName, [...existing, a.clubId]);
      }
    }
    setRoleState(map);
    setOriginalAssignments(currentAssignments);
    setError(null);
  }, [open, currentAssignments, loadingRoles, loadingClubs]);

  const clubName = (clubId: string) => clubs.find(c => c.id === clubId)?.name ?? clubId;

  const isChecked = (roleName: string) => roleState.has(roleName);

  // Roles that are permanently assigned and cannot be removed
  const LOCKED_ROLES = new Set<string>([UserRole.EXHIBITOR]);

  const handleToggle = (roleName: string, checked: boolean) => {
    setRoleState(prev => {
      const next = new Map(prev);
      if (checked) {
        next.set(roleName, []);
      } else {
        next.delete(roleName);
      }
      return next;
    });
  };

  const handleAddClub = (roleName: string, clubId: string) => {
    setRoleState(prev => {
      const next = new Map(prev);
      const existing = next.get(roleName) ?? [];
      if (!existing.includes(clubId)) {
        next.set(roleName, [...existing, clubId]);
      }
      return next;
    });
  };

  const handleRemoveClub = (roleName: string, clubId: string) => {
    setRoleState(prev => {
      const next = new Map(prev);
      const updated = (next.get(roleName) ?? []).filter(id => id !== clubId);
      if (updated.length === 0) {
        // No clubs left — uncheck the role too
        next.delete(roleName);
      } else {
        next.set(roleName, updated);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);

    // Validate scoped roles have at least one club
    for (const [roleName, clubs] of roleState) {
      if (CLUB_SCOPED_ROLES.has(roleName) && clubs.length === 0) {
        setError(
          `Please select at least one club for the ${ROLE_LABELS[roleName] ?? roleName} role.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const allRoles = await rbacService.getAllRoles();
      const roleMap = new Map(allRoles.map(r => [r.name, r.id]));

      // Ensure locked roles are always in roleState (handles users missing exhibitor)
      const effectiveRoleState = new Map(roleState);
      for (const lockedRole of LOCKED_ROLES) {
        if (!effectiveRoleState.has(lockedRole)) {
          effectiveRoleState.set(lockedRole, []);
        }
      }

      // Build original state as comparable structure
      const originalMap = new Map<string, string[]>();
      for (const a of originalAssignments) {
        if (!CLUB_SCOPED_ROLES.has(a.roleName)) {
          originalMap.set(a.roleName, []);
        } else if (a.clubId) {
          const existing = originalMap.get(a.roleName) ?? [];
          originalMap.set(a.roleName, [...existing, a.clubId]);
        }
      }

      // Revoke removed roles/clubs
      for (const [roleName, originalClubs] of originalMap) {
        if (!effectiveRoleState.has(roleName)) {
          // Role fully removed
          if (CLUB_SCOPED_ROLES.has(roleName)) {
            for (const clubId of originalClubs) {
              await rbacService.revokeRole({
                userId: user.id,
                roleName,
                scopeType: 'club',
                scopeId: clubId,
              });
            }
          } else {
            await rbacService.revokeRole({ userId: user.id, roleName });
          }
        } else if (CLUB_SCOPED_ROLES.has(roleName)) {
          // Revoke clubs that were removed
          const newClubs = effectiveRoleState.get(roleName) ?? [];
          for (const clubId of originalClubs) {
            if (!newClubs.includes(clubId)) {
              await rbacService.revokeRole({
                userId: user.id,
                roleName,
                scopeType: 'club',
                scopeId: clubId,
              });
            }
          }
        }
      }

      // Assign added roles/clubs
      for (const [roleName, newClubs] of effectiveRoleState) {
        const roleId = roleMap.get(roleName);
        if (!roleId) continue;
        const originalClubs = originalMap.get(roleName);

        if (CLUB_SCOPED_ROLES.has(roleName)) {
          for (const clubId of newClubs) {
            if (!originalClubs?.includes(clubId)) {
              await rbacService.assignRole({
                userId: user.id,
                roleId,
                scopeType: 'club',
                scopeId: clubId,
              });
            }
          }
        } else if (!originalMap.has(roleName)) {
          await rbacService.assignRole({ userId: user.id, roleId });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['user-role-assignments', user.id] });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save roles');
    } finally {
      setSaving(false);
    }
  };

  const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'this user';
  const isLoading = loadingRoles || loadingClubs;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Manage Roles
          </DialogTitle>
          <DialogDescription>
            Set roles for <strong>{userName}</strong>.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          {MANAGEABLE_ROLES.map(roleName => {
            const checked = isChecked(roleName);
            const isScoped = CLUB_SCOPED_ROLES.has(roleName);
            const assignedClubs = roleState.get(roleName) ?? [];
            const availableToAdd = clubs.filter(c => !assignedClubs.includes(c.id));

            const isLocked = LOCKED_ROLES.has(roleName);

            return (
              <div key={roleName} className="space-y-2">
                <div className="flex items-center gap-3">
                  <Checkbox
                    id={`role-${roleName}`}
                    checked={isLocked ? true : checked}
                    onCheckedChange={c => handleToggle(roleName, !!c)}
                    disabled={isLoading || isLocked}
                  />
                  <Label
                    htmlFor={`role-${roleName}`}
                    className={
                      isLocked ? 'font-medium text-muted-foreground' : 'cursor-pointer font-medium'
                    }
                  >
                    {ROLE_LABELS[roleName] ?? roleName}
                    {isLocked && <span className="ml-2 text-xs">(always assigned)</span>}
                  </Label>
                </div>

                {checked && isScoped && (
                  <div className="ml-7 space-y-2">
                    {/* Assigned clubs list */}
                    {assignedClubs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {assignedClubs.map(clubId => (
                          <Badge key={clubId} variant="secondary" className="gap-1 pr-1">
                            {clubName(clubId)}
                            <button
                              onClick={() => handleRemoveClub(roleName, clubId)}
                              className="ml-0.5 rounded hover:text-destructive"
                              aria-label={`Remove ${clubName(clubId)}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Add another club */}
                    {availableToAdd.length > 0 && (
                      <Select onValueChange={v => handleAddClub(roleName, v)}>
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

                    {assignedClubs.length === 0 && availableToAdd.length === 0 && (
                      <p className="text-xs text-muted-foreground">No clubs available.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || isLoading}>
            {saving ? 'Saving…' : 'Save Roles'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
