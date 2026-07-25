interface AuditQuery {
  update(row: Record<string, unknown>): AuditQuery;
  eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }>;
}

export interface OperatorSupportAuditClient {
  from(table: string): AuditQuery;
}

export interface OperatorSupportAuditWriter {
  finish(logId: string, toolsUsed: string[], responseTimeMs: number): Promise<void>;
}

export function createOperatorSupportAudit(
  auditClient: OperatorSupportAuditClient
): OperatorSupportAuditWriter {
  return {
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
