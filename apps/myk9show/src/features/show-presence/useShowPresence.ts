/**
 * useShowPresence — Phase 1 of docs/plan-show-presence.md.
 *
 * Joins the show-scoped Supabase Realtime presence channel and returns the
 * deduped list of who is currently "here". Built on the existing
 * `setupOptimizedPresence` primitive (utils/realtimeOptimization) — we do NOT
 * stand up a parallel real-time engine (the PR #576 mistake). Presence is
 * ephemeral; nothing here touches the replication layer or the database.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/supabaseClient';
import { eventEmitter } from '@/services/sync/eventEmitter';
import { setupOptimizedPresence } from '@/utils/realtimeOptimization';
import { useAuthContext } from '@/hooks/useAuthContext';
import { features } from '@/config/features';
import type { PresenceActivity, ShowPresence } from './types';

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
}

export function useShowPresence(showId: string | undefined): UseShowPresenceResult {
  const { user, firstName, getUserRoles } = useAuthContext();
  const location = useLocation();
  const [present, setPresent] = useState<ShowPresence[]>([]);

  const userId = user?.id;
  const email = user?.email;

  // Single mutable presence payload. setupOptimizedPresence's heartbeat captures
  // this reference, so mutating it in place re-tracks the latest activity on the
  // next beat without tearing down the channel. Refs are only written in effects.
  const infoRef = useRef<ShowPresence | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Keep the presence payload current with identity + route, and push the change
  // immediately so others see the move without waiting for the next heartbeat.
  useEffect(() => {
    if (!userId) {
      infoRef.current = null;
      return;
    }
    const next: ShowPresence = {
      userId,
      name: firstName ?? email?.split('@')[0] ?? 'Someone',
      role: getUserRoles()[0] ?? 'exhibitor',
      location: { page: location.pathname, ...(entityForPath(location.pathname) ?? {}) },
      activity: activityForPath(location.pathname),
      ts: Date.now(),
    };
    if (infoRef.current) {
      Object.assign(infoRef.current, next);
    } else {
      infoRef.current = next;
    }
    channelRef.current?.track(infoRef.current);
  }, [userId, email, firstName, getUserRoles, location.pathname]);

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

    const onSync = (payload: unknown) => {
      const evt = payload as PresenceSyncEvent;
      if (evt.channel !== name) return;
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

  return { present };
}
