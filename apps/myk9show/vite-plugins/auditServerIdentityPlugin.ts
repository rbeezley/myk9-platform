import type { Plugin } from 'vite';
import { AUDIT_SERVER_IDENTITY_PATH } from '../scripts/playwright-audit-target';

/**
 * Dev-only endpoint an audit run uses to confirm which server it is talking to.
 * Mounted only when VITE_AUDIT_SERVER_ID is set, so it never exists in an
 * ordinary dev session or any build.
 *
 * Reports the Supabase host as well as the server id. The id alone proves only
 * that *someone* started this server for this run — it says nothing about which
 * project the app will write to. An audit that attaches to a server built
 * against a different Supabase project would find its write guard matching no
 * host at all, forward every write to that project, and still report clean
 * interception. Reporting the target lets the run refuse before that happens.
 *
 * The host is read from Vite's RESOLVED env rather than `process.env`, because
 * that is the value the app itself will use: Vite loads `.env` files into its
 * own env, so `process.env.VITE_SUPABASE_URL` is usually empty here and would
 * make the endpoint report `null` for a perfectly well-configured server.
 */
export function auditServerIdentityPlugin(serverId: string | undefined): Plugin | null {
  if (!serverId) return null;

  return {
    name: 'myk9-audit-server-identity',
    apply: 'serve',
    configureServer(server) {
      const supabaseHost = parseHost(server.config.env.VITE_SUPABASE_URL);

      server.middlewares.use((request, response, next) => {
        if (request.url !== AUDIT_SERVER_IDENTITY_PATH) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        // Host only, never the full URL — it can carry credentials.
        response.end(JSON.stringify({ app: 'myk9show', serverId, supabaseHost }));
      });
    },
  };
}

function parseHost(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value.trim()).hostname;
  } catch {
    return null;
  }
}
