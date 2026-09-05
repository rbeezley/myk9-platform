/**
 * Review gate — a commit status on a PR's head that is green ONLY when an
 * independent review has been recorded against THAT SHA.
 *
 * Why a status, and why pinned to the SHA: on 2026-09-05 PR #2040 was
 * squash-merged while its Codex review was still running; the review then
 * returned two real P2 findings, both already on `main`. Nothing was red —
 * every CI check passed and `codex review` exits 0 whether it found defects,
 * was interrupted by a usage limit, or never ran. "The review must happen"
 * had quietly become "the review must happen at some point". The evidence
 * the shipping skill records is a PR comment of the form
 *
 *   Review gate: codex reviewed 0a2020c7a..5af9af158 — no findings
 *
 * and this script turns that into a `Review gate` status on the head commit.
 * A push after the review moves the head, the recorded SHA no longer matches,
 * and the status goes red until a review is recorded for the new head. That
 * is the whole point: a review of an earlier head is an audit, not a gate.
 *
 * Deliberate limits: the comment is written by the agent that ran the review,
 * so this proves a review was CLAIMED for this SHA, not that its log was read.
 * It closes the "merged before the review finished" and "reviewed an older
 * head" holes, which are the two that have actually fired. Only a comment
 * whose FIRST line is the evidence line counts — a quoted, indented or
 * mid-comment copy of the format is not evidence, because prose about code
 * satisfies a text scan. And the verdict must match the documented grammar
 * exactly: substring tests accepted "2 findings, not all addressed" and
 * "no findings yet; review still running" as green (Codex review of #2058).
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const REVIEW_GATE_CONTEXT = 'Review gate';

export interface GateComment {
  body: string;
  createdAt: string;
  author?: string;
}

export interface GateEvidence {
  reviewer: 'codex' | 'claude';
  base: string;
  head: string;
  verdict: string;
  createdAt: string;
}

export interface GateResult {
  state: 'success' | 'failure';
  description: string;
  evidence?: GateEvidence;
}

/**
 * The evidence line. Must be the FIRST line of the comment (the workflow's
 * trigger filter uses the same rule); the dash accepts em, en or hyphen.
 */
export const REVIEW_GATE_LINE =
  /^Review gate: (codex|claude) reviewed ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40})\s+[—–-]\s+(.+?)\s*$/m;

/**
 * The ONLY verdicts that are green, matched against the whole remainder of
 * the line. Anything else — a parenthetical, "not all addressed", "no findings
 * yet", a log excerpt — is red by default. Extra detail belongs on the
 * comment's later lines, not in the verdict.
 */
export const CLEAN_VERDICT = /^(no findings|\d+ findings?, all (addressed|fixed))\.?$/i;

export function parseGateComments(comments: readonly GateComment[]): GateEvidence[] {
  const out: GateEvidence[] = [];
  for (const comment of comments) {
    const firstLine = comment.body.split(/\r?\n/, 1)[0] ?? '';
    const match = REVIEW_GATE_LINE.exec(firstLine);
    if (!match) continue;
    const [, reviewer, base, head, verdict] = match;
    out.push({
      reviewer: reviewer as GateEvidence['reviewer'],
      base,
      head,
      verdict,
      createdAt: comment.createdAt,
    });
  }
  return out;
}

export function verdictAccepted(verdict: string): boolean {
  return CLEAN_VERDICT.test(verdict.trim());
}

export function evaluateReviewGate(input: {
  headSha: string;
  comments: readonly GateComment[];
}): GateResult {
  const head = input.headSha.toLowerCase();
  const short = head.slice(0, 9);
  const forHead = parseGateComments(input.comments)
    .filter(e => head.startsWith(e.head.toLowerCase()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = forHead.at(-1);
  if (!latest) {
    return {
      state: 'failure',
      description: `no independent review recorded for ${short} — run the gate (ship-pr Step 4) against this head`,
    };
  }
  if (!verdictAccepted(latest.verdict)) {
    return {
      state: 'failure',
      description: `${latest.reviewer} review of ${short} is not clean: ${latest.verdict}`,
      evidence: latest,
    };
  }
  return {
    state: 'success',
    description: `${latest.reviewer} reviewed ${latest.base.slice(0, 9)}..${short}: ${latest.verdict}`,
    evidence: latest,
  };
}

/** GitHub caps a status description at 140 characters. */
export function clampDescription(text: string): string {
  return text.length <= 140 ? text : `${text.slice(0, 137)}...`;
}

function gh(args: string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8' });
}

interface PrView {
  headRefOid: string;
  isDraft: boolean;
  comments: { body: string; createdAt: string; author: { login: string } }[];
}

export function runCli(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): number {
  const prNumber = env.PR_NUMBER;
  const repo = env.REPO;
  if (!prNumber || !repo) {
    console.error('review-gate: PR_NUMBER and REPO are required');
    return 2;
  }
  const view = JSON.parse(
    gh(['pr', 'view', prNumber, '--repo', repo, '--json', 'headRefOid,isDraft,comments'])
  ) as PrView;
  if (view.isDraft) {
    console.log(`review-gate: PR #${prNumber} is a draft — no status posted`);
    return 0;
  }
  const result = evaluateReviewGate({
    headSha: view.headRefOid,
    comments: view.comments.map(c => ({
      body: c.body,
      createdAt: c.createdAt,
      author: c.author?.login,
    })),
  });
  const description = clampDescription(result.description);
  console.log(`review-gate: ${view.headRefOid} -> ${result.state}: ${description}`);
  if (argv.includes('--dry-run')) return result.state === 'success' ? 0 : 1;
  const fields = [
    '-f',
    `state=${result.state}`,
    '-f',
    `context=${REVIEW_GATE_CONTEXT}`,
    '-f',
    `description=${description}`,
  ];
  if (env.RUN_URL) fields.push('-f', `target_url=${env.RUN_URL}`);
  gh(['api', '--method', 'POST', `repos/${repo}/statuses/${view.headRefOid}`, ...fields]);
  // The status carries the verdict; the job itself succeeds either way so a
  // red gate reads as "review missing", never as "the checker crashed".
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli();
}
