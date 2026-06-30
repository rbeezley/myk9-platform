/**
 * Process entry point for the local site-admin MCP server.
 *
 * Task 1 wires only config loading so the package builds, runs, and fails
 * closed on missing env vars. The stdio MCP transport and tool registration
 * land in Task 3 (see docs/plan-site-admin-mcp-v1.md).
 */
import { AdminMcpConfigError, loadAdminMcpConfig } from './config';

function main(): void {
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

  process.stderr.write(
    `[myk9-admin-mcp] config loaded for env=${config.envLabel}; ` +
      `defaultLimit=${config.defaultLimit} maxLimit=${config.maxLimit}. ` +
      'Server wiring lands in Task 3.\n',
  );
}

main();
