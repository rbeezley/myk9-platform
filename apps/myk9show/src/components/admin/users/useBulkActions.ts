import { useState, useCallback } from 'react';
import { logger } from '@/services/LoggingService';
import type { UserRole as UserRoleType } from '@/types/user-types';
import { SelectedUser } from '@/pages/admin/UserManagementPage';
import {
  useDeleteUserMutation,
  usePermanentDeleteUserMutation,
} from '@/hooks/queries/useUsersQuery';
import type {
  DialogType,
  BulkRoleData,
  BulkStatusData,
  ErrorWithRelatedData,
} from './BulkActionsBar.types';

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
  const [statusData, setStatusData] = useState<BulkStatusData>({
    action: 'activate',
  });

  const closeDialog = useCallback(() => {
    setCurrentDialog(null);
    setError(null);
    setCascadeData(null);
    setRoleData({ action: 'add', roles: [] });
    setStatusData({ action: 'activate' });
  }, []);

  const handleBulkRoleAction = useCallback(async () => {
    if (roleData.roles.length === 0) {
      setError('Please select at least one role');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // In a real implementation, this would call the appropriate API
      logger.debug('Bulk role action', 'admin', {
        action: roleData.action,
        roles: roleData.roles,
        userIds: selectedUsers.map(u => u.id),
      });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      closeDialog();
      onBulkComplete();
    } catch {
      setError('Failed to update user roles. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [roleData, selectedUsers, closeDialog, onBulkComplete]);

  const handleBulkStatusAction = useCallback(async () => {
    setIsProcessing(true);
    setError(null);

    try {
      logger.debug('Bulk status action', 'admin', {
        action: statusData.action,
        userIds: selectedUsers.map(u => u.id),
      });

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));

      closeDialog();
      onBulkComplete();
    } catch {
      setError('Failed to update user status. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [statusData, selectedUsers, closeDialog, onBulkComplete]);

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
          return { userId, success: true };
        } catch (error: unknown) {
          const errorWithCode = error as ErrorWithRelatedData;
          if (error instanceof Error && errorWithCode.code === 'HAS_RELATED_DATA') {
            return { userId, success: false, relatedData: errorWithCode.details };
          }
          throw error; // Re-throw other errors
        }
      });

      const results = await Promise.all(deletePromises);
      const successful = results.filter(r => r.success);
      const needsCascade = results.filter(r => !r.success);

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
    isProcessing,
    error,
    cascadeData,
    roleData,
    setRoleData,
    statusData,
    setStatusData,
    closeDialog,
    handleBulkRoleAction,
    handleBulkStatusAction,
    handleBulkDelete,
    handleCascadeDelete,
    handleBulkPermanentDelete,
    handleRoleSelection,
  };
}
