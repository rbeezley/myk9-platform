import { auditService } from '@/services/AuditService';
import { getEntryArmbandById } from '@/services/database/armbands/secretary';
import { setEntryLifecycleStatus } from '@/services/database/entries';
import { AuditAction } from '@/types/audit-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus } from '@/types/show-registration-types';
import { mapStatusToDb } from '@/utils/entryManagementUtils';

export interface SecretaryEntryArmbandPatch {
  dogId: string;
  showId: string;
  armband: string;
}

export interface ChangeSecretaryEntryStatusParams {
  entry: EntryManagementEntry;
  newStatus: EntryStatus;
  secretaryId?: string;
  withdrawalReason?: string;
}

export interface ChangeSecretaryEntryStatusResult {
  armbandPatch?: SecretaryEntryArmbandPatch;
}

interface SecretaryEntryStatusDependencies {
  setEntryLifecycleStatus: typeof setEntryLifecycleStatus;
  getEntryArmbandById: typeof getEntryArmbandById;
  auditLog: typeof auditService.log;
}

const defaultDependencies: SecretaryEntryStatusDependencies = {
  setEntryLifecycleStatus,
  getEntryArmbandById,
  auditLog: input => auditService.log(input),
};

export async function changeSecretaryEntryStatus(
  params: ChangeSecretaryEntryStatusParams,
  dependencies: SecretaryEntryStatusDependencies = defaultDependencies
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

  if (newStatus !== EntryStatus.ACCEPTED) {
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
