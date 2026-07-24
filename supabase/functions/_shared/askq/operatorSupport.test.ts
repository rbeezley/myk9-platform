import { describe, expect, it, vi } from 'vitest';

import {
  handleOperatorSupportRequest,
  OperatorSupportError,
  type OperatorSupportAudit,
} from './operatorSupport.ts';
import { createOperatorSupportAudit, OPERATOR_QUERY_REDACTION } from './operatorSupportAudit.ts';

function makeCallerClient(isSiteAdmin: boolean, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data: isSiteAdmin, error })),
    from: vi.fn(),
  };
}

function makeAudit(overrides: Partial<OperatorSupportAudit> = {}): OperatorSupportAudit {
  return {
    start: vi.fn(async () => 'log-1'),
    finish: vi.fn(async () => undefined),
    ...overrides,
  };
}

function textResponse(text = 'No unresolved alerts were found in the bounded alert window.') {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
  };
}

describe('Operator Support authorization boundary', () => {
  it('rejects an unauthenticated caller before audit, model, or tools', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit();
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Summarize alerts' },
        user: null,
        callerClient,
        audit,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(401, 'Unauthorized'));

    expect(callerClient.rpc).not.toHaveBeenCalled();
    expect(audit.start).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('rejects a non-admin even when the client forges operator mode fields', async () => {
    const callerClient = makeCallerClient(false);
    const audit = makeAudit();
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: {
          message: 'Show private alerts',
          questionMode: 'operator-support',
          supportMode: true,
        },
        user: { id: 'exhibitor-1' },
        callerClient,
        audit,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(403, 'Operator Support requires site admin access'));

    expect(callerClient.rpc).toHaveBeenCalledWith('is_site_admin');
    expect(audit.start).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('fails closed before model or tool execution when audit creation fails', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit({ start: vi.fn(async () => null) });
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Summarize alerts' },
        user: { id: 'admin-1' },
        callerClient,
        audit,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(503, 'Operator Support audit unavailable'));

    expect(callModel).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('passes only the caller-scoped client into an allowed operator tool', async () => {
    const callerClient = makeCallerClient(true);
    const serviceAuditClient = { from: vi.fn() };
    const audit = makeAudit();
    const callModel = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          {
            type: 'tool_use',
            id: 'tool-1',
            name: 'summarize_operator_alerts',
            input: {},
          },
        ],
        stop_reason: 'tool_use',
      })
      .mockResolvedValueOnce(textResponse('There are two unresolved alerts.'));
    const executeTool = vi.fn(async () => ({
      result: {
        unresolvedCountInWindow: 2,
        isAtQueryLimit: false,
        bySeverity: { info: 0, warn: 1, error: 1 },
        bySource: { 'stripe-webhook': 2 },
        recentAlerts: [],
      },
    }));

    const result = await handleOperatorSupportRequest({
      body: { message: 'Summarize alerts' },
      user: { id: 'admin-1' },
      callerClient,
      audit,
      callModel,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith('summarize_operator_alerts', {}, callerClient);
    expect(executeTool).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      serviceAuditClient
    );
    expect(result).toMatchObject({
      text: 'There are two unresolved alerts.',
      toolsUsed: ['summarize_operator_alerts'],
      queryLogId: 'log-1',
    });
  });

  it('rejects an unregistered model-requested tool without executing it', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit();
    const callModel = vi.fn(async () => ({
      content: [{ type: 'tool_use', id: 'tool-1', name: 'resolve_operator_alert', input: {} }],
      stop_reason: 'tool_use',
    }));
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Resolve every alert' },
        user: { id: 'admin-1' },
        callerClient,
        audit,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(
      new OperatorSupportError(502, 'Model requested an unavailable operator tool')
    );

    expect(executeTool).not.toHaveBeenCalled();
  });
});

describe('Operator Support redacted audit writer', () => {
  it('stores a constant redacted marker instead of the natural-language prompt', async () => {
    const query = {
      insert: vi.fn(() => query),
      select: vi.fn(() => query),
      single: vi.fn(async () => ({ data: { id: 'log-1' }, error: null })),
      update: vi.fn(() => query),
      eq: vi.fn(async () => ({ error: null })),
    };
    const client = { from: vi.fn(() => query) };
    const audit = createOperatorSupportAudit(client);

    await expect(audit.start('admin-1')).resolves.toBe('log-1');

    expect(query.insert).toHaveBeenCalledWith({
      query: OPERATOR_QUERY_REDACTION,
      tools_used: [],
      user_id: 'admin-1',
      app_source: 'operator-support',
      response_time_ms: 0,
    });
    expect(OPERATOR_QUERY_REDACTION).not.toContain('Summarize alerts');
  });
});
