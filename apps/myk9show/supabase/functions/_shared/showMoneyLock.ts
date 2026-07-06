export interface ShowMoneyLockClient {
  from(table: 'show_money_locks'): {
    insert(values: Record<string, unknown>): {
      select(columns: string): { single(): Promise<{ error: DbError | null }> };
    };
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: unknown
      ): {
        lt(
          column: string,
          value: unknown
        ): {
          select(columns: string): Promise<{ data: unknown[] | null; error: DbError | null }>;
        };
      };
    };
    delete(): {
      eq(
        column: string,
        value: unknown
      ): {
        eq(column: string, value: unknown): Promise<{ error: DbError | null }>;
      };
    };
  };
}

export interface DbError {
  code?: string;
  message?: string;
}

export type ShowMoneyLock =
  | { ok: true; lockId: string; release: () => Promise<void> }
  | { ok: false; reason: 'locked' | 'error'; message?: string };

interface AcquireOptions {
  holder: string;
  ttlMs?: number;
}

const UNIQUE_VIOLATION = '23505';
const DEFAULT_TTL_MS = 10 * 60 * 1000;

export async function acquireShowMoneyLock(
  supabase: ShowMoneyLockClient,
  showId: string,
  options: AcquireOptions
): Promise<ShowMoneyLock> {
  const lockId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + (options.ttlMs ?? DEFAULT_TTL_MS)).toISOString();
  const row = {
    show_id: showId,
    lock_id: lockId,
    holder: options.holder,
    expires_at: expiresAt,
  };

  const inserted = await supabase.from('show_money_locks').insert(row).select('lock_id').single();

  if (!inserted.error) {
    return buildLock(supabase, showId, lockId);
  }
  if (inserted.error.code !== UNIQUE_VIOLATION) {
    return { ok: false, reason: 'error', message: inserted.error.message };
  }

  const stolen = await supabase
    .from('show_money_locks')
    .update(row)
    .eq('show_id', showId)
    .lt('expires_at', nowIso)
    .select('lock_id');

  if (stolen.error) {
    return { ok: false, reason: 'error', message: stolen.error.message };
  }
  if (!stolen.data || stolen.data.length === 0) {
    return { ok: false, reason: 'locked' };
  }

  return buildLock(supabase, showId, lockId);
}

function buildLock(
  supabase: ShowMoneyLockClient,
  showId: string,
  lockId: string
): Extract<ShowMoneyLock, { ok: true }> {
  return {
    ok: true,
    lockId,
    release: async () => {
      await supabase.from('show_money_locks').delete().eq('show_id', showId).eq('lock_id', lockId);
    },
  };
}
