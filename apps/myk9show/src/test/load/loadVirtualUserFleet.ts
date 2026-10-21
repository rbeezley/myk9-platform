import type { LoadSessionAssignment } from './loadAssignments';
import type { ApiErrorObservation } from './loadVirtualUserFetch';
import {
  LoadVirtualUser,
  type VirtualUserRequestSample,
  type VirtualUserSyncResult,
} from './loadVirtualUser';

/**
 * Constructs and drives the API-level readers for a shard.
 *
 * Kept out of `loadBrowserRunner` deliberately: that file is already over the
 * 500-line ceiling, and the runner's job is orchestration rather than knowing how
 * a virtual user is built.
 */

export interface VirtualUserFleetOptions {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /**
   * Access token per role AND show. An exhibitor reader must not read as staff,
   * and a staff reader for show N must carry show N's credential — a token from
   * another show would resolve a different `manageable_show_ids()`.
   */
  readonly accessTokenFor: (role: 'exhibitor' | 'secretary', showIndex: number) => string;
  /** Column list for the classes delta, mirroring the application's own. */
  readonly classColumnSelect: string;
  /** Count every pass (the app's `replicationCountCadence` flag off), for the A/B arm. */
  readonly countEveryPass?: boolean;
  readonly idScanEveryPass?: boolean;
  readonly onSample: (sample: VirtualUserRequestSample) => void;
  /** Every non-2xx response a reader's fetch saw, including retried ones. */
  readonly onApiError?: (observation: ApiErrorObservation) => void;
  /** A reader's tick was dropped because its previous pass was still running. */
  readonly onSkippedPass?: () => void;
  readonly fetchImpl?: typeof fetch;
}

/** One reader plus the assignment it stands for, so lifecycle counters can see it. */
interface FleetEntry {
  readonly assignment: LoadSessionAssignment;
  readonly user: LoadVirtualUser;
}

export interface VirtualUserOutcome {
  readonly assignment: LoadSessionAssignment;
  /** False once any request this reader issued failed. */
  readonly ok: boolean;
}

export class VirtualUserFleet {
  private readonly entries: FleetEntry[] = [];
  /**
   * Sequences whose reader completed at least one successful request.
   *
   * A session is failed only when it NEVER succeeded — an auth failure, say. A
   * single failed poll among many is a request-level event that the error-rate
   * and availability budgets already own; promoting it to a failed workflow
   * breaks evaluateLoadResult's `failedWorkflows === workflowFailures`
   * invariant, since recordWorkflowFailure fires only for browser sessions.
   */
  private readonly succeeded = new Set<number>();

  constructor(
    assignments: readonly LoadSessionAssignment[],
    private readonly options: VirtualUserFleetOptions
  ) {
    for (const assignment of assignments) {
      const role = assignment.role === 'exhibitor' ? 'exhibitor' : 'secretary';
      const user = new LoadVirtualUser(
        {
          supabaseUrl: options.supabaseUrl,
          anonKey: options.anonKey,
          accessToken: options.accessTokenFor(role, assignment.target.showIndex),
          role,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
          ...(options.countEveryPass ? { countEveryPass: true } : {}),
          ...(options.idScanEveryPass ? { idScanEveryPass: true } : {}),
          ...(options.onApiError ? { onApiError: options.onApiError } : {}),
        },
        options.classColumnSelect
      );
      this.entries.push({ assignment, user });
    }
  }

  get size(): number {
    return this.entries.length;
  }

  /**
   * Ticks dropped across the fleet because a reader's previous pass had not
   * finished. Nonzero means the target answered slower than the 60 s cadence, which
   * is itself a finding: the readers were backing off as the app does.
   */
  get skippedPasses(): number {
    return this.entries.reduce((total, entry) => total + entry.user.skippedPasses, 0);
  }

  /**
   * The assignments this fleet drives.
   *
   * The runner needs these to mark the readers prepared/started/finished. Without
   * it the lifecycle counted browser sessions only, so `concurrentSessions`
   * reported 110 of 358 and the G9 gate could never pass (MYK9-126).
   */
  get assignments(): readonly LoadSessionAssignment[] {
    return this.entries.map(entry => entry.assignment);
  }

  /** Per-reader result, for the lifecycle's completed/failed split. */
  outcomes(): readonly VirtualUserOutcome[] {
    return this.entries.map(entry => ({
      assignment: entry.assignment,
      ok: this.succeeded.has(entry.assignment.sequence),
    }));
  }

  /**
   * First pass for every reader, as a device does on open. Run before the
   * synchronized start so hydration is not measured as steady-state load.
   */
  async hydrate(): Promise<void> {
    await Promise.all(this.entries.map(entry => this.syncAndReport(entry)));
  }

  /** Begin the periodic delta polling every reader performs. */
  start(): void {
    // Hydration runs BEFORE the synchronized start and is deliberately excluded
    // from steady-state measurement, so it must not stand in for success either:
    // a token that expires after preparation would otherwise leave the reader
    // marked completed with no successful measured request behind it.
    this.succeeded.clear();
    for (const entry of this.entries) {
      entry.user.start(
        result => this.report(entry, result),
        () => {
          /* A throwing poll adds no success; the outcome stays as it was. */
        },
        () => this.options.onSkippedPass?.()
      );
    }
  }

  stop(): void {
    for (const entry of this.entries) entry.user.stop();
  }

  /** Settles polls already running when stop() was called, before outcomes(). */
  async drain(): Promise<void> {
    await Promise.all(this.entries.map(entry => entry.user.drain()));
  }

  private async syncAndReport(entry: FleetEntry): Promise<void> {
    try {
      this.report(entry, await entry.user.syncOnce());
    } catch {
      /* A throwing sync records no success; the reader stays failed. */
    }
  }

  private report(entry: FleetEntry, result: VirtualUserSyncResult): void {
    for (const sample of result.samples) {
      if (sample.ok) this.succeeded.add(entry.assignment.sequence);
      this.options.onSample(sample);
    }
  }
}
