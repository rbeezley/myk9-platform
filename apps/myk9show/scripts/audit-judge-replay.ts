/**
 * Run plan for the scheduled judge scoring replay (MYK9-144).
 *
 * The pieces this composes already existed — a fail-closed target resolver
 * (`playwright-audit-target.ts`), an identity endpoint the dev server mounts,
 * and a shared-staging write guard. What was missing was anything that decides
 * *how a scheduled run reaches them*, so the replay stayed a manual recipe of
 * three environment variables that had to agree.
 *
 * This module is the decision half and holds no I/O, so every fail-closed rule
 * below is unit-testable. `run-audit-judge-replay.sh` is the acting half.
 *
 * ## Attach vs own
 *
 * A scheduled audit usually already has an app server up — the walk it is part
 * of started one. Binding a second one is what failed in the sandbox that
 * produced this issue, so the plan prefers ATTACH whenever the caller names a
 * base URL, and only OWNs a server when it has been given no target at all.
 * Attach mode never binds; own mode picks its own port so it cannot collide
 * with the walk's server.
 */
import { INTERCEPTED_STAGING_TARGET, resolveAuditTarget } from './playwright-audit-target';

/** Specs the scheduled replay runs, relative to the myk9show app directory. */
export const JUDGE_REPLAY_SPECS = [
  'src/test/e2e/show/atShowJudgeScoring.spec.ts',
  'src/test/e2e/show/atShowJudgeAuditReplay.spec.ts',
] as const;

/**
 * The issue requires 1024x768 evidence, which is the `tablet-landscape` project
 * in playwright.audit.config.ts — the viewport a judge actually holds at ringside.
 */
export const JUDGE_REPLAY_PROJECT = 'tablet-landscape';

/** Own-mode default. Deliberately far from 5173 so it cannot land on a dev server. */
export const DEFAULT_OWNED_PORT = 5793;

/**
 * Vite's HMR port is derived as `port + HMR_PORT_OFFSET`, so the app port has to
 * leave room for it. Without this ceiling a nominally valid port like 50000
 * derives an HMR port above 65535 and Vite exits with ERR_SOCKET_BAD_PORT
 * before the identity endpoint ever comes up — a confusing failure a long way
 * from its cause.
 */
export const HMR_PORT_OFFSET = 20_000;
export const MAX_OWNED_PORT = 65_535 - HMR_PORT_OFFSET;

export type AuditReplayMode = 'attach' | 'own';

export interface AuditReplayPlan {
  mode: AuditReplayMode;
  baseURL: string;
  /** Only meaningful in own mode; the port the wrapper must bind. */
  port: number | null;
  serverId: string;
  dataTarget: typeof INTERCEPTED_STAGING_TARGET;
  project: string;
  specs: string[];
}

export interface AuditReplayEnvironment {
  PLAYWRIGHT_AUDIT_BASE_URL?: string;
  PLAYWRIGHT_AUDIT_SERVER_ID?: string;
  PLAYWRIGHT_AUDIT_DATA_TARGET?: string;
  VITE_SUPABASE_URL?: string;
  MYK9_AUDIT_REPLAY_PORT?: string;
  MYK9_AUDIT_REPLAY_RUN_ID?: string;
}

/**
 * Resolve the run plan, or throw. Throwing is the point: a scheduled run with
 * an ambiguous target must fail before it opens a browser, not write somewhere
 * unexpected and be discovered later.
 */
