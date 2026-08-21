import type { Logger } from './dependencies';
import type { PendingMutation } from './types';
import type { MutationUploadAuthContext } from './mutation-manager-options';

export interface MutationSkipCounts {
  dependency: number;
  backoff: number;
  conflict: number;
  vanished: number;
  foreignOwner: number;
  legacyOwner: number;
}

export function createMutationSkipCounts(): MutationSkipCounts {
  return {
    dependency: 0,
    backoff: 0,
    conflict: 0,
    vanished: 0,
    foreignOwner: 0,
    legacyOwner: 0,
  };
}

export function holdForPassOwner(
  mutation: PendingMutation,
  passAuthUserId: string,
  blockedDependencyIds: Set<string>,
  skipped: MutationSkipCounts
): boolean {
  if (mutation.authUserId === passAuthUserId) return false;
  if (mutation.authUserId === undefined) skipped.legacyOwner++;
  else skipped.foreignOwner++;
  blockedDependencyIds.add(mutation.id);
  return true;
}

export async function holdAfterOwnerChange(
  mutation: PendingMutation,
  getCurrentUploadContext: () => Promise<MutationUploadAuthContext>,
  blockedDependencyIds: Set<string>,
  skipped: MutationSkipCounts
): Promise<MutationUploadAuthContext | null> {
  const executionContext = await getCurrentUploadContext();
  if (mutation.authUserId === executionContext.authUserId) return executionContext;
  skipped.foreignOwner++;
  blockedDependencyIds.add(mutation.id);
  return null;
}

export function logOwnerIsolation(logger: Logger, skipped: MutationSkipCounts): void {
  if (skipped.foreignOwner === 0 && skipped.legacyOwner === 0) return;
  logger.warn(
    `[MutationManager] Held ${skipped.foreignOwner} foreign-owner + ` +
      `${skipped.legacyOwner} legacy unowned mutation(s)`
  );
}

export function warnIfUploadStalled(
  logger: Logger,
  skipped: MutationSkipCounts,
  pendingCount: number,
  resultCount: number
): void {
  if (resultCount > 0 || pendingCount === 0) return;
  logger.warn(
    `[MutationManager] Upload pass skipped all ${pendingCount} pending mutation(s) — ` +
      `dependency: ${skipped.dependency}, backoff: ${skipped.backoff}, ` +
      `conflict: ${skipped.conflict}, foreign owner: ${skipped.foreignOwner}, ` +
      `legacy unowned: ${skipped.legacyOwner}, vanished mid-pass: ${skipped.vanished}. ` +
      `Queue is stalled until the blocking condition clears.`
  );
}
