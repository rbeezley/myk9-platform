import { vi } from 'vitest';

interface QueueDescription {
  operation: string;
  payload: Record<string, unknown>;
  dependsOn?: string[] | undefined;
  rpc?: unknown;
}

interface SetDescription {
  expectedVersion?: number | undefined;
  options?: unknown;
}

type WriteAndQueue = (
  id: string,
  data: unknown,
  queue: QueueDescription,
  setOptions?: SetDescription
) => Promise<{ mutationId: string | null; result: unknown }>;

/** Drop trailing undefineds so an assertion lists only the arguments a caller really passed. */
function withoutTrailingUndefined(args: unknown[]): unknown[] {
  const trimmed = [...args];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === undefined) trimmed.pop();
  return trimmed;
}

/** The recorders of each live spy, so a second call in one test shares the first's. */
const recorders = new WeakMap<
  object,
  { queue: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
>();

/**
 * Watch a table's atomic dirty-write-and-queue step (MYK9-1471) through the
 * two calls it replaced, so a test names what it writes and what it queues:
 *
 * - `queue(operation, rowId, payload, dependsOn?, rpc?)` stands in for the old
 *   `queueMutation` spy; `mockResolvedValue('id')` sets the returned mutation id
 *   and `mockRejectedValue(...)` fails the write before the row is touched.
 * - `set(rowId, data, true, expectedVersion?, undefined?, options?)` records the
 *   dirty row write.
 *
 * By default the row is really written (through the table's own writeAndQueue,
 * which queues nothing without a MutationManager). Pass `{ writeRow: false }`
 * to skip the row write for a test that only inspects what was asked for.
 */
export function spyOnWriteAndQueue(table: object, { writeRow = true } = {}) {
  const host = table as unknown as { writeAndQueue: WriteAndQueue };
  const existing = recorders.get(host.writeAndQueue);
  if (existing) return existing;
  const queue = vi.fn<(...args: unknown[]) => Promise<string | null | undefined | void>>();
  const set = vi.fn<(...args: unknown[]) => void>();
  const real = host.writeAndQueue.bind(table);
  const spy = vi
    .spyOn(host, 'writeAndQueue')
    .mockImplementation(async (id, data, q, setOptions) => {
      const queued = await queue(
        ...withoutTrailingUndefined([q.operation, id, q.payload, q.dependsOn, q.rpc])
      );
      set(
        ...withoutTrailingUndefined([
          id,
          data,
          true,
          setOptions?.expectedVersion,
          undefined,
          setOptions?.options,
        ])
      );
      if (!writeRow) return { mutationId: queued ?? null, result: { written: true } };
      const out = await real(id, data, q, setOptions);
      return { ...out, mutationId: queued ?? out.mutationId };
    });
  const created = { queue, set };
  recorders.set(spy, created);
  return created;
}
