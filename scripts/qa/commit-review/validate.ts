import type { CommitEntry, GitFn, Outcome, RunRecord } from './types';
import { isRecordShape } from './store';

const PUBLICATION_STATES = ['pending', 'committed', 'pushed', 'readback-ok', 'failed'];

function blockedOutcome(reasons: string[], record?: Partial<RunRecord>): Outcome {
  return {
    outcome: 'blocked',
    targetSha: record?.boundary?.toSha ?? null,
    total: 0,
    reviewed: 0,
    unreviewed: 0,
    contiguousReviewedPrefix: { count: 0, lastSha: null },
    remainingShas: [],
    issueRefs: [],
    filingBlockers: [],
    verificationLimitations: [],
    publication: record?.publication ?? null,
    reasons,
  };
}

function hasEvidence(entry: CommitEntry): boolean {
  const e = entry.evidence;
  if (!e || typeof e.reviewedAt !== 'string' || Number.isNaN(Date.parse(e.reviewedAt)))
    return false;
  const notes = typeof e.notes === 'string' && e.notes.trim().length > 0;
  const refs = Array.isArray(e.findingRefs) && e.findingRefs.length > 0;
  return notes || refs;
}

function duplicates(shas: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const s of shas) (seen.has(s) ? dups : seen).add(s);
  return [...dups];
}

function checkInventory(record: RunRecord, git: GitFn, reasons: string[]): void {
  const { fromSha, toSha } = record.boundary;
  let gitInventory: string[] = [];
  try {
    const resolved = git(['rev-parse', '--verify', `${toSha}^{commit}`]);
    if (resolved !== toSha)
      reasons.push(`target SHA ${toSha} is not a full commit SHA (resolves to ${resolved})`);
    if (fromSha !== toSha) {
      const out = git(['rev-list', '--reverse', `${fromSha}..${toSha}`]);
      gitInventory = out
        ? out
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean)
        : [];
    }
  } catch (err) {
    reasons.push(`git could not list the window ${fromSha}..${toSha}: ${(err as Error).message}`);
  }

  const gitSet = new Set(gitInventory);
  const recInv = record.inventory;
  const entryShas = record.commits.map(c => c?.sha);

  for (const d of duplicates(recInv)) reasons.push(`duplicate SHA in inventory: ${d}`);
  for (const d of duplicates(entryShas)) reasons.push(`duplicate SHA in commit entries: ${d}`);
  for (const s of recInv.filter(s => !gitSet.has(s)))
    reasons.push(`out-of-range SHA in inventory: ${s}`);
  for (const s of gitInventory.filter(s => !recInv.includes(s)))
    reasons.push(`missing SHA in inventory: ${s}`);
  if (
    !reasons.some(r => /^(duplicate|out-of-range|missing) SHA in inventory/.test(r)) &&
    recInv.join() !== gitInventory.join()
  ) {
    reasons.push('inventory order differs from git rev-list --reverse');
  }
  if (entryShas.join() !== recInv.join()) {
    for (const s of entryShas.filter(s => !recInv.includes(s)))
      reasons.push(`commit entry outside inventory: ${s}`);
    for (const s of recInv.filter(s => !entryShas.includes(s)))
      reasons.push(`inventory SHA has no commit entry: ${s}`);
    if (
      !reasons.some(r => r.startsWith('commit entry') || r.startsWith('inventory SHA has')) &&
      !duplicates(entryShas).length
    ) {
      reasons.push('commit entries are not in inventory order');
    }
  }
}

function checkEntries(record: RunRecord, reasons: string[]): void {
  const findingIds = new Set(record.findings.map(f => f.id));
  for (const c of record.commits) {
    if (c.status === 'reviewed') {
      if (!hasEvidence(c)) reasons.push(`commit ${c.sha} is marked reviewed without evidence`);
      for (const ref of c.evidence?.findingRefs ?? []) {
        if (!findingIds.has(ref)) reasons.push(`commit ${c.sha} cites unknown finding ${ref}`);
      }
    } else if (c.status !== 'unreviewed') {
      reasons.push(`commit ${c.sha} has invalid status`);
    }
  }
}

function checkFindings(
  record: RunRecord,
  reasons: string[]
): { filingBlockers: string[]; issueRefs: string[] } {
  const filingBlockers: string[] = [];
  const issueRefs: string[] = [];
  for (const f of record.findings) {
    if (!f.actionable) continue;
    const { state, issueId } = f.linear ?? {};
    if (state === 'filed') {
      if (issueId) issueRefs.push(issueId);
      else reasons.push(`finding ${f.id} is marked filed without an issue id`);
    } else if (state === 'unfiled') {
      filingBlockers.push(f.id);
    } else {
      reasons.push(`actionable finding ${f.id} has linear state ${String(state)}`);
    }
  }

  return { filingBlockers, issueRefs };
}

/**
 * Independent of any worker prose: recomputes the inventory from git and
 * judges only the on-disk record. Anything missing or inconsistent fails closed.
 */
export function validateRecord(raw: unknown, git: GitFn): Outcome {
  if (!isRecordShape(raw))
    return blockedOutcome(['record is missing required fields or has the wrong schemaVersion']);
  const record = raw;
  const { toSha } = record.boundary;
  const reasons: string[] = [];

  checkInventory(record, git, reasons);
  checkEntries(record, reasons);
  const { filingBlockers, issueRefs } = checkFindings(record, reasons);
  const pub = record.publication;
  if (!PUBLICATION_STATES.includes(pub.state))
    reasons.push(`invalid publication state ${pub.state}`);

  const consistent = reasons.length === 0;
  const reviewedEntries = record.commits.filter(c => c.status === 'reviewed' && hasEvidence(c));
  let prefix = 0;
  for (const c of record.commits) {
    if (c.status === 'reviewed' && hasEvidence(c)) prefix++;
    else break;
  }
  const total = record.inventory.length;
  const remainingShas = record.commits
    .filter(c => !(c.status === 'reviewed' && hasEvidence(c)))
    .map(c => c.sha);

  const base: Outcome = {
    outcome: 'blocked',
    targetSha: toSha,
    total,
    reviewed: reviewedEntries.length,
    unreviewed: total - reviewedEntries.length,
    contiguousReviewedPrefix: {
      count: prefix,
      lastSha: prefix ? (record.commits[prefix - 1]?.sha ?? null) : null,
    },
    remainingShas,
    issueRefs,
    filingBlockers,
    verificationLimitations: record.verificationLimitations,
    publication: pub,
    reasons,
  };

  if (!consistent) return base;
  if (filingBlockers.length) {
    base.reasons.push(
      `actionable finding(s) could not be filed in Linear: ${filingBlockers.join(', ')}`
    );
    return base;
  }
  if (pub.state === 'failed') {
    base.reasons.push(`publication failed: ${pub.error ?? 'no error recorded'}`);
    return base;
  }
  if (remainingShas.length) {
    base.outcome = 'incomplete';
    base.reasons.push(`${remainingShas.length} of ${total} commits still unreviewed`);
    return base;
  }
  if (pub.state !== 'readback-ok') {
    base.outcome = 'incomplete';
    base.reasons.push(`publication is ${pub.state}, not readback-ok`);
    return base;
  }
  base.outcome = total === 0 ? 'complete-empty' : 'complete';
  return base;
}
