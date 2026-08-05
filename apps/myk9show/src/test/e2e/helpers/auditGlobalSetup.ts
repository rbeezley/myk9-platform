import type { FullConfig } from '@playwright/test';
import {
  AUDIT_SERVER_IDENTITY_PATH,
  SHARED_STAGING_SUPABASE_HOST,
  verifyAuditServerIdentity,
} from '../../../../scripts/playwright-audit-target';

export default async function auditGlobalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const expectedServerId = process.env.PLAYWRIGHT_AUDIT_SERVER_ID?.trim();

  if (typeof baseURL !== 'string' || !expectedServerId) {
    throw new Error('Audit target identity is incomplete.');
  }

  const response = await fetch(new URL(AUDIT_SERVER_IDENTITY_PATH, baseURL), {
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`Audit server identity endpoint returned ${response.status}.`);
  }

  // Also pins the server's Supabase target: attaching to a server built against
  // a different project would slip past every other check in the audit.
  verifyAuditServerIdentity(await response.json(), expectedServerId, SHARED_STAGING_SUPABASE_HOST);
}
