/**
 * Decides, at the click, whether signing out needs the warning (MYK9-202, MYK9-2013).
 *
 * The unsent count is read fresh from this device when the person taps Sign out, through the
 * one unsent-work source (MYK9-2011), never from a hook's last value: a menu that has just
 * mounted would otherwise read "nothing unsent" before its first read finished.
 */
import { readDeviceUnsentWork, type UnsentWork } from '@/services/replication/unsentWork';
import {
  getSignOutGuardMode,
  type SignOutUnsent,
  type SignOutWarningContext,
} from './signOutGuard';

/** This device's unsent work for the guard; null when it could not be read. */
export async function readSignOutUnsent(
  read: () => Promise<UnsentWork> = readDeviceUnsentWork
): Promise<SignOutUnsent | null> {
  try {
    const work = await read();
    return { scores: work.unsentScoreCount, otherChanges: work.otherChangeCount };
  } catch {
    return null;
  }
}

/** The warning to show, or null when signing out needs none. */
export async function resolveSignOutWarning({
  isOffline,
  roles,
  read,
}: {
  isOffline: boolean;
  roles: readonly string[];
  read?: () => Promise<UnsentWork>;
}): Promise<SignOutWarningContext | null> {
  const unsent = await readSignOutUnsent(read);
  const mode = getSignOutGuardMode({ isOffline, roles, unsent });
  return mode === 'none' ? null : { mode, unsent };
}
