/**
 * useShowPresence — Phase 1 of docs/plan-show-presence.md.
 *
 * Joins the show-scoped Supabase Realtime presence channel and returns the
 * deduped list of who is currently "here". Built on the existing
 * `setupOptimizedPresence` primitive (utils/realtimeOptimization) — we do NOT
 * stand up a parallel real-time engine (the PR #576 mistake). Presence is
 * ephemeral; nothing here touches the replication layer or the database.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/supabaseClient';
import { eventEmitter } from '@/services/sync/eventEmitter';
import { setupOptimizedPresence } from '@/utils/realtimeOptimization';
import { features } from '@/config/features';
import { showEditAwarenessEnabled } from './editAwarenessFlag';
import type { LocalPresenceIdentity } from './useLocalPresenceIdentity';
import type { EditTarget, PresenceActivity, ShowPresence } from './types';

/** Payload shape emitted by setupOptimizedPresence on the 'presence:sync' bus. */
interface PresenceSyncEvent {
  channel: string;
  users: number;
  state: Record<string, Array<Partial<ShowPresence> & { presence_ref?: string }>>;
}

export function presenceChannelName(showId: string): string {
  return `presence:show:${showId}`;
}

/**
 * Kill switch (plan §12). Off by default via `features.showPresence`; an env
 * override (`VITE_SHOW_PRESENCE=true`) enables it for E2E / manual smoke without
 * editing the const. Evaluated at call time so the flag can be toggled in tests.
 */
function showPresenceEnabled(): boolean {
  return features.showPresence || import.meta.env?.VITE_SHOW_PRESENCE === 'true';
}

/**
 * Map a route path to a coarse activity. Pure + tiny so it is unit-testable
 * and callers/tests never need the router. Order matters: most-specific first.
 */
export function activityForPath(path: string): PresenceActivity {
  if (path.includes('/score') || path.includes('/at-show')) return 'scoring';
  if (path.includes('/edit')) return 'editing';
  if (path.includes('/check-in') || path.includes('/entries')) return 'checking-in';
  return 'viewing';
}

/**
 * Extract the class a user is on from the at-show route, so a judge scoring
 * `/at-show/:showId/class/:classId` advertises which ring/class they're at.
 * Drives the per-ring "judge online" dot on the show map. Pure + tiny.
 */
export function entityForPath(path: string): { entityType: 'class'; entityId: string } | undefined {
  const match = path.match(/\/at-show\/[^/]+\/class\/([^/]+)/);
  return match ? { entityType: 'class', entityId: match[1]! } : undefined;
}

/** Flatten Supabase presence state into one ShowPresence per user (latest ts wins). */
export function dedupePresence(state: PresenceSyncEvent['state']): ShowPresence[] {
  const byUser = new Map<string, ShowPresence>();
  for (const metas of Object.values(state ?? {})) {
    for (const meta of metas ?? []) {
      if (!meta?.userId) continue;
      const ts = meta.ts ?? 0;
      const existing = byUser.get(meta.userId);
      if (existing && existing.ts > ts) continue;
      byUser.set(meta.userId, {
        userId: meta.userId,
        name: meta.name ?? 'Someone',
        role: meta.role ?? 'exhibitor',
        ...(meta.avatarUrl ? { avatarUrl: meta.avatarUrl } : {}),
        location: meta.location ?? { page: '' },
        activity: meta.activity ?? 'viewing',
        ...(meta.editing ? { editing: meta.editing } : {}),
        ts,
      });
    }
  }
  return Array.from(byUser.values());
}

export interface UseShowPresenceResult {
  /** Everyone currently present in the show, including the local user. */
  present: ShowPresence[];
  /**
   * Begin/refresh the local user's "editing this entity" advisory (Phase 3).
   * No-op when edit-awareness is dark or presence is off. Stable identity.
   */
  setEditing: (target: EditTarget) => void;
  /** Clear the local user's editing advisory (Phase 3). Stable identity. */
  clearEditing: () => void;
}

