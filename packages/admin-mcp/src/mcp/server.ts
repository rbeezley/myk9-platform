/**
 * MCP server wiring for the local site-admin diagnostics server.
 *
 * The core is a transport-agnostic {@link ToolDispatcher} (unit-testable
 * without stdio or a live database). {@link createAdminMcpServer} binds it to
 * the SDK's low-level Server + stdio transport.
 *
 * Boundary guarantees:
 *  - Allowlist: only the V1 tools in {@link ALLOWED_TOOL_NAMES} can register.
 *  - Fail safe: invalid input or an unexpected throw becomes a typed
 *    diagnostic state, never a stack trace sent to the client.
 *  - Observability: every call logs tool/env/state/elapsed-ms to stderr,
 *    with no secrets.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { AdminMcpConfig } from '../config';
import type { DiagnosticResult } from '../diagnostics/types';
import { createDiagnosticResult } from '../diagnostics/types';

/** Every tool name permitted in V1 (per the plan's Tool Contract). */
export const ALLOWED_TOOL_NAMES = [
  'list_recent_shows',
  'lookup_show',
  'summarize_show_configuration',
  'lookup_entry',
  'diagnose_entry',
  'list_unpaid_entries',
  'list_unconfirmed_entries',
  'diagnose_confirmation_email',
  'diagnose_payment',
  'list_show_access',
] as const;

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number];

export interface AdminToolDefinition {
  name: AllowedToolName;
  description: string;
  /** JSON Schema advertised to MCP clients for this tool's arguments. */
  inputSchema: Record<string, unknown>;
  /** Validate/normalize raw args; throws on invalid input. */
  parseInput: (raw: unknown) => unknown;
  handle: (input: unknown) => Promise<DiagnosticResult>;
}

export interface ToolCallLog {
  tool: string;
  env: string;
  state: string;
  ms: number;
}

export interface AdminMcpServerDeps {
  config: AdminMcpConfig;
  tools: AdminToolDefinition[];
  log?: (entry: ToolCallLog) => void;
  now?: () => number;
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export interface ToolDispatcher {
  listTools(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
  callTool(name: string, rawArgs: unknown): Promise<McpToolResult>;
}

/**
 * A thrown value that looks like a PostgREST/Supabase error is treated as a
 * data-source problem; anything else is an unexpected programmer/runtime error.
 */
function classifyThrownError(error: unknown): 'source_unavailable' | 'error' {
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    if (
      typeof candidate.code === 'string' ||
      typeof candidate.details === 'string' ||
      typeof candidate.hint === 'string'
    ) {
      return 'source_unavailable';
    }
  }
  return 'error';
}

function formatResult(result: DiagnosticResult): McpToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: result.state === 'error',
  };
}

export function createToolDispatcher(deps: AdminMcpServerDeps): ToolDispatcher {
  const allowed = new Set<string>(ALLOWED_TOOL_NAMES);
  const registry = new Map<string, AdminToolDefinition>();
  for (const tool of deps.tools) {
    if (allowed.has(tool.name)) {
      registry.set(tool.name, tool);
    }
  }

  const now = deps.now ?? (() => Date.now());
  const log =
    deps.log ??
    ((entry: ToolCallLog) =>
      void process.stderr.write(
        `[myk9-admin-mcp] tool=${entry.tool} env=${entry.env} ` +
          `state=${entry.state} ms=${entry.ms}\n`,
      ));

  function listTools() {
    return [...registry.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async function callTool(
    name: string,
    rawArgs: unknown,
  ): Promise<McpToolResult> {
    const startedAt = now();
    const tool = registry.get(name);
    let result: DiagnosticResult;

    if (!tool) {
      result = createDiagnosticResult(deps.config.envLabel, 'error', {
        limitations: [`Unknown or disabled tool: ${name}`],
      });
    } else {
      try {
        const input = tool.parseInput(rawArgs);
        result = await tool.handle(input);
      } catch (error) {
        const state = classifyThrownError(error);
        result = createDiagnosticResult(deps.config.envLabel, state, {
          limitations: [
            state === 'source_unavailable'
              ? 'The data source could not be reached or returned an error.'
              : 'The tool input was invalid or an unexpected error occurred.',
          ],
        });
      }
    }

    log({
      tool: name,
      env: deps.config.envLabel,
      state: result.state,
      ms: now() - startedAt,
    });
    return formatResult(result);
  }

  return { listTools, callTool };
}

export function createAdminMcpServer(deps: AdminMcpServerDeps): Server {
  const dispatcher = createToolDispatcher(deps);
  const server = new Server(
    { name: 'myk9-admin-mcp', version: '0.0.1' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: dispatcher.listTools(),
  }));

  server.setRequestHandler(
    CallToolRequestSchema,
    async (request): Promise<CallToolResult> => {
      const result = await dispatcher.callTool(
        request.params.name,
        request.params.arguments ?? {},
      );
      // McpToolResult is structurally a CallToolResult (content + isError);
      // the SDK's result union also includes a task variant TS can't narrow to.
      return result as CallToolResult;
    },
  );

  return server;
}

export async function startAdminMcpServer(
  deps: AdminMcpServerDeps,
): Promise<void> {
  const server = createAdminMcpServer(deps);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
