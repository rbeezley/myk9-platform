/**
 * Entry lifecycle transitions.
 *
 * Callers should use these named transitions instead of writing `entry_status`
 * values directly. The low-level `updateEntryStatus` function remains exported
 * for legacy migration and bulk operations.
 */
import type { EntryStatus } from '@/types/entry-lifecycle';
import { auditService } from '@/services/AuditService';
import { getEntryArmbandById } from '@/services/database/armbands/secretary';
import { AuditAction } from '@/types/audit-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus as SecretaryEntryStatus } from '@/types/show-registration-types';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { updateEntryStatus } from './secretary';

export type EntryLifecycleAction = 'accept' | 'reject' | 'scratch' | 'waitlist';

export interface EntryLifecycleTransitionParams {
  entryId: string;
  action: EntryLifecycleAction;
  reason?: string | undefined;
}

export interface SetEntryLifecycleStatusParams {
  entryId: string;
  status: EntryStatus;
  reason?: string | undefined;
}

export interface EntryLifecycleArmbandPatch {
  dogId: string;
  showId: string;
  armband: string;
}

export interface ChangeSecretaryEntryStatusParams {
  entry: EntryManagementEntry;
  newStatus: SecretaryEntryStatus;
  secretaryId?: string;
  withdrawalReason?: string;
}

export interface ChangeSecretaryEntryStatusResult {
  armbandPatch?: EntryLifecycleArmbandPatch;
}

export interface SecretaryEntryStatusDependencies {
  setEntryLifecycleStatus: typeof setEntryLifecycleStatus;
  getEntryArmbandById: typeof getEntryArmbandById;
  auditLog: typeof auditService.log;
}

const ENTRY_LIFECYCLE_STATUS: Record<EntryLifecycleAction, EntryStatus> = {
  accept: 'confirmed',
  reject: 'withdrawn',
  scratch: 'scratched',
  // Wait List membership is represented by waitlist_entries today. Until
  // promotion is unified, this preserves the existing pending-entry decision
  // behavior behind a named Entry transition.
  waitlist: 'confirmed',
};

export async function setEntryLifecycleStatus(params: SetEntryLifecycleStatusParams) {
  return updateEntryStatus(params.entryId, params.status, params.reason);
}

export async function transitionEntryLifecycle(params: EntryLifecycleTransitionParams) {
  const status = ENTRY_LIFECYCLE_STATUS[params.action];
  return setEntryLifecycleStatus({ entryId: params.entryId, status, reason: params.reason });
}

export const acceptEntry = async (entryId: string) =>
  transitionEntryLifecycle({ entryId, action: 'accept' });

export const rejectEntry = async (entryId: string, reason?: string) =>
  transitionEntryLifecycle({ entryId, action: 'reject', reason });

export const scratchEntry = async (entryId: string, reason?: string) =>
  transitionEntryLifecycle({ entryId, action: 'scratch', reason });

export const waitlistEntry = async (entryId: string) =>
  transitionEntryLifecycle({ entryId, action: 'waitlist' });

const defaultSecretaryDependencies: SecretaryEntryStatusDependencies = {
  setEntryLifecycleStatus,
  getEntryArmbandById,
  auditLog: input => auditService.log(input),
};

export async function changeSecretaryEntryStatus(
  params: ChangeSecretaryEntryStatusParams,
  dependencies: SecretaryEntryStatusDependencies = defaultSecretaryDependencies
): Promise<ChangeSecretaryEntryStatusResult> {
  const { entry, newStatus, secretaryId, withdrawalReason } = params;

  const { error } = await dependencies.setEntryLifecycleStatus({
    entryId: entry.id,
    status: mapStatusToDb(newStatus),
    reason: withdrawalReason,
  });
  if (error) throw error;

  await dependencies.auditLog({
    action: AuditAction.UPDATE,
    entityType: 'entry',
    entityId: entry.id,
    changes: { entryStatus: { from: entry.entryStatus, to: newStatus } },
    metadata: {
      action: 'status_change',
      secretaryId,
      entryNumber: entry.entryNumber,
      ...(withdrawalReason ? { withdrawalReason } : {}),
    },
  });

  if (newStatus !== SecretaryEntryStatus.ACCEPTED) {
    return {};
  }

  const triggerArmband = await dependencies.getEntryArmbandById(entry.id);
  if (!triggerArmband?.armband || !triggerArmband.dogId || !triggerArmband.showId) {
    return {};
  }

  return {
    armbandPatch: {
      armband: triggerArmband.armband,
      dogId: triggerArmband.dogId,
      showId: triggerArmband.showId,
    },
  };
}
