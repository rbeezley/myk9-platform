import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/services/LoggingService';
import { SelectedUser } from '@/pages/admin/UserManagementPage';
import { useBulkDispatch } from '@/hooks/useBulkDispatch';
import { queryKeys } from '@/lib/queryClient';
import { rbacService } from '@/services/rbac/RBACService';
import { executePersonPlan } from './bulkRoleRunner';
import type { BulkRolePlan } from './bulkRolePlanner';
import type { DialogType } from './BulkActionsBar.types';

interface UseBulkActionsOptions {
  selectedUsers: SelectedUser[];
  onBulkComplete: (deletedUserIds?: string[]) => void;
  /** Clears the page's selection — invoked when a role batch fully succeeds. */
  onClearSelection?: (() => void) | undefined;
}

/**
 * Role-edit dispatch and dialog state for the admin Users bulk bar. Bulk delete
 * is the shared `DeleteObjectDialog` (soft, with Undo); permanent purge lives on
 * Admin → Deleted Items.
 */
export function useBulkActions({
  selectedUsers,
  onBulkComplete,
  onClearSelection,
}: UseBulkActionsOptions) {
  const queryClient = useQueryClient();
  const [currentDialog, setCurrentDialog] = useState<DialogType>(null);
  const [isRoleProcessing, setIsRoleProcessing] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);

  // Toast-driven retries fire after later renders may have produced a fresher
  // selection — a closure over the `selectedUsers` prop would still read the
  // dispatch-time list. The ref always points at the latest selection (mirrors
  // useClassBulkActions' classesByIdRef / useBulkAccountActions' usersByIdRef).
  const selectedIdsRef = useRef(new Set(selectedUsers.map(u => u.id)));
  useEffect(() => {
    selectedIdsRef.current = new Set(selectedUsers.map(u => u.id));
  }, [selectedUsers]);

  const roleDispatch = useBulkDispatch<string>({
    getLabel: id => {
      const found = selectedUsers.find(u => u.id === id);
      if (!found) return id;
      return `${found.user.firstName ?? ''} ${found.user.lastName ?? ''}`.trim() || id;
    },
  });

  const closeDialog = useCallback(() => {
    setCurrentDialog(null);
  }, []);

  // Executes a plan from bulkRolePlanner — the exact plan BulkRoleEditPanel's
  // "What will happen" showed AND already re-verified fresh (its own
  // refetch-before-Apply). This hook does not re-derive or re-check the plan;
  // it only runs it and reports the outcome, so the summary and the runner can
  // never disagree (Codex convergence restructure).
  const handleBulkRoleEdit = useCallback(
    async (plan: BulkRolePlan) => {
      setRoleError(null);
      setIsRoleProcessing(true);
      try {
        // Pre-dispatch validation: an unknown role name rejects the whole batch
        // with a visible error instead of a per-person skip (proposal.md's
        // shared-vocabulary rationale).
        const allRoles = await rbacService.getAllRoles();
        const canonicalNames = new Set(allRoles.map(r => r.name));
        const unknown = [
          ...new Set(plan.people.flatMap(person => person.add.map(grant => grant.role))),
        ].filter(name => !canonicalNames.has(name));
        if (unknown.length > 0) {
          setRoleError(`Unknown role(s): ${unknown.join(', ')}. No changes were made.`);
          return;
        }

        const planByUser = new Map(plan.people.map(person => [person.userId, person]));
        const targetIds = plan.people.map(person => person.userId);

        const outcome = await roleDispatch.run(
          targetIds,
          async userId => {
            const person = planByUser.get(userId);
            if (person) await executePersonPlan(person);
            await queryClient.invalidateQueries({ queryKey: ['user-roles', userId] });
            await queryClient.invalidateQueries({
              queryKey: ['user-role-assignments', userId],
            });
          },
          {
            // Runs on initial full success AND when a toast-driven retry of the
            // failed subset fully succeeds, so the list refresh and selection
            // clear live here, not in the panel's submit path.
            onFullSuccess: () => {
              setCurrentDialog(null);
              onClearSelection?.();
              void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
              // MYK9-820 round-3 finding #1: a reselect of the SAME people must
              // plan from fresh data, not this panel's now-stale cached read.
              void queryClient.invalidateQueries({ queryKey: ['bulk-role-assignments'] });
              onBulkComplete();
            },
            // A retry fires later, from the toast — re-check membership against
            // the FRESH selection (read through the ref), not the selection this
            // batch was dispatched with. A user removed from the selection (e.g.
            // deleted) in between is reported as no-longer-eligible, not re-run.
            applicableWhen: userId => selectedIdsRef.current.has(userId),
          }
        );

        // null = a prior batch is still in flight (latched no-op) — nothing
        // happened, so leave the panel open and don't touch selection.
        if (outcome === null) return;
        if (outcome.failed.length > 0) {
          // Partial success still changed the succeeded users' roles — refresh
          // the admin list so their role chips aren't stale while the failure
          // stays visible for retry.
          if (outcome.succeeded.length > 0) {
            void queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
            void queryClient.invalidateQueries({ queryKey: ['bulk-role-assignments'] });
          }
          setRoleError(
            `${outcome.succeeded.length} of ${targetIds.length} users updated — ${outcome.failed.length} failed.`
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
    [roleDispatch, queryClient, onBulkComplete, onClearSelection]
  );

  return {
    currentDialog,
    setCurrentDialog,
    closeDialog,
    handleBulkRoleEdit,
    isRoleProcessing,
    roleError,
  };
}
