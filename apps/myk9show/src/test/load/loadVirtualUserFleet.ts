import type { LoadSessionAssignment } from './loadAssignments';
import { LOAD_SHOWS } from './loadFixture';
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
  readonly onSample: (sample: VirtualUserRequestSample) => void;
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
  /** Sequences whose reader has seen at least one failed request. */
  private readonly failed = new Set<number>();

  constructor(
    assignments: readonly LoadSessionAssignment[],
    private readonly options: VirtualUserFleetOptions
  ) {
    for (const assignment of assignments) {
      const show = LOAD_SHOWS[assignment.target.showIndex];
      const role = assignment.role === 'exhibitor' ? 'exhibitor' : 'secretary';
      const user = new LoadVirtualUser(
          {
            supabaseUrl: options.supabaseUrl,
            anonKey: options.anonKey,
            accessToken: options.accessTokenFor(role, assignment.target.showIndex),
            showId: show.showId,
            // A reader replicates the trial its class belongs to. Staff readers
            // carry no owner scope, which is what makes their dog sync unscoped.
            trialId: assignment.target.trialId,
            role,
            ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
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
      ok: !this.failed.has(entry.assignment.sequence),
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
    for (const entry of this.entries) {
      entry.user.start(result => this.report(entry, result));
    }
  }

  stop(): void {
    for (const entry of this.entries) entry.user.stop();
  }

  private async syncAndReport(entry: FleetEntry): Promise<void> {
    try {
      this.report(entry, await entry.user.syncOnce());
    } catch {
      // A reader that threw is a failed reader, not an absent one.
      this.failed.add(entry.assignment.sequence);
    }
  }

  private report(entry: FleetEntry, result: VirtualUserSyncResult): void {
    for (const sample of result.samples) {
      if (!sample.ok) this.failed.add(entry.assignment.sequence);
      this.options.onSample(sample);
    }
  }
}