export function resolveAuditReplayPlan(environment: AuditReplayEnvironment): AuditReplayPlan {
  const declaredBaseURL = environment.PLAYWRIGHT_AUDIT_BASE_URL?.trim();
  const declaredServerId = environment.PLAYWRIGHT_AUDIT_SERVER_ID?.trim();

  if (declaredBaseURL) {
    // ATTACH. Both halves of the identity must be supplied by whoever started
    // the server; inventing a server id here would make the identity handshake
    // a formality that always passes.
    if (!declaredServerId) {
      throw new Error(
        'PLAYWRIGHT_AUDIT_BASE_URL was given without PLAYWRIGHT_AUDIT_SERVER_ID. ' +
          'Attaching to a server whose identity is unverified is not allowed.'
      );
    }

    const target = resolveAuditTarget({
      PLAYWRIGHT_AUDIT_BASE_URL: declaredBaseURL,
      PLAYWRIGHT_AUDIT_SERVER_ID: declaredServerId,
      // The replay is only ever valid against intercepted shared staging, so
      // this is asserted rather than read: an operator cannot widen it by
      // exporting a different value.
      PLAYWRIGHT_AUDIT_DATA_TARGET: INTERCEPTED_STAGING_TARGET,
      VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
    });

    return {
      mode: 'attach',
      baseURL: target.baseURL,
      port: null,
      serverId: target.serverId,
      dataTarget: INTERCEPTED_STAGING_TARGET,
      project: JUDGE_REPLAY_PROJECT,
      specs: [...JUDGE_REPLAY_SPECS],
    };
  }

  if (declaredServerId) {
    throw new Error(
      'PLAYWRIGHT_AUDIT_SERVER_ID was given without PLAYWRIGHT_AUDIT_BASE_URL. ' +
        'Name the server to attach to, or set neither and let the runner own one.'
    );
  }

  // OWN. The runner starts and stops its own server on its own port.
  const port = resolveOwnedPort(environment.MYK9_AUDIT_REPLAY_PORT);
  const serverId = resolveOwnedServerId(environment.MYK9_AUDIT_REPLAY_RUN_ID, port);
  const baseURL = `http://127.0.0.1:${port}`;

  const target = resolveAuditTarget({
    PLAYWRIGHT_AUDIT_BASE_URL: baseURL,
    PLAYWRIGHT_AUDIT_SERVER_ID: serverId,
    PLAYWRIGHT_AUDIT_DATA_TARGET: INTERCEPTED_STAGING_TARGET,
    VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
  });

  return {
    mode: 'own',
    baseURL: target.baseURL,
    port,
    serverId: target.serverId,
    dataTarget: INTERCEPTED_STAGING_TARGET,
    project: JUDGE_REPLAY_PROJECT,
    specs: [...JUDGE_REPLAY_SPECS],
  };
}

function resolveOwnedPort(raw: string | undefined): number {
  const value = raw?.trim();
  if (!value) return DEFAULT_OWNED_PORT;

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > MAX_OWNED_PORT) {
    throw new Error(
      `MYK9_AUDIT_REPLAY_PORT must be an integer between 1024 and ${MAX_OWNED_PORT} ` +
        `(the ceiling leaves room for the derived HMR port, port + ${HMR_PORT_OFFSET}).`
    );
  }
  return port;
}

/**
 * A per-run identity.
 *
 * Note what protects own mode from a stale server: the runner refuses to start
 * when anything is already serving on its port, so it never attaches to one.
 * The default id is therefore deterministic (`audit-judge-replay-<port>`) and
 * does NOT by itself distinguish this run from a previous one — pass
 * MYK9_AUDIT_REPLAY_RUN_ID when a run needs to be identifiable in its own
 * right, e.g. when several audits share a machine.
 */
function resolveOwnedServerId(rawRunId: string | undefined, port: number): string {
  const runId = rawRunId?.trim();
  if (!runId) return `audit-judge-replay-${port}`;
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) {
    throw new Error(
      'MYK9_AUDIT_REPLAY_RUN_ID must contain only letters, digits, dot, underscore or hyphen.'
    );
  }
  return `audit-judge-replay-${runId}`;
}

/** The exact environment the Playwright audit config expects. */
export function auditReplayPlaywrightEnv(plan: AuditReplayPlan): Record<string, string> {
  return {
    PLAYWRIGHT_AUDIT_BASE_URL: plan.baseURL,
    PLAYWRIGHT_AUDIT_SERVER_ID: plan.serverId,
    PLAYWRIGHT_AUDIT_DATA_TARGET: plan.dataTarget,
  };
}
