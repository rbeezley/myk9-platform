export type AskQReservation =
  | {
      status: 'allowed';
      logId: string;
      remaining: number;
      limit: number;
      resetsAt: string;
    }
  | {
      status: 'limited';
      remaining: 0;
      limit: number;
      resetsAt: string;
    }
  | {
      status: 'unavailable';
    };

interface ReservationRpcResult {
  data: unknown;
  error: { message: string } | null;
}

export interface AskQReservationClient {
  rpc(name: 'reserve_askq_query', args: { p_query: string }): PromiseLike<ReservationRpcResult>;
}

export type ReserveAskQQuery = (query: string) => Promise<AskQReservation>;

export async function reserveAskQQuery(
  client: AskQReservationClient,
  query: string
): Promise<AskQReservation> {
  const { data, error } = await client.rpc('reserve_askq_query', { p_query: query });
  if (error || !Array.isArray(data) || data.length !== 1) {
    return { status: 'unavailable' };
  }

  const row = data[0];
  if (!isRecord(row)) {
    return { status: 'unavailable' };
  }

  const limit = readPositiveInteger(row.daily_limit);
  const remaining = readNonNegativeInteger(row.remaining);
  const resetsAt = typeof row.resets_at === 'string' ? row.resets_at : null;
  if (limit === null || remaining === null || !resetsAt) {
    return { status: 'unavailable' };
  }

  if (row.allowed === false && row.log_id === null && remaining === 0) {
    return { status: 'limited', remaining, limit, resetsAt };
  }
  if (row.allowed !== true || typeof row.log_id !== 'string' || !row.log_id) {
    return { status: 'unavailable' };
  }

  return {
    status: 'allowed',
    logId: row.log_id,
    remaining,
    limit,
    resetsAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readPositiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}
