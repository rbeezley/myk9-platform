/**
 * Theme sync owner (MYK9-1564).
 *
 * One module-level write queue per user, shared by every caller: the
 * `useUserPreferences` hook (Account page) and the app-level reconnect trigger.
 * Each server write replaces the whole preferences row, so two in flight from
 * this device could land out of order; one shared queue makes that impossible no
 * matter which surface started the sync (the bug MYK9-1545 fixed per hook).
 */
import { userPreferencesService } from '@/services/preferences/userPreferencesService';
import {
  settleFields,
  THEME_FIELDS,
  deviceThemeOrDefaults,
  readDeviceTheme,
  reconcileTheme,
} from '@/services/preferences/deviceThemeCache';
import type { UserPreferences, ThemePreferences } from '@/types/user-preferences';

const queues = new Map<string, Promise<unknown>>();

/** Run `task` after every earlier write for this user has settled (success or not). */
export function enqueuePreferenceWrite<T>(uid: string, task: () => Promise<T>): Promise<T> {
  const tail = queues.get(uid) ?? Promise.resolve();
  const run = tail.then(task, task);
  queues.set(
    uid,
    run.catch(() => undefined)
  );
  return run;
}

export interface ThemeSyncHandlers {
  /** False once the user signed out, switched or the caller unmounted: results are dropped. */
  isCurrent: () => boolean;
  /** Receives the preferences row as it stands after each step. */
  onPreferences?: (preferences: UserPreferences) => void;
  /** Receives theme fields where a newer server value replaced this device's. */
  onServerTheme?: (adopted: Partial<ThemePreferences>) => void;
}

/** True when the device copy holds edits the server has not accepted yet. */
export function hasPendingThemeChanges(uid: string): boolean {
  return (readDeviceTheme(uid)?.pending.length ?? 0) > 0;
}

/** Pull the server row, reconcile with the device copy, push newer local edits. */
export function syncDeviceTheme(uid: string, handlers: ThemeSyncHandlers): Promise<void> {
  const { isCurrent, onPreferences, onServerTheme } = handlers;
  return enqueuePreferenceWrite(uid, async () => {
    const server = await userPreferencesService.loadPreferences(uid);
    if (!isCurrent()) return;
    const cache = readDeviceTheme(uid);
    const { theme, toPush, adoptedFromServer } = reconcileTheme(
      cache,
      server.theme,
      (server.themeChangedAt ?? {}) as Partial<Record<keyof ThemePreferences, number>>,
      server.updatedAt.getTime()
    );
    const sentAt = { ...(cache?.changedAt ?? {}) };
    const pushFields = Object.keys(toPush) as Array<keyof ThemePreferences>;
    // Fields the server won hold the server's value now; each settle skips a
    // field edited since this sync began, so a slow sync never undoes a newer edit.
    const serverWon = Object.fromEntries(
      THEME_FIELDS.filter(f => !pushFields.includes(f)).map(f => [f, theme[f]])
    );
    const settled = settleFields(uid, serverWon, sentAt);
    onPreferences?.({ ...server, theme: deviceThemeOrDefaults(settled) });
    if (Object.keys(adoptedFromServer).length > 0) onServerTheme?.(adoptedFromServer);
    if (pushFields.length > 0) {
      const written = await userPreferencesService.updatePreferences(
        uid,
        { theme: toPush },
        Object.fromEntries(pushFields.map(f => [f, sentAt[f] ?? Date.now()]))
      );
      // The write keeps a newer value another device saved meanwhile; settle
      // to what the server holds, and apply any field it kept.
      const held = Object.fromEntries(pushFields.map(f => [f, written.theme[f]]));
      const after = settleFields(uid, held, sentAt);
      if (!isCurrent()) return;
      const lost = Object.fromEntries(
        pushFields.filter(f => written.theme[f] !== toPush[f]).map(f => [f, written.theme[f]])
      );
      onPreferences?.({ ...written, theme: deviceThemeOrDefaults(after) });
      if (Object.keys(lost).length > 0) onServerTheme?.(lost);
    }
  });
}
