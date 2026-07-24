export const OPERATOR_QUERY_REDACTION = '[operator support query redacted]';

interface AuditQuery {
  insert(row: Record<string, unknown>): AuditQuery;
  select(columns: string): AuditQuery;
  single(): PromiseLike<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>;
  update(row: Record<string, unknown>): AuditQuery;
  eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
}

export interface OperatorSupportAuditClient {
  from(table: string): AuditQuery;
}

export interface OperatorSupportAuditWriter {
  start(userId: string): Promise<string | null>;
  finish(logId: string, toolsUsed: string[], responseTimeMs: number): Promise<void>;
}

export function createOperatorSupportAudit(
  auditClient: OperatorSupportAuditClient
): OperatorSupportAuditWriter {
  return {
    async start(userId) {
      const { data, error } = await auditClient
        .from('chatbot_query_log')
        .insert({
          query: OPERATOR_QUERY_REDACTION,
          tools_used: [],
          user_id: userId,
          app_source: 'operator-support',
          response_time_ms: 0,
        })
        .select('id')
        .single();

      return error ? null : (data?.id ?? null);
    },

    async finish(logId, toolsUsed, responseTimeMs) {
      const { error } = await auditClient
        .from('chatbot_query_log')
        .update({
          tools_used: [...new Set(toolsUsed)],
          response_time_ms: responseTimeMs,
        })
        .eq('id', logId);

      if (error) {
        throw new Error('Unable to complete Operator Support audit record');
      }
    },
  };
}
