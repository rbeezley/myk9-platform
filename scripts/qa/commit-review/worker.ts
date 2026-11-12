import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface WorkerRequest {
  recordPath: string;
  remainingShas: string[];
  sessionId?: string;
  /** Every commit is reviewed; only the report-and-cursor commit is missing. */
  publicationOnly: boolean;
}

export interface WorkerResult {
  exitCode: number;
  sessionId?: string;
  stderr: string;
}

export type LaunchWorker = (req: WorkerRequest) => Promise<WorkerResult>;

const PERMANENT = [
  /not logged in/i,
  /please (run|use) `?codex login/i,
  /invalid[_ ]api[_ ]key/i,
  /unauthori[sz]ed/i,
  /\b401\b/,
  /\b403\b/,
  /ENOENT/,
  /command not found/i,
  /worker instructions file/i,
];
/** Permanent wins: retrying an auth or missing-binary error only burns attempts. */
export function classifyFailure(
  exitCode: number,
  stderr: string
): 'ok' | 'transient' | 'permanent' {
  if (exitCode === 0) return 'ok';
  if (PERMANENT.some(r => r.test(stderr))) return 'permanent';
  // Anything else (network, rate or usage limit, timeout, an interruption Codex
  // can resume) is retried under the controller's bounded backoff and caps.
  return 'transient';
}

export function buildPrompt(req: WorkerRequest, instructions: string): string {
  const rec = req.recordPath;
  const rules = [
    `You are one worker attempt of a controller-managed nightly commit review. The run record is ${rec}.`,
    'The target and inventory are FROZEN in that record. Do not fetch a new target, re-inventory, or widen the window.',
    'Never edit the record file by hand and never advance the audit-boundary cursor yourself during source review.',
    'After finishing each commit, run exactly: pnpm qa:commit-review:validate mark-reviewed --record ' +
      `"${rec}" --sha <sha> --evidence "<what you verified>"`,
    `Record each finding with: pnpm qa:commit-review:validate add-finding --record "${rec}" --id <stable id> [--linear-state filed --issue MYK9-n]. It is an upsert, so retrying is safe.`,
    'Search Linear (includeArchived) before filing so a resumed attempt never creates a duplicate issue or comment.',
    'Do not stop early. Work until every listed commit is marked reviewed, then stop. The controller verifies the record and resumes you if anything is left.',
  ];
  const task = req.publicationOnly
    ? [
        'Every commit is already reviewed. Your only task is publication under the existing one-report-and-cursor docs-only commit contract.',
        `First run: pnpm qa:commit-review:validate publish-check --record "${rec}". If it exits 0 the report and cursor are already on origin/main: do NOT publish again, and stop.`,
        'Otherwise write the report, stamp the row (never overwrite a newer stamp), commit exactly those two files, push, then stop. The controller reads both files back on origin/main.',
      ]
    : [
        `Review ONLY these ${req.remainingShas.length} commit(s), in this order (oldest first):`,
        ...req.remainingShas,
      ];
  return [...rules, '', ...task, '', '--- Standing review instructions ---', instructions].join(
    '\n'
  );
}

export function parseSessionId(stdout: string): string | undefined {
  for (const line of stdout.split('\n')) {
    try {
      const ev = JSON.parse(line) as Record<string, unknown>;
      const id = ev.thread_id ?? ev.session_id ?? ev.conversation_id;
      if (typeof id === 'string' && id) return id;
    } catch {
      // not a JSON event line
    }
  }
  return undefined;
}

export interface RealWorkerConfig {
  repoDir: string;
  instructionsFile: string;
  codexBin?: string;
  extraArgs?: string[];
  timeoutMs?: number;
}

export function realLaunchWorker(cfg: RealWorkerConfig): LaunchWorker {
  return req =>
    new Promise(resolve => {
      if (!existsSync(cfg.instructionsFile)) {
        resolve({
          exitCode: 1,
          stderr: `worker instructions file missing: ${cfg.instructionsFile}`,
        });
        return;
      }
      const prompt = buildPrompt(req, readFileSync(cfg.instructionsFile, 'utf8'));
      // `codex exec resume` has no -C; the working directory is set by spawn's cwd for both.
      const flags = ['--json', ...(cfg.extraArgs ?? [])];
      const args = req.sessionId
        ? ['exec', 'resume', ...flags, req.sessionId, prompt]
        : ['exec', ...flags, prompt];
      const child = spawn(cfg.codexBin ?? 'codex', args, {
        cwd: cfg.repoDir,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // First session event wins and is kept apart from the bounded output tail.
      let sessionFound: string | undefined;
      let pending = '';
      let stderr = '';
      let settled = false;
      const done = (exitCode: number, extra = ''): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          exitCode,
          sessionId: sessionFound ?? parseSessionId(pending) ?? req.sessionId,
          stderr: stderr + extra,
        });
      };
      const timer = setTimeout(
        () => {
          child.kill('SIGTERM');
          done(124, '\nworker timed out');
        },
        cfg.timeoutMs ?? 6 * 60 * 60 * 1000
      );
      child.stdout.on('data', d => {
        if (sessionFound) return;
        pending += String(d);
        const cut = pending.lastIndexOf('\n');
        if (cut >= 0) {
          sessionFound = parseSessionId(pending.slice(0, cut));
          pending = pending.slice(cut + 1);
        }
        if (pending.length > 1_000_000) pending = pending.slice(-100_000);
      });
      child.stderr.on('data', d => {
        stderr += String(d);
        if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      });
      child.on('error', err => done(127, `spawn ${cfg.codexBin ?? 'codex'}: ${err.message}`));
      child.on('close', code => done(code ?? 1));
    });
}