export function useShowPresence(
  showId: string | undefined,
  identity: LocalPresenceIdentity | null
): UseShowPresenceResult {
  const location = useLocation();
  const [present, setPresent] = useState<ShowPresence[]>([]);

  // Identity is resolved upstream (useLocalPresenceIdentity) so the producer here
  // and the privacy filter in ShowPresenceProvider read ONE source — auth account
  // or anonymous passcode grant — and never disagree. Destructure to primitives so
  // the identity effect keys on field VALUES, not the object reference: an unstable
  // identity (a caller that rebuilds it each render) must never spin a track→sync→
  // re-render loop.
  const userId = identity?.userId;
  const name = identity?.name;
  const role = identity?.role;
  const avatarUrl = identity?.avatarUrl;

  // Single mutable presence payload. setupOptimizedPresence's heartbeat captures
  // this reference, so mutating it in place re-tracks the latest activity on the
  // next beat without tearing down the channel. Refs are only written in effects.
  const infoRef = useRef<ShowPresence | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Phase 3: the local user's pending edit advisory, kept SEPARATELY from infoRef
  // so it survives the mount race. A descendant panel's useEditingPresence effect
  // runs BEFORE this provider's identity effect on first mount (React runs child
  // effects before parent effects), so setEditing can fire while infoRef is still
  // null (e.g. a panel opened on initial render via `?edit=true`). Stashing the
  // target here lets the identity effect re-apply it once infoRef exists, instead
  // of silently dropping it. (Codex review, PR #593.)
  const pendingEditRef = useRef<EditTarget | null>(null);

  // Keep the presence payload current with identity + route, and push the change
  // immediately so others see the move without waiting for the next heartbeat.
  useEffect(() => {
    // Kill switch (plan §12): when off (or no identity), the hook is a complete
    // no-op — identity resolution already returns null when dark.
    if (!showPresenceEnabled() || !userId || !name || !role) {
      infoRef.current = null;
      return;
    }
    const next: ShowPresence = {
      userId,
      name,
      role,
      ...(avatarUrl ? { avatarUrl } : {}),
      location: { page: location.pathname, ...(entityForPath(location.pathname) ?? {}) },
      activity: activityForPath(location.pathname),
      ts: Date.now(),
    };
    if (infoRef.current) {
      Object.assign(infoRef.current, next);
    } else {
      infoRef.current = next;
    }
    // Reconcile the edit advisory against the freshly-built payload. The fresh
    // branch above (first mount) drops any `editing` a child set before infoRef
    // existed; re-apply the stashed target so an open-on-mount panel still
    // broadcasts. Gated on the flag so a dark feature never reaches the wire.
    if (pendingEditRef.current && showEditAwarenessEnabled()) {
      infoRef.current.editing = pendingEditRef.current;
    }
    // Push the move immediately ONLY if the channel has joined. Before join,
    // Realtime rejects the push ("tried to push 'presence' before joining"); the
    // channel effect's SUBSCRIBED handler does the first track with this same
    // infoRef, so nothing is lost.
    const channel = channelRef.current;
    if (channel && String(channel.state) === 'joined') channel.track(infoRef.current);
  }, [userId, name, role, avatarUrl, location.pathname]);

  // Channel lifecycle — only re-runs when the show or the user identity changes.
  // Declared after the identity effect so infoRef is populated first on mount.
  // Gated by the kill switch (plan §12): when off we open no channel at all.
  useEffect(() => {
    if (!showPresenceEnabled() || !showId || !userId || !infoRef.current) return undefined;

    const name = presenceChannelName(showId);
    const channel = supabase.channel(name, { config: { presence: { key: userId } } });
    channelRef.current = channel;

    const stopPresence = setupOptimizedPresence(
      channel,
      infoRef.current as unknown as Record<string, unknown>
    );

    // setupOptimizedPresence emits 'presence:sync' keyed by channel.topic, which
    // Supabase prefixes with "realtime:" (e.g. "realtime:presence:show:<id>").
    // Match that ACTUAL topic, not the un-prefixed name we passed to .channel() —
    // otherwise every sync is discarded and the roster never populates.
    const topic = channel.topic;
    const onSync = (payload: unknown) => {
      const evt = payload as PresenceSyncEvent;
      if (evt.channel !== topic) return;
      setPresent(dedupePresence(evt.state));
    };
    eventEmitter.on('presence:sync', onSync);

    channel.subscribe(status => {
      if (status === 'SUBSCRIBED' && infoRef.current) {
        infoRef.current.ts = Date.now();
        channel.track(infoRef.current);
      }
    });

    return () => {
      eventEmitter.off('presence:sync', onSync);
      stopPresence();
      supabase.removeChannel(channel);
      channelRef.current = null;
      setPresent([]);
    };
  }, [showId, userId]);

  // Phase 3 soft edit-awareness (plan §6): mutate the SINGLE `editing` slot on the
  // live payload and push it immediately so others see "X is editing this" without
  // waiting for the next heartbeat. Stable (refs only) so the context value that
  // exposes them never churns. The track guard mirrors the identity effect: before
  // join Realtime rejects the push, and the SUBSCRIBED handler tracks this same
  // infoRef on join — so an edit opened pre-join is not lost.
  const setEditing = useCallback((target: EditTarget) => {
    // Gated by edit-awareness's OWN dark flag — when off, broadcast nothing.
    if (!showEditAwarenessEnabled()) return;
    // Stash FIRST, before the infoRef-null guard, so a target set during the mount
    // race (child effect before the provider populated infoRef) is not lost — the
    // identity effect re-applies it once infoRef exists.
    pendingEditRef.current = { entityType: target.entityType, entityId: target.entityId };
    const info = infoRef.current;
    if (!info) return; // infoRef not populated yet → applied on populate (see identity effect)
    info.editing = pendingEditRef.current;
    info.ts = Date.now();
    const channel = channelRef.current;
    if (channel && String(channel.state) === 'joined') channel.track(info);
  }, []);

  const clearEditing = useCallback(() => {
    // Intentionally NOT flag-gated: always able to clear a stale slot (e.g. if the
    // flag is flipped off mid-edit). Clears the pending stash too so a later
    // identity-effect rebuild does not resurrect it. No-ops when nothing is set.
    pendingEditRef.current = null;
    const info = infoRef.current;
    if (!info || !info.editing) return;
    delete info.editing;
    info.ts = Date.now();
    const channel = channelRef.current;
    if (channel && String(channel.state) === 'joined') channel.track(info);
  }, []);

  return { present, setEditing, clearEditing };
}
