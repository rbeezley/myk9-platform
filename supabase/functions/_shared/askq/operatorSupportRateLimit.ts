export const OPERATOR_SUPPORT_DAILY_LIMIT = 20;

export type OperatorSupportRateLimitResult =
  | {
      status: 'allowed';
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

interface RateLimitQuery {
  select(
    columns: string,
    options: { count: 'exact'; head: true }
  ): RateLimitQuery;
  eq(column: string, value: string): RateLimitQuery;
  gte(
    column: string,
    value: string
  ): PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>;
}

export interface OperatorSupportRateLimitClient {
  from(table: string): RateLimitQuery;
}

export type CheckOperatorSupportRateLimit = (
  userId: string
) => Promise<OperatorSupportRateLimitResult>;

export function createOperatorSupportRateLimiter(
  client: OperatorSupportRateLimitClient,
  now: () => Date = () => new Date()
): CheckOperatorSupportRateLimit {
  return async userId => {
    const currentTime = now();
    const dayStart = new Date(currentTime);
    dayStart.setUTCHours(0, 0, 0, 0);
    const resetsAt = new Date(dayStart);
    resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);

    const { count, error } = await client
      .from('chatbot_query_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('app_source', 'operator-support')
      .gte('created_at', dayStart.toISOString());

    if (error) {
      return { status: 'unavailable' };
    }

    const used = count ?? 0;
    if (used >= OPERATOR_SUPPORT_DAILY_LIMIT) {
      return {
        status: 'limited',
        remaining: 0,
        limit: OPERATOR_SUPPORT_DAILY_LIMIT,
        resetsAt: resetsAt.toISOString(),
      };
    }

    return {
      status: 'allowed',
      remaining: OPERATOR_SUPPORT_DAILY_LIMIT - used - 1,
      limit: OPERATOR_SUPPORT_DAILY_LIMIT,
      resetsAt: resetsAt.toISOString(),
    };
  };
}
