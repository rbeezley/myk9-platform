import { useState, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import { SelectedUser } from '@/pages/admin/UserManagementPage';
import {
  useDeleteUserMutation,
  usePermanentDeleteUserMutation,
} from '@/hooks/queries/useUsersQuery';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { rbacService } from '@/services/rbac/RBACService';
import type { BulkRoleSubmitConfig } from './BulkRoleDialog';
import { applyBulkRoleChangeToUser } from './bulkRoleRunner';
import type { DialogType, ErrorWithRelatedData } from './BulkActionsBar.types';

interface UseBulkActionsOptions {
  selectedUsers: SelectedUser[];
  onBulkComplete: (deletedUserIds?: string[]) => void;
  onUsersDeleted?: ((deletedUserIds: string[]) => void) | undefined;
}

function labelForUser(user: SelectedUser): string {
  return `${user.user.firstName} ${user.user.lastName}`.trim() || user.id;
}

export function useBulkActions({
  selectedUsers,
  onBulkComplete,
  onUsersDeleted,
}: UseBulkActionsOptions) {
  const queryClient = useQueryClient();
  const deleteUserMutation = useDeleteUserMutation();
  const permanentDeleteMutation = usePermanentDeleteUserMutation();
  const [currentDialog, setCurrentDialog] = useState<DialogType>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRoleProcessing, setIsRoleProcessing] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Toast-driven retries fire after later renders may have produced a fresher
  // selection — a closure over the `selectedUsers` prop would still read the
  // dispatch-time list. The ref always points at the latest selection, which is
  // the closest proxy this bar has to "the current admin users list" (mirrors
  // useClassBulkActions' classesByIdRef pattern).
  const selectedUsersRef = useRef(selectedUsers);
  useEffect(() => {
    selectedUsersRef.current = selectedUsers;
  });

  const roleDispatch = useBulkDispatch<SelectedUser>({ getLabel: labelForUser });
  const [cascadeData, setCascadeData] = useState<{
    userIds: string[];
    entryCount: number;
    dogCount: number;
    ownsDogsBlocked: { userId: string; label: string }[];
  } | null>(null);

  const closeDialog = useCallback(() => {
    setCurrentDialog(null);
    setError(null);
    setCascadeData(null);
    setRoleError(null);
  }, []);

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

      const labelFor = (userId: string) => {
        const selected = selectedUsers.find(u => u.id === userId);
        return selected ? `${selected.user.firstName} ${selected.user.lastName}` : userId;
      };

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

        // Stash any MK001-blocked users alongside the cascade set so the cascade
        // flow can still report them — the owns-dogs guard has no cascade override,
        // so those users won't be deleted even when the operator confirms cascade.
        // Without this they'd be silently dropped when needsCascade returns first.
        setCascadeData({
          userIds: needsCascade.map(r => r.userId),
          entryCount: totalEntryCount,
          dogCount: totalDogCount,
          ownsDogsBlocked: ownsDogsBlocked.map(r => ({
            userId: r.userId,
            label: labelFor(r.userId),
          })),
        });

        // Some users may already have been deleted before the cascade prompt
        // opened. Remove only those successes from the live selection; users
        // awaiting cascade or blocked by MK001 stay visible and selected.
        if (successful.length > 0) {
          onUsersDeleted?.(successful.map(r => r.userId));
        }

        if (ownsDogsBlocked.length > 0) {
          const details = ownsDogsBlocked
            .map(r => `${labelFor(r.userId)}: owns registered dogs`)
            .join('; ');
          setError(
            `${ownsDogsBlocked.length} could not be deleted (${details}) and will remain even after cascade.`
          );
        }

        setCurrentDialog('cascadeConfirm');
        setIsProcessing(false);
        return;
      }

      if (ownsDogsBlocked.length > 0) {
        // Unlike HAS_RELATED_DATA, the owns-dogs guard has no cascade override —
        // the trigger blocks unconditionally until the person's dogs are
        // reassigned or deleted. Report each blocked person by name with the
        // human-readable reason; any other selected users still delete.
        const details = ownsDogsBlocked
          .map(r => `${labelFor(r.userId)}: owns registered dogs`)
          .join('; ');

        const message =
          successful.length > 0
            ? `${successful.length} of ${userIds.length} users deleted — ${ownsDogsBlocked.length} could not be deleted (${details})`
            : `Could not delete: ${details}`;
        setError(message);
        // Surface via toast in BOTH cases: the ownership result is no longer
        // inside the closed confirmation dialog, and the remaining selected
        // users need a durable explanation before the operator resolves ownership.
        toast.error(message);
        if (successful.length > 0) {
          const successfulUserIds = successful.map(r => r.userId);
          onBulkComplete(successfulUserIds);
          onUsersDeleted?.(successfulUserIds);
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
      const successfulUserIds = successful.map(r => r.userId);
      onBulkComplete(successfulUserIds);
      onUsersDeleted?.(successfulUserIds);
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

      onBulkComplete(deletedUserIds);
      onUsersDeleted?.(deletedUserIds);

      // If any users were owns-dogs blocked, keep the operator informed rather
      // than closing on a clean note — the cascade did not delete them.
      const ownsDogsBlocked = cascadeData.ownsDogsBlocked;
      if (ownsDogsBlocked.length > 0) {
        const details = ownsDogsBlocked.map(b => `${b.label}: owns registered dogs`).join('; ');
        setCascadeData(null);
        setCurrentDialog(null);
        setError(`${ownsDogsBlocked.length} could not be deleted (${details})`);
      } else {
        closeDialog();
      }
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

      onBulkComplete(succeeded);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedUsers, permanentDeleteMutation, closeDialog, onBulkComplete, onUsersDeleted]);

  const handleBulkRoleChange = useCallback(
    async (config: BulkRoleSubmitConfig) => {
      setRoleError(null);
      setIsRoleProcessing(true);
      try {
        // Pre-dispatch validation: the selected role names must all exist in the
        // canonical `roles` table before any user is touched — an unknown role
        // rejects the whole batch with a visible error instead of a per-item
        // false/skip (design.md "Replace validates before it revokes" and the
        // shared-vocabulary rationale in proposal.md).
        const allRoles = await rbacService.getAllRoles();
        const canonicalNames = new Set(allRoles.map(r => r.name));
        const unknown = config.roleNames.filter(name => !canonicalNames.has(name));
        if (unknown.length > 0) {
          setRoleError(`Unknown role(s): ${unknown.join(', ')}. No changes were made.`);
          return;
        }

        // Snapshot the selection at dispatch time. A retry re-checks membership
        // against the FRESH selection (read through the ref) — a user removed
        // from the selection (e.g. deleted) between the initial attempt and a
        // retry is reported as no-longer-eligible rather than re-attempted.
        const usersAtDispatch = new Set(selectedUsers.map(u => u.id));

        const outcome = await roleDispatch.run(
          selectedUsers,
          async user => {
            await applyBulkRoleChangeToUser(user.id, config);
            await queryClient.invalidateQueries({ queryKey: ['user-roles', user.id] });
            await queryClient.invalidateQueries({
              queryKey: ['user-role-assignments', user.id],
            });
          },
          {
            onFullSuccess: () => {
              setCurrentDialog(null);
              onBulkComplete();
            },
            applicableWhen: user =>
              usersAtDispatch.has(user.id) &&
              selectedUsersRef.current.some(u => u.id === user.id),
          }
        );

        // null = a prior batch is still in flight (latched no-op) — nothing
        // happened, so leave the dialog open and don't touch selection.
        if (outcome === null) return;
        if (outcome.failed.length > 0) {
          setRoleError(
            `${outcome.succeeded.length} of ${selectedUsers.length} users updated — ${outcome.failed.length} failed.`
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to change roles';
        setRoleError(message);
        logger.error('Bulk role change failed', 'admin', {}, err as Error);
      } finally {
        setIsRoleProcessing(false);
      }
    },
    [selectedUsers, roleDispatch, queryClient, onBulkComplete]
  );

  return {
    currentDialog,
    setCurrentDialog,
    isProcessing,
    error,
    cascadeData,
    closeDialog,
    handleBulkDelete,
    handleCascadeDelete,
    handleBulkPermanentDelete,
    handleBulkRoleChange,
    isRoleProcessing,
    roleError,
  };
}
