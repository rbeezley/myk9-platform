/**
 * Durable handoff events for agent runs (MYK9-1397;
 * docs/plan-cloud-agent-workflow.md Task 1.2).
 *
 * A run's checkpoints live as append-only marked comments in the PR thread,
 * so a fresh session, local or cloud, can rebuild the issue, current head,
 * owner, evidence and next step from GitHub alone. Detailed reports stay in
 * scanned Actions artifacts; an event only points at them.
 *
 * A reconciled snapshot is never authorization: it says what the record
 * shows, and merges still need a person's go-ahead on the exact head.
 */
import { createHash } from 'node:crypto';

export type Harness = 'claude' | 'codex';

export type Phase =
  'implementing' | 'implemented' | 'reviewing' | 'reviewed' | 'needs-human' | 'closed-out';

export type EventResult = 'pending' | 'clean' | 'findings' | 'incomplete';

export type EvidencePointer =
  | { kind: 'artifact'; runId: string; attempt: number; name: string; digest: string }
  | { kind: 'url'; url: string };

export type HandoffEvent = {
  version: 1;
  eventId: string;
  runId: string;
  /** The event this one follows; null only for the first event in a ledger. */
  parentEventId: string | null;
  issue: string;
  pr: number | null;
  branch: string;
  baseSha: string;
  headSha: string;
  authorHarness: Harness;
  reviewerHarness: Harness;
  /** The owning session or workflow run. */
  ownerUrl: string;
  phase: Phase;
  result: EventResult;
  evidence: EvidencePointer[];
  unmetCriteria: string[];
  nextAction: string;
};

export type LiveState = {
  prState: 'open' | 'merged' | 'closed';
  headSha: string;
  /** Availability keyed by `artifactKey`; an absent key reads as missing. */
  artifacts: Record<string, 'available' | 'expired' | 'missing' | 'mismatched'>;
  /**
   * The latest event's owning run, from the provider or Actions API. `unknown`
   * is NOT proof it ended: no process age, missing file or expired VM ends
   * another owner's run. `gone` means the API confirmed the run record no
   * longer exists, so only its owner can say how far it got.
   */
  ownerRun: 'running' | 'ended' | 'unknown' | 'gone';
};

export type Decision = 'continue' | 'wait' | 'needs-human' | 'complete';

export type Reconciliation = {
  decision: Decision;
  reason: string;
  latestEventId: string | null;
  nextAction: string;
  /** True only for a clean result on the current head with every artifact available. */
  cleanEvidence: boolean;
};

export const EVENT_MARKER = '<!-- myk9-handoff:v1 -->';

/** On a public repository anyone can comment; only these associations write the ledger. */
const TRUSTED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const RUNNING_PHASES = new Set<Phase>(['implementing', 'reviewing']);

const PHASES = new Set<string>([
  'implementing',
  'implemented',
  'reviewing',
  'reviewed',
  'needs-human',
  'closed-out',
]);
const RESULTS = new Set<string>(['pending', 'clean', 'findings', 'incomplete']);
const HARNESSES = new Set<string>(['claude', 'codex']);
const SHA = /^[0-9a-f]{40}$/;

/** JSON with object keys sorted at every depth, so equal content hashes equally. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Content-addressed, so a re-sent event dedupes and an edited one no longer matches. */
export function makeEventId(event: Omit<HandoffEvent, 'eventId'> | HandoffEvent): string {
  const content: Record<string, unknown> = { ...event };
  delete content.eventId;
  return `evt_${createHash('sha256').update(canonicalJson(content)).digest('hex').slice(0, 24)}`;
}

/**
 * One key per piece of evidence. The digest is part of it: two pointers that
 * share a name, run and attempt are different evidence, and an available one
 * must never answer for the other.
 */
export function artifactKey(pointer: {
  name: string;
  runId: string;
  attempt: number;
  digest: string;
}): string {
  return `${pointer.name}@${pointer.runId}.${pointer.attempt}#${pointer.digest}`;
}

