/**
 * V1 tool registry.
 *
 * The server framework, allowlist, validation, and logging are in place.
 * V1.0 ships `list_show_access`; the confirmation-email and payment diagnostics
 * register here in Tasks 6-7. Each handler closes over `ctx.supabase`.
 */
import { listShowAccessTool } from '../diagnostics/accessDiagnostics';
import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import type { AdminToolDefinition } from '../mcp/server';

export interface ToolContext {
  config: AdminMcpConfig;
  supabase: AdminSupabaseClient;
}

export function buildAdminTools(ctx: ToolContext): AdminToolDefinition[] {
  return [listShowAccessTool(ctx)];
}
