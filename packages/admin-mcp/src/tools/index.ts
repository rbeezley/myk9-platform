/**
 * V1 tool registry.
 *
 * The server framework, allowlist, validation, and logging are in place. The
 * three V1.0 diagnostic tools (confirmation email, payment, show access) are
 * registered here in Tasks 6-8; each handler closes over `ctx.supabase`.
 */
import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import type { AdminToolDefinition } from '../mcp/server';

export interface ToolContext {
  config: AdminMcpConfig;
  supabase: AdminSupabaseClient;
}

export function buildAdminTools(_ctx: ToolContext): AdminToolDefinition[] {
  return [];
}
