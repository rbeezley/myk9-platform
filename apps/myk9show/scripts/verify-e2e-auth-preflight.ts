import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { config as loadEnv } from 'dotenv';

import {
  resolveAuthPreflightConfig,
  verifyE2EAuthCredentials,
} from '../src/test/e2e-helpers/e2eAuthPreflight';

// Mirrors playwright.config.ts's own loading order — `.env.local` first, then
// `.env`, both with override:false — so `.env.local` wins under dotenv's
// "first write sticks" semantics and neither call ever replaces a variable
// the shell already exported. Resolved from this file's own location rather
// than `process.cwd()` so the script behaves the same whether it is invoked
// from `apps/myk9show` (the CI working directory) or the repo root.
const appRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const envLocalPath = path.join(appRoot, '.env.local');
const envPath = path.join(appRoot, '.env');
loadEnv({ path: envLocalPath, override: false });
loadEnv({ path: envPath, override: false });

const DEFAULT_ROLES = ['secretary', 'admin', 'judge', 'exhibitor'] as const;
const requestedRoles = process.argv.slice(2);
const roles = requestedRoles.length > 0 ? requestedRoles : DEFAULT_ROLES;

try {
  const config = resolveAuthPreflightConfig(process.env, roles);
  await verifyE2EAuthCredentials(config);
  console.log(`E2E auth preflight passed for ${roles.join(', ')}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  // Name the two files this script looked in only for a genuinely missing
  // variable — resolveAuthPreflightConfig's other errors (an unsupported
  // role, a retired fixture address, a rejected credential) are not env-
  // loading problems and would be misdiagnosed by pointing at these files.
  const isMissingSecret = message.startsWith('Missing E2E auth preflight secret(s)');
  console.error(
    isMissingSecret ? `${message} (looked in ${envPath} and ${envLocalPath})` : message
  );
  process.exitCode = 1;
}
