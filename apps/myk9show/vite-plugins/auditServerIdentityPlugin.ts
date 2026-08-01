import type { Plugin } from 'vite';
import { AUDIT_SERVER_IDENTITY_PATH } from '../scripts/playwright-audit-target';

export function auditServerIdentityPlugin(serverId: string | undefined): Plugin | null {
  if (!serverId) return null;

  return {
    name: 'myk9-audit-server-identity',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url !== AUDIT_SERVER_IDENTITY_PATH) {
          next();
          return;
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify({ app: 'myk9show', serverId }));
      });
    },
  };
}
