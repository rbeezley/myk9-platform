import { describe, expect, it, vi } from 'vitest';

import {
  handleOperatorSupportRequest,
  OperatorSupportError,
  type OperatorSupportAudit,
} from './operatorSupport.ts';
import { createOperatorSupportAudit } from './operatorSupportAudit.ts';

function makeCallerClient(isSiteAdmin: boolean, error: { message: string } | null = null) {
  return {
    rpc: vi.fn(async () => ({ data: isSiteAdmin, error })),
    from: vi.fn(),
  };
}

function makeAudit(overrides: Partial<OperatorSupportAudit> = {}): OperatorSupportAudit {
  return {
    finish: vi.fn(async () => undefined),
    ...overrides,
  };
}

function allowReservation() {
  return vi.fn(async () => ({
    status: 'allowed' as const,
    logId: 'log-1',
    remaining: 19,
    limit: 20,
    resetsAt: '2026-07-25T00:00:00.000Z',
  }));
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
    const reserveQuery = allowReservation();
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Summarize alerts' },
        user: null,
        callerClient,
        audit,
        reserveQuery,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(401, 'Unauthorized'));

    expect(callerClient.rpc).not.toHaveBeenCalled();
    expect(reserveQuery).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('rejects a non-admin even when the client forges operator mode fields', async () => {
    const callerClient = makeCallerClient(false);
    const audit = makeAudit();
    const reserveQuery = allowReservation();
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
        reserveQuery,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(403, 'Operator Support requires site admin access'));

    expect(callerClient.rpc).toHaveBeenCalledWith('is_site_admin');
    expect(reserveQuery).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('fails closed before model or tool execution when quota reservation fails', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit();
    const reserveQuery = vi.fn(async () => ({ status: 'unavailable' as const }));
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Summarize alerts' },
        user: { id: 'admin-1' },
        callerClient,
        audit,
        reserveQuery,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(503, 'Operator Support rate limit unavailable'));

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
      reserveQuery: allowReservation(),
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
        reserveQuery: allowReservation(),
        callModel,
        executeTool,
      })
    ).rejects.toEqual(
      new OperatorSupportError(502, 'Model requested an unavailable operator tool')
    );

    expect(executeTool).not.toHaveBeenCalled();
  });

  it('rejects a non-object JSON body with a controlled 400 response', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit();
    const reserveQuery = allowReservation();
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: null,
        user: { id: 'admin-1' },
        callerClient,
        audit,
        reserveQuery,
        callModel,
        executeTool,
      })
    ).rejects.toEqual(new OperatorSupportError(400, 'Invalid request body'));

    expect(reserveQuery).not.toHaveBeenCalled();
    expect(callModel).not.toHaveBeenCalled();
  });

  it('fails closed at the daily limit before audit, model, or tool execution', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit();
    const reserveQuery = vi.fn(async () => ({
      status: 'limited' as const,
      remaining: 0,
      limit: 20,
      resetsAt: '2026-07-25T00:00:00.000Z',
    }));
    const callModel = vi.fn();
    const executeTool = vi.fn();

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Summarize alerts' },
        user: { id: 'admin-1' },
        callerClient,
        audit,
        reserveQuery,
        callModel,
        executeTool,
      })
    ).rejects.toMatchObject({
      status: 429,
      message: 'Daily limit reached',
      details: {
        remaining: 0,
        limit: 20,
        resetsAt: '2026-07-25T00:00:00.000Z',
      },
    });

    expect(callModel).not.toHaveBeenCalled();
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('records tools that ran when a later model call fails', async () => {
    const callerClient = makeCallerClient(true);
    const audit = makeAudit();
    const modelError = new Error('model unavailable');
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
      .mockRejectedValueOnce(modelError);
    const executeTool = vi.fn(async () => ({ result: { unresolvedCountInWindow: 0 } }));

    await expect(
      handleOperatorSupportRequest({
        body: { message: 'Summarize alerts' },
        user: { id: 'admin-1' },
        callerClient,
        audit,
        reserveQuery: allowReservation(),
        callModel,
        executeTool,
      })
    ).rejects.toBe(modelError);

    expect(audit.finish).toHaveBeenCalledWith(
      'log-1',
      ['summarize_operator_alerts'],
      expect.any(Number)
    );
  });
});

describe('Operator Support audit completion', () => {
  it('updates only the reserved audit row with bounded metadata', async () => {
    const query = {
      update: vi.fn(() => query),
      eq: vi.fn(async () => ({ error: null })),
    };
    const client = { from: vi.fn(() => query) };
    const audit = createOperatorSupportAudit(client);

    await expect(
      audit.finish('log-1', ['summarize_operator_alerts', 'summarize_operator_alerts'], 123)
    ).resolves.toBeUndefined();

    expect(query.update).toHaveBeenCalledWith({
      tools_used: ['summarize_operator_alerts'],
      response_time_ms: 123,
    });
    expect(query.eq).toHaveBeenCalledWith('id', 'log-1');
  });
});
