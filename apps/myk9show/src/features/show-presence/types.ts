/**
 * Show-presence types — Phase 1 of docs/plan-show-presence.md.
 *
 * Presence is EPHEMERAL: it rides Supabase Realtime presence, never the
 * replication layer or the database. `role` is display-only and must never be
 * used for an authorization decision (see plan §7).
 */

export type PresenceActivity = 'viewing' | 'scoring' | 'editing' | 'checking-in';

export interface PresenceLocation {
  /** Current route path, e.g. '/at-show/ring/3'. */
  page: string;
  entityType?: 'show' | 'trial' | 'class' | 'entry';
  entityId?: string;
}

/** One connected participant in a show, as broadcast over the presence channel. */
export interface ShowPresence {
  userId: string;
  name: string;
  /** Display-only role label. Never an authz signal. */
  role: string;
  avatarUrl?: string;
  location: PresenceLocation;
  activity: PresenceActivity;
  /** Set while this user has an entity's edit surface open (drives Phase 3). */
  editing?: { entityType: string; entityId: string };
  /** Epoch ms of the last track; used to pick the latest meta when deduping. */
  ts: number;
}
