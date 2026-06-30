import { describe, expect, it } from 'vitest';

import type { AdminMcpConfig } from '../config';
import { createDiagnosticResult } from '../diagnostics/types';
import type {
  AdminToolDefinition,
  AllowedToolName,
  ToolCallLog,
} from '../mcp/server';
import { createToolDispatcher } from '../mcp/server';

const CONFIG: AdminMcpConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabaseServiceRoleKey: 'service-role-key',
  appBaseUrl: 'https://app.myk9show.com',
  envLabel: 'staging',
  defaultLimit: 25,
  maxLimit: 50,
};

function tool(overrides: Partial<AdminToolDefinition>): AdminToolDefinition {
  return {
    name: 'list_show_access',
    description: 'fake tool',
    inputSchema: { type: 'object' },
    parseInput: (raw) => raw,
    handle: async () => createDiagnosticResult(CONFIG.envLabel, 'found'),
    ...overrides,
  };
}

function parseBody(text: string) {
  return JSON.parse(text) as { state: string; envLabel: string; limitations: string[] };
}

describe('createToolDispatcher', () => {
  it('lists only registered, allowlisted tools', () => {
    const dispatcher = createToolDispatcher({
      config: CONFIG,
      tools: [
        tool({ name: 'list_show_access' }),
        // Not in ALLOWED_TOOL_NAMES — must be dropped.
        tool({ name: 'evil_tool' as AllowedToolName }),
      ],
    });

    const names = dispatcher.listTools().map((t) => t.name);
    expect(names).toEqual(['list_show_access']);
  });

  it('returns the handler result with the env label stamped', async () => {
    const dispatcher = createToolDispatcher({
      config: CONFIG,
      tools: [
        tool({
          handle: async () =>
            createDiagnosticResult(CONFIG.envLabel, 'found', {
              summary: { ok: true },
            }),
        }),
      ],
    });

    const result = await dispatcher.callTool('list_show_access', {});
    const body = parseBody(result.content[0]?.text ?? '');
    expect(body.state).toBe('found');
    expect(body.envLabel).toBe('staging');
    expect(result.isError).toBe(false);
  });

  it('returns an error state for an unknown tool', async () => {
    const dispatcher = createToolDispatcher({ config: CONFIG, tools: [] });
    const result = await dispatcher.callTool('list_show_access', {});
    expect(parseBody(result.content[0]?.text ?? '').state).toBe('error');
    expect(result.isError).toBe(true);
  });

  it('maps invalid input to an error state without leaking the throw', async () => {
    const dispatcher = createToolDispatcher({
      config: CONFIG,
      tools: [
        tool({
          parseInput: () => {
            throw new Error('zod: invalid');
          },
        }),
      ],
    });

    const body = parseBody(
      (await dispatcher.callTool('list_show_access', {})).content[0]?.text ?? '',
    );
    expect(body.state).toBe('error');
    expect(body.limitations.join(' ')).not.toContain('zod: invalid');
  });

  it('maps a PostgREST-shaped throw to source_unavailable', async () => {
    const dispatcher = createToolDispatcher({
      config: CONFIG,
      tools: [
        tool({
          handle: async () => {
            throw { code: 'PGRST116', message: 'no rows' };
          },
        }),
      ],
    });

    const result = await dispatcher.callTool('list_show_access', {});
    const body = parseBody(result.content[0]?.text ?? '');
    expect(body.state).toBe('source_unavailable');
    // source_unavailable is a structured outcome, not a hard tool error.
    expect(result.isError).toBe(false);
  });

  it('logs tool, env, state, and elapsed time for each call', async () => {
    const logs: ToolCallLog[] = [];
    let clock = 1000;
    const dispatcher = createToolDispatcher({
      config: CONFIG,
      tools: [tool({})],
      log: (entry) => logs.push(entry),
      now: () => clock,
    });

    // Advance the injected clock between start and end of the call.
    const original = dispatcher.callTool('list_show_access', {});
    clock = 1007;
    await original;

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      tool: 'list_show_access',
      env: 'staging',
      state: 'found',
    });
    expect(logs[0]?.ms).toBeGreaterThanOrEqual(0);
  });
});
