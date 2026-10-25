/**
 * Read-only capability check for a cloud agent session (MYK9-1397).
 *
 * It answers "can this checkout, as this role, run what the workflow needs?"
 * without installing, authenticating or writing anything, so it is safe to
 * run on the Mac too: there it reports, it never changes the local setup
 * (docs/plan-cloud-agent-workflow.md, Global constraints protection 1).
 * Installing is `scripts/cloud/setup.sh`'s job.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type Role = 'implementer' | 'reviewer' | 'publisher';
export type Harness = 'claude' | 'codex';

export type CommandResult = { status: number | null; stdout: string };

export type PreflightDeps = {
  /** Runs a command without a shell; `status: null` means it could not start. */
  run(cmd: string, args: string[]): CommandResult;
  exists(path: string): boolean;
};

export type PreflightCheck = { name: string; ok: boolean; detail: string };

export type PreflightReport = {
  role: Role;
  root: string;
  cloud: boolean;
  ok: boolean;
  checks: PreflightCheck[];
  missing: string[];
};

type ToolPin = { install: string; minimum: string };

const TOOL_VERSIONS = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tool-versions.json'), 'utf8')
) as Record<string, ToolPin | string>;

const HARNESS_KEY: Record<Harness, string> = {
  codex: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
};

const ROLE_TOOLS: Record<Role, string[]> = {
  implementer: ['node', 'pnpm', 'git', 'gh', 'deno', 'shellcheck', 'jq'],
  reviewer: ['node', 'pnpm', 'git'],
  publisher: ['node', 'git', 'gh', 'jq'],
};

/**
 * What each review wrapper runs before it can review, beyond the reviewer
 * role's tools. scripts/qa/claude-review.sh reads the PR through gh on every
 * run (its head check); scripts/qa/codex-review.sh needs gh only to post, which
 * is the publisher's job. preflight.test.ts runs the Claude wrapper without gh
 * to keep this list honest.
 */
const REVIEWER_TOOLS: Record<Harness, string[]> = {
  codex: ['codex'],
  claude: ['claude', 'gh'],
};

export function parseVersion(output: string): string | null {
  return /(\d+\.\d+(?:\.\d+)?)/.exec(output)?.[1] ?? null;
}

/** True when `a` is at least `b`, comparing dotted numeric versions. */
export function versionAtLeast(a: string, b: string): boolean {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

/**
 * A recognized cloud session. `MYK9_CLOUD=1` is the explicit marker for
 * providers with no documented variable of their own (Codex cloud's setup
 * sets it).
 */
export function isCloudEnvironment(env: Record<string, string | undefined>): boolean {
  return (
    env.CLAUDE_CODE_REMOTE === 'true' || env.GITHUB_ACTIONS === 'true' || env.MYK9_CLOUD === '1'
  );
}

function toolCheck(tool: string, deps: PreflightDeps): PreflightCheck {
  const result = deps.run(tool, ['--version']);
  if (result.status === null) return { name: tool, ok: false, detail: 'not installed' };
  // A tool that prints a version and then fails to start is not usable.
  if (result.status !== 0) {
    return { name: tool, ok: false, detail: `--version exited ${result.status}` };
  }
  const version = parseVersion(result.stdout);
  const pin = TOOL_VERSIONS[tool];
  const minimum = typeof pin === 'object' ? pin.minimum : undefined;
  if (!minimum) return { name: tool, ok: true, detail: version ?? 'present' };
  if (!version) return { name: tool, ok: false, detail: 'version unreadable' };
  return versionAtLeast(version, minimum)
    ? { name: tool, ok: true, detail: version }
    : { name: tool, ok: false, detail: `${version} < ${minimum}` };
}

export function runPreflight(options: {
  root: string;
  role: Role;
  env: Record<string, string | undefined>;
  deps: PreflightDeps;
  reviewerHarness?: Harness;
}): PreflightReport {
  const { root, role, env, deps } = options;
  const cloud = isCloudEnvironment(env);
  const checks: PreflightCheck[] = [];

  const isCheckout = deps.exists(join(root, 'pnpm-workspace.yaml'));
  checks.push({
    name: 'checkout',
    ok: isCheckout,
    detail: isCheckout ? root : `${root} is not the repository root`,
  });

  const tools = [...ROLE_TOOLS[role]];
  if (role === 'reviewer') tools.push(...REVIEWER_TOOLS[options.reviewerHarness ?? 'codex']);
  for (const tool of tools) checks.push(toolCheck(tool, deps));

  if (role === 'reviewer') {
    const key = HARNESS_KEY[options.reviewerHarness ?? 'codex'];
    // Names only: a report is printed and may be uploaded, so it never holds a value.
    if (cloud) {
      const present = (env[key] ?? '').length > 0;
      checks.push({ name: key, ok: present, detail: present ? 'set' : 'not set' });
    } else {
      checks.push({ name: key, ok: true, detail: 'local login; not checked by preflight' });
    }
  }

  // Every role reaches GitHub: through gh where its workflow uses gh, and the
  // reviewer at least to fetch the base and head it reviews.
  const network = deps.run('curl', [
    '--silent',
    '--head',
    '--output',
    '/dev/null',
    '--max-time',
    '10',
    'https://github.com',
  ]);
  checks.push({
    name: 'network',
    ok: network.status === 0,
    detail: network.status === 0 ? 'github.com reachable' : 'github.com unreachable',
  });
  if (tools.includes('gh')) {
    // A GET, never a write: the reviewer/publisher preflight must not prove
    // write access by writing (plan Task 1.1).
    const read = deps.run('gh', ['api', 'rate_limit', '--silent']);
    checks.push({
      name: 'github-read',
      ok: read.status === 0,
      detail: read.status === 0 ? 'gh api read ok' : 'gh api read failed (auth or network)',
    });
  }

  const missing = checks.filter(check => !check.ok).map(check => check.name);
  return { role, root, cloud, ok: missing.length === 0, checks, missing };
}

const realDeps: PreflightDeps = {
  run(cmd, args) {
    const result = spawnSync(cmd, args, { encoding: 'utf8', timeout: 20_000 });
    if (result.error) return { status: null, stdout: '' };
    return { status: result.status, stdout: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  },
  exists: existsSync,
};

function argValue(args: string[], name: string): string | undefined {
  return args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export function runCli(args: string[] = process.argv.slice(2)): number {
  const role = (argValue(args, 'role') ?? 'implementer') as Role;
  if (!(role in ROLE_TOOLS)) {
    console.error(`preflight: unknown --role=${role} (implementer | reviewer | publisher)`);
    return 2;
  }
  const harness = argValue(args, 'reviewer-harness') as Harness | undefined;
  if (harness && !(harness in HARNESS_KEY)) {
    console.error(`preflight: unknown --reviewer-harness=${harness} (claude | codex)`);
    return 2;
  }
  const top = realDeps.run('git', ['rev-parse', '--show-toplevel']);
  const root = argValue(args, 'root') ?? top.stdout.trim();
  const report = runPreflight({
    root,
    role,
    env: process.env,
    deps: realDeps,
    reviewerHarness: harness,
  });
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`preflight (${role}, ${report.cloud ? 'cloud' : 'local'}): ${root}`);
    for (const check of report.checks) {
      console.log(`  ${check.ok ? 'ok  ' : 'FAIL'} ${check.name}: ${check.detail}`);
    }
    console.log(report.ok ? 'preflight: ready' : `preflight: missing ${report.missing.join(', ')}`);
  }
  return report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = runCli();
}
