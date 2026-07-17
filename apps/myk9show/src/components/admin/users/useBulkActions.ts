import { useState, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import { supabase } from '@/services/database/supabaseClient';
import { rbacService } from '@/services/rbac/RBACService';
import type { UserRole as UserRoleType } from '@/types/user-types';
import { SelectedUser } from '@/pages/admin/UserManagementPage';
import {
  useDeleteUserMutation,
  usePermanentDeleteUserMutation,
} from '@/hooks/queries/useUsersQuery';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import type { DialogType, BulkRoleData, ErrorWithRelatedData } from './BulkActionsBar.types';

/** Fetches the full `roles` lookup table (id + name) once per bulk-role dispatch. */
async function fetchRolesTable(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase.from('roles').select('id, name');
  if (error) throw error;
  return data ?? [];
}

/** Batch-fetches each user's currently-active role ids (avoids N+1 per selected user). */
async function fetchActiveRoleIdsByUser(userIds: string[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from('user_roles')
    .select('user_id, role_id')
    .in('user_id', userIds)
    .eq('is_active', true);
  if (error) throw error;
  (data ?? []).forEach(row => {
    const set = map.get(row.user_id) ?? new Set<string>();
    set.add(row.role_id);
    map.set(row.user_id, set);
  });
  return map;
}

/** Deactivates one user's role assignment — the same write UserDetailsDialog's
 * single-user role editor performs (`user_roles.is_active = false`). */
async function deactivateUserRole(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('role_id', roleId);
  if (error) throw error;
}

interface UseBulkActionsOptions {
  selectedUsers: SelectedUser[];
  onBulkComplete: () => void;
  onUsersDeleted?: ((deletedUserIds: string[]) => void) | undefined;
}

export function useBulkActions({
  selectedUsers,
  onBulkComplete,
  onUsersDeleted,
}: UseBulkActionsOptions) {
  const deleteUserMutation = useDeleteUserMutation();
  const permanentDeleteMutation = usePermanentDeleteUserMutation();
  const [currentDialog, setCurrentDialog] = useState<DialogType>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cascadeData, setCascadeData] = useState<{
    userIds: string[];
    entryCount: number;
    dogCount: number;
  } | null>(null);

  const [roleData, setRoleData] = useState<BulkRoleData>({
    action: 'add',
    roles: [],
  });

  const bulkRoleDispatch = useBulkDispatch<SelectedUser>({
    getLabel: selected => `${selected.user.firstName} ${selected.user.lastName}`,
  });

  const closeDialog = useCallback(() => {
    setCurrentDialog(null);
    setError(null);
    setCascadeData(null);
    setRoleData({ action: 'add', roles: [] });
  }, []);

  // Applies roleData's add/remove/replace action to every selected user, using the
  // same primitives UserDetailsDialog's single-user role editor uses: ensureUserHasRole
  // to add, and a direct user_roles.is_active=false write to deactivate. Dispatched via
  // useBulkDispatch so one user's failure doesn't block the rest and the summary toast
  // reports per-user reasons.
  const handleBulkRoleAction = useCallback(async () => {
    if (roleData.roles.length === 0) {
      setError('Please select at least one role');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const userIds = selectedUsers.map(u => u.id);
      const rolesTable = await fetchRolesTable();
      const roleIdByName = new Map(rolesTable.map(r => [r.name, r.id]));
      const activeRoleIdsByUser =
        roleData.action === 'add'
          ? new Map<string, Set<string>>()
          : await fetchActiveRoleIdsByUser(userIds);

      const outcome = await bulkRoleDispatch.run(selectedUsers, async selected => {
        const userId = selected.id;

        if (roleData.action === 'add') {
          for (const roleName of roleData.roles) {
            await rbacService.ensureUserHasRole(userId, roleName);
          }
          return;
        }

        const activeRoleIds = activeRoleIdsByUser.get(userId) ?? new Set<string>();

        if (roleData.action === 'remove') {
          for (const roleName of roleData.roles) {
            const roleId = roleIdByName.get(roleName);
            if (roleId && activeRoleIds.has(roleId)) {
              await deactivateUserRole(userId, roleId);
            }
          }
          return;
        }

        // replace: selected roles become the user's only active roles
        const selectedRoleIds = new Set(
          roleData.roles
            .map(roleName => roleIdByName.get(roleName))
            .filter((id): id is string => Boolean(id))
        );
        for (const roleId of activeRoleIds) {
          if (!selectedRoleIds.has(roleId)) {
            await deactivateUserRole(userId, roleId);
          }
        }
        for (const roleName of roleData.roles) {
          const roleId = roleIdByName.get(roleName);
          if (roleId && !activeRoleIds.has(roleId)) {
            await rbacService.ensureUserHasRole(userId, roleName);
          }
        }
      });

      logger.debug('Bulk role action complete', 'admin', {
        action: roleData.action,
        roles: roleData.roles,
        succeeded: outcome.succeeded.length,
        failed: outcome.failed.length,
      });

      if (outcome.failed.length === 0) {
        closeDialog();
      } else {
        setError(`${outcome.failed.length} of ${userIds.length} users failed to update.`);
      }
      onBulkComplete();
    } catch (error) {
      logger.error('Error in bulk role action', 'admin', {}, error as Error);
      setError('Failed to update user roles. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [roleData, selectedUsers, closeDialog, onBulkComplete, bulkRoleDispatch]);

  const handleBulkDelete = useCallback(async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const userIds = selectedUsers.map(u => u.id);
      logger.debug('Bulk delete', 'admin', { userIds });

      // Try to delete each user normally first
      const deletePromises = userIds.map(async userId => {
        try {
          await deleteUserMutation.mutateAsync({ id: userId });
          return { userId, success: true as const };
        } catch (error: unknown) {
          const errorWithCode = error as ErrorWithRelatedData;
          if (error instanceof Error && errorWithCode.code === 'HAS_RELATED_DATA') {
            return {
              userId,
              success: false as const,
              code: 'HAS_RELATED_DATA' as const,
              relatedData: errorWithCode.details,
            };
          }
          // MK001: the person_delete_owns_dogs_guard DB trigger blocks deleting a
          // person who's the primary owner of a live dog — an expected, per-item
          // partial-failure case (design.md "Bulk people delete blocked by
          // ownership guard" scenario), not a batch-aborting error.
          if (error instanceof Error && errorWithCode.code === 'MK001') {
            return { userId, success: false as const, code: 'MK001' as const };
          }
          throw error; // Re-throw other errors
        }
      });

      const results = await Promise.all(deletePromises);
      const successful = results.filter(r => r.success);
      const needsCascade = results.filter(r => !r.success && r.code === 'HAS_RELATED_DATA');
      const ownsDogsBlocked = results.filter(r => !r.success && r.code === 'MK001');

      if (needsCascade.length > 0) {
        // Some users have related data - show cascade confirmation
        const totalEntryCount = needsCascade.reduce(
          (sum, r) => sum + (r.relatedData?.entryCount || 0),
          0
        );
        const totalDogCount = needsCascade.reduce(
          (sum, r) => sum + (r.relatedData?.dogCount || 0),
          0
        );

        setCascadeData({
          userIds: needsCascade.map(r => r.userId),
          entryCount: totalEntryCount,
          dogCount: totalDogCount,
        });

        setCurrentDialog('cascadeConfirm');
        setIsProcessing(false);
        return;
      }

      if (ownsDogsBlocked.length > 0) {
        // Unlike HAS_RELATED_DATA, the owns-dogs guard has no cascade override —
        // the trigger blocks unconditionally until the person's dogs are
        // reassigned or deleted. Report each blocked person by name with the
        // human-readable reason; any other selected users still delete.
        const labelFor = (userId: string) => {
          const selected = selectedUsers.find(u => u.id === userId);
          return selected ? `${selected.user.firstName} ${selected.user.lastName}` : userId;
        };
        const details = ownsDogsBlocked
          .map(r => `${labelFor(r.userId)}: owns registered dogs`)
          .join('; ');

        setError(
          successful.length > 0
            ? `${successful.length} of ${userIds.length} users deleted — ${ownsDogsBlocked.length} could not be deleted (${details})`
            : `Could not delete: ${details}`
        );

        if (successful.length > 0) {
          onBulkComplete();
          onUsersDeleted?.(successful.map(r => r.userId));
        }
        setIsProcessing(false);
        return;
      }

      // All deletions successful
      logger.info('Successfully deleted users', 'admin', {
        count: successful.length,
        userIds: successful.map(r => r.userId),
      });

      closeDialog();
      onBulkComplete();
      onUsersDeleted?.(successful.map(r => r.userId));
    } catch (error) {
      logger.error(
        'Error deleting users',
        'admin',
        { userIds: selectedUsers.map(u => u.id) },
        error as Error
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete users. Please try again.';
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedUsers, deleteUserMutation, closeDialog, onBulkComplete, onUsersDeleted]);

  const handleCascadeDelete = useCallback(async () => {
    if (!cascadeData) return;

    setIsProcessing(true);
    setError(null);

    try {
      logger.debug('Cascade delete', 'admin', { userIds: cascadeData.userIds });

      // Delete with cascade option
      const deletePromises = cascadeData.userIds.map(async userId => {
        await deleteUserMutation.mutateAsync({ id: userId });
        return userId;
      });

      const deletedUserIds = await Promise.all(deletePromises);

      logger.info('Successfully cascade deleted users and related data', 'admin', {
        count: deletedUserIds.length,
        userIds: deletedUserIds,
      });

      closeDialog();
      onBulkComplete();
      onUsersDeleted?.(deletedUserIds);
    } catch (error) {
      logger.error(
        'Error cascade deleting users',
        'admin',
        { userIds: cascadeData.userIds },
        error as Error
      );
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to delete users. Please try again.';
      setError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [cascadeData, deleteUserMutation, closeDialog, onBulkComplete, onUsersDeleted]);

  const handleBulkPermanentDelete = useCallback(async () => {
    setIsProcessing(true);
    setError(null);

    try {
      const userIds = selectedUsers.map(u => u.id);
      logger.debug('Bulk permanent delete', 'admin', { userIds });

      const results = await Promise.allSettled(
        userIds.map(async userId => {
          await permanentDeleteMutation.mutateAsync({ id: userId });
          return userId;
        })
      );

      const succeeded = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value);
      const failed = results.filter(r => r.status === 'rejected');

      if (succeeded.length > 0) {
        logger.info('Successfully permanently deleted users', 'admin', {
          count: succeeded.length,
          userIds: succeeded,
        });
        onUsersDeleted?.(succeeded);
      }

      if (failed.length > 0) {
        const errorMessage = `${failed.length} of ${userIds.length} users failed to delete.`;
        logger.error('Partial failure in bulk permanent delete', 'admin', {
          succeeded: succeeded.length,
          failed: failed.length,
        });
        setError(errorMessage);
      } else {
        closeDialog();
      }

      onBulkComplete();
    } finally {
      setIsProcessing(false);
    }
  }, [selectedUsers, permanentDeleteMutation, closeDialog, onBulkComplete, onUsersDeleted]);

  const handleRoleSelection = useCallback((role: UserRoleType, checked: boolean) => {
    if (checked) {
      setRoleData(prev => ({
        ...prev,
        roles: [...prev.roles, role],
      }));
    } else {
      setRoleData(prev => ({
        ...prev,
        roles: prev.roles.filter(r => r !== role),
      }));
    }
  }, []);

  return {
    currentDialog,
    setCurrentDialog,
    isProcessing: isProcessing || bulkRoleDispatch.isBusy,
    error,
    cascadeData,
    roleData,
    setRoleData,
    closeDialog,
    handleBulkRoleAction,
    handleBulkDelete,
    handleCascadeDelete,
    handleBulkPermanentDelete,
    handleRoleSelection,
  };
}
