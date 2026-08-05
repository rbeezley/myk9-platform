/**
 * Prints the judge replay run plan for `run-audit-judge-replay.sh`.
 *
 * Deliberately thin: all of the decisions (and every fail-closed rule) live in
 * `audit-judge-replay.ts`, where they are unit-tested. This file only loads the
 * env files the app itself uses and serialises the result, so a shell script can
 * consume it without reimplementing any of that logic in bash.
 *
 *   --shell   emit `MYK9_PLAN_*` assignments for `eval`, instead of JSON.
 */
import { config as loadEnv } from 'dotenv';
import { resolveAuditReplayPlan, type AuditReplayPlan } from './audit-judge-replay';

// `quiet` matters here: dotenv prints a banner to STDOUT, and this script's
// stdout is eval'd by the shell wrapper.
loadEnv({ path: '.env.local', override: false, quiet: true });
loadEnv({ path: '.env', override: false, quiet: true });

try {
  const plan = resolveAuditReplayPlan(process.env);
  process.stdout.write(
    process.argv.includes('--shell')
      ? `${toShellAssignments(plan)}\n`
      : `${JSON.stringify(plan, null, 2)}\n`
  );
} catch (error) {
  process.stderr.write(
    `Audit judge replay refused to start: ${
      error instanceof Error ? error.message : String(error)
    }\n`
  );
  process.exit(2);
}

function toShellAssignments(plan: AuditReplayPlan): string {
  return [
    `MYK9_PLAN_MODE=${shellQuote(plan.mode)}`,
    `MYK9_PLAN_BASE_URL=${shellQuote(plan.baseURL)}`,
    `MYK9_PLAN_SERVER_ID=${shellQuote(plan.serverId)}`,
    `MYK9_PLAN_DATA_TARGET=${shellQuote(plan.dataTarget)}`,
    `MYK9_PLAN_PROJECT=${shellQuote(plan.project)}`,
    `MYK9_PLAN_PORT=${shellQuote(plan.port === null ? '' : String(plan.port))}`,
    `MYK9_PLAN_SPECS=${shellQuote(plan.specs.join(' '))}`,
  ].join('\n');
}

/** Single-quote for POSIX sh, closing and re-opening around any embedded quote. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
