/**
 * Process entry point for the local site-admin MCP server.
 *
 * Loads + validates config (fails closed), creates the Supabase admin client,
 * builds the allowlisted tool set, and serves it over stdio.
 */
import { AdminMcpConfigError, loadAdminMcpConfig } from './config';
import { createSupabaseAdminClient } from './db/supabaseAdmin';
import { startAdminMcpServer } from './mcp/server';
import { buildAdminTools } from './tools/index';

async function main(): Promise<void> {
  let config;
  try {
    config = loadAdminMcpConfig(process.env);
  } catch (error) {
    // Fail closed: a clean message + non-zero exit, never a partial start.
    const detail =
      error instanceof AdminMcpConfigError
        ? error.message
        : 'unexpected error loading configuration';
    process.stderr.write(`[myk9-admin-mcp] refusing to start: ${detail}\n`);
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient(config);
  const tools = buildAdminTools({ config, supabase });

  process.stderr.write(
    `[myk9-admin-mcp] serving over stdio; env=${config.envLabel}; ` +
      `${tools.length} tool(s) registered.\n`,
  );

  await startAdminMcpServer({ config, tools });
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[myk9-admin-mcp] fatal: ${detail}\n`);
  process.exit(1);
});
