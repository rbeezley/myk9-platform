import type { PendingMutation } from './types';

/**
 * Lays the fields an acknowledged mutation wrote over a row's merge base
 * (MYK9-1220).
 *
 * A row keeps `baseData`, the last state it is known to share with the server,
 * for as long as it is dirty. When a device saves twice before the next pull
 * (A, then B), A's acknowledgement leaves the row dirty for B. A later pull
 * returns the server row at A's version, which is A's own write. Against the
 * ORIGINAL base that reads as a third party changing the fields A wrote, and the
 * judge is told "This record was changed elsewhere". Moving the base forward to
 * "original base plus what A wrote" makes the pull of A read as no change, while
 * a third-party write still differs from that base and still surfaces.
 *
 * The queued payload speaks the server's column names, the row speaks local
 * names, and only the table knows the map between them. The table supplies its
 * two existing mappers: `toRemoteRow` (local row to server columns) and
 * `toLocalRow` (server columns to local row). The base goes out through the
 * first, the written columns are laid over it, and it comes back through the
 * second. Only the local fields that this changes are taken, so a field the
 * payload does not reach (enrichment, server-owned columns the remote shape
 * omits) keeps its base value rather than a mapper default.
 */
export interface WrittenFieldMapper<TLocal> {
  toLocalRow(remote: never): TLocal;
  toRemoteRow(local: TLocal): Record<string, unknown>;
}

/** Applies a mutation's written columns to a base row; undefined means "cannot map". */
export type WrittenFieldOverlay = (
  base: unknown,
  written: Record<string, unknown>
) => unknown | undefined;

/**
 * The server columns an acknowledged UPDATE changed, or undefined when they
 * cannot be named: an INSERT/DELETE, or an RPC whose arguments are baked and
 * so say nothing about which columns they write.
 */
export function writtenColumnsOf(mutation: PendingMutation): Record<string, unknown> | undefined {
  if (mutation.operation !== 'UPDATE') return undefined;
  if (mutation.rpc) {
    // The RPC writes only `fields`; `data` is the whole row it was built from.
    if (mutation.rpc.args !== undefined || mutation.rpc.fields === undefined) return undefined;
    return mutation.rpc.fields;
  }
  return mutation.data;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function createWrittenFieldOverlay<TLocal extends { id: string }>(
  mapper: WrittenFieldMapper<TLocal>
): WrittenFieldOverlay {
  return (baseInput, written) => {
    const base = baseInput as TLocal;
    try {
      const baseRemote = mapper.toRemoteRow(base);
      const before = mapper.toLocalRow(baseRemote as never) as Record<string, unknown>;
      const after = mapper.toLocalRow({ ...baseRemote, ...written } as never) as Record<
        string,
        unknown
      >;
      const next: Record<string, unknown> = { ...(base as Record<string, unknown>) };
      for (const key of Object.keys(after)) {
        if (!sameValue(before[key], after[key])) next[key] = after[key];
      }
      return next as TLocal;
    } catch {
      return undefined;
    }
  };
}

/** Per-table overlays, registered by each table from `setMutationManager`. */
export class WrittenFieldOverlayRegistry {
  private readonly overlays = new Map<string, WrittenFieldOverlay>();

  /** @returns an unregister function that removes only this overlay. */
  register(tableName: string, overlay: WrittenFieldOverlay): () => void {
    this.overlays.set(tableName, overlay);
    return () => {
      if (this.overlays.get(tableName) === overlay) this.overlays.delete(tableName);
    };
  }

  get(tableName: string): WrittenFieldOverlay | undefined {
    return this.overlays.get(tableName);
  }

  private readonly serverTimeTables = new Set<string>();

  /**
   * Opt a table in to reading `updated_at` back with its acknowledged INSERT/UPDATE and
   * storing it on the row as `serverUpdatedAt`. Off by default: a table may lack the column,
   * or restrict it by column grant, and a select of an ungranted column fails the request.
   * @returns an unregister function.
   */
  registerServerTime(tableName: string): () => void {
    this.serverTimeTables.add(tableName);
    return () => void this.serverTimeTables.delete(tableName);
  }

  readsServerTime(tableName: string): boolean {
    return this.serverTimeTables.has(tableName);
  }
}
