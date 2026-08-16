/**
 * runProximity — server-side mirror of the shared run-queue rules so a push
 * sent while the PWA is closed states the SAME number the entry-list pill shows
 * when it reopens.
 *
 * The canonical rules live in packages/ringside/src/pages/EntryList/runQueue.ts
 * and are re-derived here because Deno edge functions cannot import from
 * workspace packages. Keep the two in sync — the invariants are:
 *
 *   INTENT (user decision 2026-06-11): the in-ring dog is NOT part of the
 *   waiting queue, so "You're next" (dogsAhead 0) shows while a dog is still
 *   running. Scored and pulled entries are out of the queue entirely.
 *   Ordering is `run_order || armband` — a falsy run_order falls back to the
 *   armband, matching compareByRunOrder's `(a.exhibitorOrder || a.armband)`.
 */

export interface ProximityEntryRow {
  id: string;
  dog_id: string;
  armband: number | null;
  run_order: number | null;
  is_scored: boolean | null;
  check_in_status: string | null;
}

export interface PendingEntry {
  entryId: string;
  dogId: string;
  armband: number | null;
  /** Index in the waiting queue: 0 = next to run. */
  dogsAhead: number;
}

export function isInRing(entry: ProximityEntryRow): boolean {
  return entry.check_in_status === 'in-ring';
}

/** Still due to run: unscored and not pulled. */
export function isInQueue(entry: ProximityEntryRow): boolean {
  return !entry.is_scored && entry.check_in_status !== 'pulled';
}

function sortKey(entry: ProximityEntryRow): number {
  // Mirrors `(a.exhibitorOrder || a.armband)` — 0 and null both fall through.
  return entry.run_order || entry.armband || 0;
}

/**
 * Every entry still waiting to run, in run order, each with its dogs-ahead
 * count. In-ring, scored and pulled entries are excluded. Does not mutate.
 */
export function pendingByRunOrder(entries: readonly ProximityEntryRow[]): PendingEntry[] {
  return entries
    .filter(entry => isInQueue(entry) && !isInRing(entry))
    .slice()
    .sort((a, b) => sortKey(a) - sortKey(b))
    .map((entry, index) => ({
      entryId: entry.id,
      dogId: entry.dog_id,
      armband: entry.armband,
      dogsAhead: index,
    }));
}

/**
 * Message text for a proximity push. Mirrors buildYourTurnPayload in
 * packages/notifications so the wording is identical on both paths.
 */
export function buildProximityPayload(input: {
  dogName: string;
  className: string;
  dogsAhead: number;
  armband: number | null;
  ringNumber?: number | null;
}): {
  type: 'your_turn';
  title: string;
  body: string;
  priority: 'urgent';
  data: Record<string, unknown>;
} {
  const isNext = input.dogsAhead <= 0;
  const ringSuffix = input.ringNumber ? ` (Ring ${input.ringNumber})` : '';

  return {
    type: 'your_turn',
    title: isNext
      ? `${input.dogName} — You're up!`
      : `${input.dogName} — ${input.dogsAhead} dogs away`,
    body: isNext
      ? `Your turn in ${input.className}${ringSuffix}`
      : `${input.dogsAhead} dogs ahead in ${input.className}${ringSuffix}`,
    priority: 'urgent',
    data: {
      dogName: input.dogName,
      className: input.className,
      dogsAhead: input.dogsAhead,
      armband: input.armband,
      ringNumber: input.ringNumber ?? null,
    },
  };
}

export interface ProximityRecipient {
  authUserId: string;
  entryId: string;
  dogsAhead: number;
}

export interface WatcherRow {
  /** auth.users id to push to. */
  authUserId: string;
  /** Dogs this account owns / handles. */
  dogIds: ReadonlySet<string>;
  /** Armbands this account favorited at this show. */
  favoriteArmbands: ReadonlySet<number>;
  /** Per-user threshold from notification_preferences.lead_dogs. */
  leadDogs: number;
}

/**
 * Resolve who to push, honouring each watcher's OWN lead-dogs threshold — the
 * client monitor applied one global value because it only ever ran for one
 * account; server-side, thresholds differ per user.
 *
 * One notification per (user, entry): a dog that is both owned and favorited
 * does not double up.
 */
export function resolveRecipients(
  pending: readonly PendingEntry[],
  watchers: readonly WatcherRow[]
): ProximityRecipient[] {
  const recipients: ProximityRecipient[] = [];

  for (const watcher of watchers) {
    const seen = new Set<string>();
    for (const entry of pending) {
      if (entry.dogsAhead >= watcher.leadDogs) break; // pending is ordered
      if (seen.has(entry.entryId)) continue;

      const watched =
        watcher.dogIds.has(entry.dogId) ||
        (entry.armband !== null && watcher.favoriteArmbands.has(entry.armband));
      if (!watched) continue;

      seen.add(entry.entryId);
      recipients.push({
        authUserId: watcher.authUserId,
        entryId: entry.entryId,
        dogsAhead: entry.dogsAhead,
      });
    }
  }

  return recipients;
}
