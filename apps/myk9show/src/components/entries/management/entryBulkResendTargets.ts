/**
 * Resolves the "Resend confirmation" bulk action's targets (MYK9-795).
 *
 * A registration can hold several selected entries, so the target list is
 * DEDUPED registration ids, not one send per selected entry. Called at
 * dispatch time against the current selection — never a captured snapshot —
 * mirroring the "ids not snapshots, re-check at dispatch" rule the existing
 * Accept/Reject bulk actions already follow (`bulkActionEligibility.ts`).
 */
import type { EntryManagementEntry } from '@/types/entry-management-types';

export function getUniqueResendTargets(
  entries: readonly EntryManagementEntry[],
  isResendDisabled: (registrationId: string) => boolean
): string[] {
  const seen = new Set<string>();
  const targets: string[] = [];
  for (const entry of entries) {
    const registrationId = entry.registrationId;
    if (!registrationId || seen.has(registrationId)) continue;
    seen.add(registrationId);
    if (!isResendDisabled(registrationId)) targets.push(registrationId);
  }
  return targets;
}
