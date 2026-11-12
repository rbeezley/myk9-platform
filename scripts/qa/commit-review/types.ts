/**
 * Versioned run record for the nightly commit review (MYK9-1890).
 *
 * The record lives on disk outside the worker, so compaction, worker
 * termination and controller restart cannot lose progress. Source-review
 * completion, verification limitations, Linear filing and publication are
 * separate fields on purpose: none of them can stand in for another.
 */
export const SCHEMA_VERSION = 1;

export interface Evidence {
  reviewedAt: string;
  notes?: string;
  findingRefs?: string[];
}

export interface CommitEntry {
  sha: string;
  status: 'unreviewed' | 'reviewed';
  evidence?: Evidence;
}

export type LinearState = 'filed' | 'unfiled' | 'not-needed';

export interface Finding {
  id: string;
  actionable: boolean;
  linear: { state: LinearState; issueId?: string; error?: string };
}

export type PublicationState = 'pending' | 'committed' | 'pushed' | 'readback-ok' | 'failed';

export interface Publication {
  state: PublicationState;
  commitSha?: string;
  error?: string;
}

export interface RunRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  runId: string;
  createdAt: string;
  /** fromSha is exclusive; toSha is the target SHA frozen after fetch. */
  boundary: { fromSha: string; toSha: string };
  /** Ordered oldest to newest, exactly `git rev-list --reverse fromSha..toSha`. */
  inventory: string[];
  commits: CommitEntry[];
  findings: Finding[];
  verificationLimitations: string[];
  publication: Publication;
  /**
   * Controller bookkeeping (MYK9-1891). Optional and additive, so schemaVersion
   * stays 1 and records written by part 1 remain valid unchanged.
   */
  controller?: ControllerState;
}

export type AttemptClass = 'ok' | 'no-progress' | 'transient' | 'permanent';

export interface Attempt {
  n: number;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  sessionId?: string;
  reviewedBefore: number;
  reviewedAfter: number;
  prefixBefore: number;
  prefixAfter: number;
  classification: AttemptClass;
  error?: string;
}

export interface ControllerState {
  /** Codex session the next attempt resumes. */
  sessionId?: string;
  attempts: Attempt[];
}

export type OutcomeKind = 'complete' | 'complete-empty' | 'incomplete' | 'blocked';

export interface Outcome {
  outcome: OutcomeKind;
  targetSha: string | null;
  total: number;
  reviewed: number;
  unreviewed: number;
  contiguousReviewedPrefix: { count: number; lastSha: string | null };
  remainingShas: string[];
  issueRefs: string[];
  filingBlockers: string[];
  verificationLimitations: string[];
  publication: Publication | null;
  reasons: string[];
}

/** Injected so tests need no repository. Returns trimmed stdout, throws on failure. */
export type GitFn = (args: string[]) => string;
