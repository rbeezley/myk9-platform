import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';

export interface ReplicatedEntryStatusAuditInput {
  entryId: string;
  fromStatus?: string | null | undefined;
  toStatus: string;
  action: string;
  reason?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
}

export async function logReplicatedEntryStatusChange(
  input: ReplicatedEntryStatusAuditInput
): Promise<void> {
  await auditService.log({
    action: AuditAction.UPDATE,
    entityType: 'entry',
    entityId: input.entryId,
    changes: {
      entryStatus: {
        from: input.fromStatus ?? null,
        to: input.toStatus,
      },
    },
    metadata: {
      action: input.action,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.metadata ?? {}),
    },
  });
}