export function formatEventComment(event: HandoffEvent): string {
  const summary =
    `**Handoff** \`${event.phase}\` · ${event.result} · head \`${event.headSha.slice(0, 9)}\`` +
    ` · next: ${event.nextAction}`;
  return `${EVENT_MARKER}\n${summary}\n\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``;
}

function isEvidence(value: unknown): value is EvidencePointer {
  if (typeof value !== 'object' || value === null) return false;
  const pointer = value as Record<string, unknown>;
  if (pointer.kind === 'url') return typeof pointer.url === 'string';
  return (
    pointer.kind === 'artifact' &&
    typeof pointer.runId === 'string' &&
    typeof pointer.attempt === 'number' &&
    typeof pointer.name === 'string' &&
    typeof pointer.digest === 'string'
  );
}

function isHandoffEvent(value: unknown): value is HandoffEvent {
  if (typeof value !== 'object' || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    event.version === 1 &&
    typeof event.eventId === 'string' &&
    typeof event.runId === 'string' &&
    (event.parentEventId === null || typeof event.parentEventId === 'string') &&
    typeof event.issue === 'string' &&
    (event.pr === null || typeof event.pr === 'number') &&
    typeof event.branch === 'string' &&
    typeof event.baseSha === 'string' &&
    SHA.test(event.baseSha) &&
    typeof event.headSha === 'string' &&
    SHA.test(event.headSha) &&
    HARNESSES.has(event.authorHarness as string) &&
    HARNESSES.has(event.reviewerHarness as string) &&
    typeof event.ownerUrl === 'string' &&
    PHASES.has(event.phase as string) &&
    RESULTS.has(event.result as string) &&
    Array.isArray(event.evidence) &&
    event.evidence.every(isEvidence) &&
    Array.isArray(event.unmetCriteria) &&
    event.unmetCriteria.every(item => typeof item === 'string') &&
    typeof event.nextAction === 'string'
  );
}

export type EventComment = { body: string; authorAssociation: string };

/**
 * Events from trusted, well-formed, untampered marked comments. `rejected`
 * counts every marked comment left out; `invalid` counts the subset written by
 * a trusted author yet malformed, tampered or (when `pr` is given) recorded
 * for another PR. Untrusted noise is harmless; an invalid trusted record means
 * the ledger itself can no longer be read with confidence.
 */
export function parseEventComments(
  comments: readonly EventComment[],
  options: { pr?: number } = {}
): { events: HandoffEvent[]; rejected: number; invalid: number } {
  const events: HandoffEvent[] = [];
  let rejected = 0;
  let invalid = 0;
  for (const comment of comments) {
    if (!comment.body.startsWith(EVENT_MARKER)) continue;
    const json = /```json\n([\s\S]*?)\n```/.exec(comment.body)?.[1];
    let parsed: unknown;
    try {
      parsed = json === undefined ? undefined : JSON.parse(json);
    } catch {
      parsed = undefined;
    }
    if (!TRUSTED_ASSOCIATIONS.has(comment.authorAssociation)) {
      rejected++;
      continue;
    }
    if (
      !isHandoffEvent(parsed) ||
      makeEventId(parsed) !== parsed.eventId ||
      (options.pr !== undefined && parsed.pr !== options.pr)
    ) {
      rejected++;
      invalid++;
      continue;
    }
    events.push(parsed);
  }
  return { events, rejected, invalid };
}

type Ledger = { tip: HandoffEvent | null; fork: string | null };

/** Follows parent links from the root; any branching is a fork, never silently resolved. */
function walkLedger(events: readonly HandoffEvent[]): Ledger {
  const unique = new Map<string, HandoffEvent>();
  for (const event of events) if (!unique.has(event.eventId)) unique.set(event.eventId, event);
  const children = new Map<string | null, HandoffEvent[]>();
  for (const event of unique.values()) {
    const siblings = children.get(event.parentEventId) ?? [];
    siblings.push(event);
    children.set(event.parentEventId, siblings);
  }
  let tip: HandoffEvent | null = null;
  let parent: string | null = null;
  let visited = 0;
  for (;;) {
    const next: HandoffEvent[] = children.get(parent) ?? [];
    if (next.length > 1) return { tip, fork: `fork after ${parent ?? 'the root'}` };
    const [only] = next;
    if (!only) break;
    tip = only;
    parent = only.eventId;
    visited++;
  }
  if (visited !== unique.size) return { tip, fork: 'fork: events unreachable from the root' };
  return { tip, fork: null };
}

/** The latest event on an unforked ledger, or null. */
export function ledgerTip(events: readonly HandoffEvent[]): HandoffEvent | null {
  const { tip, fork } = walkLedger(events);
  return fork ? null : tip;
}

export type AppendOutcome =
  | { kind: 'append'; event: HandoffEvent }
  | { kind: 'duplicate' }
  | { kind: 'stale'; reason: string };

/**
 * Re-read the ledger immediately before writing. Only a child of the current
 * tip may be appended, so a session resuming from an old snapshot cannot
 * overwrite what happened since.
 */
export function prepareAppend(events: readonly HandoffEvent[], next: HandoffEvent): AppendOutcome {
  if (events.some(event => event.eventId === next.eventId)) return { kind: 'duplicate' };
  const { tip, fork } = walkLedger(events);
  if (fork) return { kind: 'stale', reason: fork };
  const expected = tip?.eventId ?? null;
  if (next.parentEventId !== expected) {
    return {
      kind: 'stale',
      reason: `parent ${next.parentEventId ?? 'null'} is not the latest event ${expected ?? 'null'}`,
    };
  }
  return { kind: 'append', event: next };
}

export function reconcileHandoff(
  events: readonly HandoffEvent[],
  live: LiveState,
  options: { invalidRecords?: number } = {}
): Reconciliation {
  const { tip, fork } = walkLedger(events);
  const verdict = (decision: Decision, reason: string, nextAction: string, clean = false) => ({
    decision,
    reason,
    latestEventId: tip?.eventId ?? null,
    nextAction,
    cleanEvidence: clean,
  });

  if (!tip) return verdict('needs-human', 'no handoff events recorded', 'ask the owner');
  if (fork) return verdict('needs-human', fork, 'resolve concurrent writers');
  // An invalid trusted record may be the latest event, so nothing older is
  // reported as current, clean evidence included.
  if ((options.invalidRecords ?? 0) > 0) {
    return verdict(
      'needs-human',
      `${options.invalidRecords} invalid trusted ledger record(s)`,
      'reconcile the ledger by hand'
    );
  }
  if (tip.phase === 'needs-human') return verdict('needs-human', 'ledger asked', tip.nextAction);
  if (live.prState === 'closed')
    return verdict('needs-human', 'PR closed unmerged', 'ask the owner');

  // Every decision below speaks for one version of the branch, so it is only
  // made from an event recorded at the head GitHub holds now. The one ordering
  // exception is a run still in progress on an open PR: an implementer moves
  // the head itself while it works.
  const headMoved = tip.headSha !== live.headSha;

  if (live.prState === 'merged') {
    if (headMoved) {
      return verdict(
        'continue',
        `merged at ${live.headSha}, but the ledger's latest event is for ${tip.headSha}`,
        `review and close out the merged head ${live.headSha}`
      );
    }
    if (tip.phase !== 'closed-out') {
      return verdict('continue', 'merged; close-out not recorded', 'run the Linear close-out');
    }
    if (tip.result !== 'clean' || tip.unmetCriteria.length > 0) {
      const owed = tip.unmetCriteria.length > 0 ? `: ${tip.unmetCriteria.join('; ')}` : '';
      return verdict(
        'continue',
        `close-out recorded as ${tip.result} with ${tip.unmetCriteria.length} unmet criteria`,
        `finish the close-out${owed}`
      );
    }
    return verdict('complete', 'merged and closed out', 'none');
  }

  if (RUNNING_PHASES.has(tip.phase)) {
    if (live.ownerRun === 'running' || live.ownerRun === 'unknown') {
      return verdict('wait', `${tip.ownerUrl} may still be running`, 'wait for the owner');
    }
    if (live.ownerRun === 'gone') {
      return verdict(
        'needs-human',
        `${tip.ownerUrl} no longer exists`,
        `ask the owner whether to replace the incomplete ${tip.phase} attempt`
      );
    }
    return verdict('continue', 'owner run ended', `replace the incomplete ${tip.phase} attempt`);
  }

  if (headMoved) {
    return verdict(
      'continue',
      `head moved from ${tip.headSha} to ${live.headSha}`,
      `review the current head ${live.headSha}`
    );
  }
  const unavailable = tip.evidence.filter(
    pointer =>
      pointer.kind === 'artifact' &&
      (live.artifacts[artifactKey(pointer)] ?? 'missing') !== 'available'
  );
  if (unavailable.length > 0) {
    return verdict(
      'continue',
      'evidence unavailable (expired or missing)',
      'coordinate a replacement review attempt'
    );
  }
  return verdict(
    'continue',
    'resuming from the latest event',
    tip.nextAction,
    tip.result === 'clean'
  );
}
