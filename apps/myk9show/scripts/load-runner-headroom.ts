#!/usr/bin/env tsx
/**
 * Preflight gate: refuse the G9 rehearsal unless the ACCOUNT has room for a
 * synchronized start (NCR-2026-08-27-01).
 *
 * Runs before the canonical reseed, so refusing here is cheap and refusing
 * later is not. See src/test/load/loadRunnerHeadroom.ts for why a partial count
 * is never rounded down into a pass.
 *
 * Credential: GITHUB_TOKEN inside Actions is scoped to the running repository
 * and cannot enumerate the account, so this reads HEADROOM_GITHUB_TOKEN — a
 * fine-grained PAT with Actions: read-only and Metadata: read-only on ALL
 * repositories. Without it the account-wide claim cannot be made, and the gate
 * refuses rather than silently narrowing to one repository.
 */

import {
  collectAccountJobCounts,
  evaluateHeadroom,
  type GitHubReader,
} from '../src/test/load/loadRunnerHeadroom';

const GITHUB_API = 'https://api.github.com';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is not set.`);
    process.exit(1);
  }
  return value;
}

function requireCount(name: string): number {
  const raw = requireEnv(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`${name} must be a positive integer; received "${raw}".`);
    process.exit(1);
  }
  return value;
}

function createReader(token: string): GitHubReader {
  return async (path: string) => {
    const response = await fetch(`${GITHUB_API}/${path}`, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return response.json();
  };
}

async function main(): Promise<void> {
  const token = process.env.HEADROOM_GITHUB_TOKEN;
  if (!token) {
    console.error(
      'HEADROOM_GITHUB_TOKEN is not configured. The concurrent-job ceiling is ' +
        'account-wide, and the Actions-issued GITHUB_TOKEN can only see this ' +
        'repository, so account-wide capacity cannot be verified.\n' +
        'Create a fine-grained personal access token with Actions: read-only and ' +
        'Metadata: read-only on all repositories, store it as the repository secret ' +
        'HEADROOM_GITHUB_TOKEN, and re-dispatch.'
    );
    process.exit(1);
  }

  const shardCount = requireCount('LOAD_TEST_SHARD_COUNT');
  const ceiling = requireCount('LOAD_TEST_CONCURRENCY_CEILING');
  const currentRepo = requireEnv('GITHUB_REPOSITORY');
  const currentRunId = requireEnv('GITHUB_RUN_ID');

  const collected = await collectAccountJobCounts({
    read: createReader(token),
    currentRepo,
    currentRunId,
  });

  // +1 for the platform sampler that runs alongside the shards.
  const required = shardCount + 1;
  const verdict = evaluateHeadroom({
    ceiling,
    required,
    currentRepo,
    repos: collected.repos,
    inventory: collected.inventory,
    unreadableRepos: collected.unreadableRepos,
    publicRepoAudit: collected.publicRepoAudit,
  });

  for (const repo of collected.repos) {
    console.log(`  ${repo.fullName}: ${repo.activeJobs} active job(s)`);
  }

  if (!verdict.ok) {
    console.error(verdict.reason);
    process.exit(1);
  }

  console.log(
    `Account-wide active jobs: ${verdict.busy}; free of ${ceiling}: ${verdict.free}; ` +
      `required: ${required}.`
  );
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
