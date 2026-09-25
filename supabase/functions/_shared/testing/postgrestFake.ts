/**
 * Test-only PostgREST stand-in for recipient queries (MYK9-726).
 *
 * It answers a query built with the supabase-js chain (`from().select()` plus
 * any filters) with the rows given for that table, EXCEPT that it rejects an
 * ambiguous embed the way PostgREST does: an embed of a relation that the
 * table reaches through more than one foreign key, written without an FK hint,
 * fails the whole request with PGRST201. `!inner` and `!left` are join
 * modifiers, not hints.
 */

/** Tables whose embed of the named relation has more than one foreign key. */
const AMBIGUOUS_EMBEDS: Record<string, readonly string[]> = {
  // user_roles.user_id and user_roles.granted_by both reference people.id.
  user_roles: ['people'],
};

const JOIN_MODIFIERS = new Set(['inner', 'left']);

export interface PostgrestFakeError {
  code: string;
  message: string;
}

export interface PostgrestFakeResult {
  data: unknown;
  error: PostgrestFakeError | null;
}

/** The relation named in an unhinted embed, or null when every embed is unambiguous. */
export function findAmbiguousEmbed(table: string, select: string): string | null {
  for (const relation of AMBIGUOUS_EMBEDS[table] ?? []) {
    const embed = new RegExp(`(?:^|[\\s,(])(?:\\w+:)?${relation}((?:!\\w+)*)\\(`, 'g');
    for (const match of select.matchAll(embed)) {
      const hints = match[1].split('!').filter(part => part && !JOIN_MODIFIERS.has(part));
      if (hints.length === 0) return relation;
    }
  }
  return null;
}

export interface PostgrestFake {
  from(table: string): unknown;
  /** Every `select` string the code under test sent, per table. */
  selects: Array<{ table: string; select: string }>;
}

export function createPostgrestFake(rowsByTable: Record<string, unknown[]>): PostgrestFake {
  const selects: PostgrestFake['selects'] = [];

  function resolve(table: string, select: string, single: boolean): PostgrestFakeResult {
    const ambiguous = findAmbiguousEmbed(table, select);
    if (ambiguous) {
      return {
        data: null,
        error: {
          code: 'PGRST201',
          message: `Could not embed because more than one relationship was found for '${table}' and '${ambiguous}'`,
        },
      };
    }
    const rows = rowsByTable[table] ?? [];
    return { data: single ? (rows[0] ?? null) : rows, error: null };
  }

  return {
    selects,
    from(table: string) {
      let select = '*';
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const method of ['eq', 'neq', 'in', 'is', 'not', 'or', 'order', 'limit', 'filter']) {
        builder[method] = chain;
      }
      builder.select = (columns: string) => {
        select = columns;
        selects.push({ table, select: columns });
        return builder;
      };
      builder.single = () => Promise.resolve(resolve(table, select, true));
      builder.maybeSingle = () => Promise.resolve(resolve(table, select, true));
      builder.then = (
        onFulfilled: (value: PostgrestFakeResult) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(resolve(table, select, false)).then(onFulfilled, onRejected);
      return builder;
    },
  };
}
