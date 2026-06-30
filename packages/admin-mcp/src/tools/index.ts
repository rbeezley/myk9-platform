/**
 * V1 tool registry.
 *
 * V1.0 ships the three cross-table diagnostics — `diagnose_confirmation_email`,
 * `diagnose_payment`, and `list_show_access`. Each handler closes over
 * `ctx.supabase`. Lookup tools (`lookup_show`/`lookup_entry`/...) are V1.1.
 */
import { listShowAccessTool } from '../diagnostics/accessDiagnostics';
import { diagnoseConfirmationEmailTool } from '../diagnostics/emailDiagnostics';
import { diagnosePaymentTool } from '../diagnostics/paymentDiagnostics';
import type { AdminMcpConfig } from '../config';
import type { AdminSupabaseClient } from '../db/supabaseAdmin';
import type { AdminToolDefinition } from '../mcp/server';

export interface ToolContext {
  config: AdminMcpConfig;
  supabase: AdminSupabaseClient;
}

export function buildAdminTools(ctx: ToolContext): AdminToolDefinition[] {
  return [
    diagnoseConfirmationEmailTool(ctx),
    diagnosePaymentTool(ctx),
    listShowAccessTool(ctx),
  ];
}
