/**
 * Merge a server read of registrations with this device's unsent work
 * (MYK9-1090 plan §2, MYK9-1129 item 5). The rule both server-first readers
 * share, so the dog page and the dog reads agree:
 *
 * - an unsent add WINS over the server row with the same id: until it
 *   uploads, the device's value is the newest one the user saw (an add whose
 *   acknowledgement was lost is on the server already, Codex round 3);
 * - a row waiting on its delete hides the server row it deletes;
 * - a queued add shows unless the read already holds it, including a re-add
 *   of a registration whose old row is being deleted (new id, same number);
 * - a placeholder shows until its server copy is in the read
 *   (`resolvedPlaceholderIds`), and a copy being deleted still counts, so a
 *   deleted registration's placeholder never stands in for it.
 *
 * Callers append the result with `appendRegistrations`, which keeps the first
 * row per id and per organization and number.
 */
import {
  indexServerTwins,
  isPlaceholder,
  registrationToDbRow,
  resolvedPlaceholderIds,
  twinFieldsOfDbRow,
  type ReplicatedDogRegistration,
} from './dogRegistrationRows';

export function mergeUnsentWork(
  serverRows: readonly Record<string, unknown>[] | null | undefined,
  unsent: readonly ReplicatedDogRegistration[]
): Record<string, unknown>[] {
  const server = serverRows ?? [];
  const deleting = unsent.filter(row => row._pendingDelete === true);
  const deletedIds = new Set(deleting.map(row => row.id));
  const live = unsent.filter(row => row._pendingDelete !== true);
  const edits = new Map(
    live.filter(row => !isPlaceholder(row)).map(row => [row.id, registrationToDbRow(row)])
  );
  const serverIds = new Set(server.map(row => String(row.id)));

  const placeholders = live.filter(isPlaceholder);
  const twins = indexServerTwins([...server.map(twinFieldsOfDbRow), ...deleting]);
  const resolved = resolvedPlaceholderIds(placeholders, twins);

  return [
    ...server
      .filter(row => !deletedIds.has(String(row.id)))
      .map(row => edits.get(String(row.id)) ?? row),
    ...[...edits.values()].filter(row => !serverIds.has(row.id)),
    ...placeholders.filter(row => !resolved.has(row.id)).map(registrationToDbRow),
  ];
}
