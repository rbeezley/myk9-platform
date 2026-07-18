import { resolveIsolatedE2eTarget } from './isolated-e2e-target';

const target = resolveIsolatedE2eTarget(process.env);

console.log(`Isolated E2E target verified: ${target.projectRef} (${target.supabaseUrl})`);
