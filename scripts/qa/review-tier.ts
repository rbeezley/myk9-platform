/**
 * Risk map for the review gate: which tier of scrutiny a change's paths
 * require. Imported by BOTH scripts/qa/review-gate.ts (to refuse evidence
 * below the floor) and the qa:review-tier CLI (so an agent can learn the
 * floor BEFORE spending tokens on a review it does not need).
 *
 * Deliberately a short readable table, never inference over file contents:
 * a keyword scan would make the floor depend on prose, and prose about code
 * satisfies a text scan (LESSONS #comment-satisfies-grep).
 */
export type Tier = 'independent' | 'adversarial' | 'owner' | 'none';

/** Weakest to strongest. `owner` outranks `none` but is below `adversarial`. */
export const TIER_ORDER: readonly Tier[] = ['none', 'owner', 'adversarial', 'independent'];

export const MIGRATION_LENS = 'migration-auditor';

/** Guardrails: a change here can disable what catches the next defect. */
const INDEPENDENT_PATTERNS: readonly RegExp[] = [
  /^\.github\//,
  /^\.(claude|codex|agents)\//,
  /^scripts\/qa\//,
  /(^|\/)playwright[^/]*\.config\.ts$/,
  /^(CLAUDE|AGENTS)\.md$/,
  /^docs\/agents\/shared-rules\.md$/,
  /^supabase\/functions\//,
  /^packages\/replication\//,
  /(^|\/)(rls|grants?|policies)[^/]*\.(sql|ts)$/i,
  /(^|\/)(auth|rbac|permissions?|roles?)\//i,
  /(^|\/)(stripe|payout|refund|checkout|payments?)/i,
];

const MIGRATION_PATTERN = /^supabase\/migrations\//;

/** Docs are the only `none`, and never the instruction files above. */
const NONE_PATTERNS: readonly RegExp[] = [/^docs\//, /^[^/]*\.md$/];

function floorFor(file: string): { tier: Tier; reason: string } {
  if (INDEPENDENT_PATTERNS.some(p => p.test(file))) {
    return { tier: 'independent', reason: `${file} is a guardrail or high-risk path` };
  }
  if (MIGRATION_PATTERN.test(file)) {
    return {
      tier: 'adversarial',
      reason: `${file} is a migration — one lens must be ${MIGRATION_LENS}, and src/test/database/ must be green`,
    };
  }
  if (NONE_PATTERNS.some(p => p.test(file))) {
    return { tier: 'none', reason: `${file} is documentation` };
  }
  // Everything else, INCLUDING unrecognised paths: fail safe, not fail cheap.
  return { tier: 'adversarial', reason: `${file} is application or tooling code` };
}

export function requiredTier(files: readonly string[]): { tier: Tier; reason: string } {
  if (files.length === 0) return { tier: 'adversarial', reason: 'no files' };
  // Seed from the first file's own candidate so `reason` always names a real
  // path for a non-empty list, even when every file resolves to 'none'.
  let best = floorFor(files[0]!);
  for (const file of files.slice(1)) {
    const candidate = floorFor(file);
    if (TIER_ORDER.indexOf(candidate.tier) > TIER_ORDER.indexOf(best.tier)) best = candidate;
  }
  return best;
}

export function meetsFloor(supplied: Tier, floor: Tier): boolean {
  return TIER_ORDER.indexOf(supplied) >= TIER_ORDER.indexOf(floor);
}

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Files changed against a base ref, for the CLI. */
export function changedFiles(base: string): string[] {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const baseIndex = process.argv.indexOf('--base');
  const base = baseIndex === -1 ? 'origin/main' : (process.argv[baseIndex + 1] ?? 'origin/main');
  const files = changedFiles(base);
  const { tier, reason } = requiredTier(files);
  console.log(`review-tier: ${files.length} file(s) vs ${base}`);
  console.log(`tier: ${tier}`);
  console.log(`reason: ${reason}`);
}
