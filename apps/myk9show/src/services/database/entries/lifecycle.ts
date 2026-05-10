/**
 * Entry lifecycle transitions.
 *
 * Callers should use these named transitions instead of writing `entry_status`
 * values directly. The low-level `updateEntryStatus` function remains exported
 * for legacy migration and bulk operations.
 */
import type { EntryStatus } from '@/types/entry-lifecycle';
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
