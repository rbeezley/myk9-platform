import {
  resolveAuthPreflightConfig,
  verifyE2EAuthCredentials,
} from '../src/test/e2e-helpers/e2eAuthPreflight';

const DEFAULT_ROLES = ['secretary', 'admin', 'judge', 'exhibitor'] as const;
const requestedRoles = process.argv.slice(2);
const roles = requestedRoles.length > 0 ? requestedRoles : DEFAULT_ROLES;

try {
  const config = resolveAuthPreflightConfig(process.env, roles);
  await verifyE2EAuthCredentials(config);
  console.log(`E2E auth preflight passed for ${roles.join(', ')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
