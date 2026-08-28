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

export class VirtualUserFleet {
  private readonly users: LoadVirtualUser[] = [];

  constructor(
    assignments: readonly LoadSessionAssignment[],
    private readonly options: VirtualUserFleetOptions
  ) {
    for (const assignment of assignments) {
      const show = LOAD_SHOWS[assignment.target.showIndex];
      const role = assignment.role === 'exhibitor' ? 'exhibitor' : 'secretary';
      this.users.push(
        new LoadVirtualUser(
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
        )
      );
    }
  }

  get size(): number {
    return this.users.length;
  }

  /**
   * First pass for every reader, as a device does on open. Run before the
   * synchronized start so hydration is not measured as steady-state load.
   */
  async hydrate(): Promise<void> {
    await Promise.all(this.users.map(user => this.syncAndReport(user)));
  }

  /** Begin the periodic delta polling every reader performs. */
  start(): void {
    for (const user of this.users) {
      user.start(result => this.report(result));
    }
  }

  stop(): void {
    for (const user of this.users) user.stop();
  }

  private async syncAndReport(user: LoadVirtualUser): Promise<void> {
    this.report(await user.syncOnce());
  }

  private report(result: VirtualUserSyncResult): void {
    for (const sample of result.samples) this.options.onSample(sample);
  }
}
