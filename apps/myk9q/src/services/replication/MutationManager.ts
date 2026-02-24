/**
 * Re-export shared MutationManager from @myk9/replication
 *
 * The MutationManager was extracted from this module into the shared
 * @myk9/replication package. This file maintains backward compatibility
 * for existing imports within myK9Q.
 */

export { MutationManager, type MutationManagerOptions } from '@myk9/replication';

// Legacy alias for backward compatibility
export type MutationManagerConfig = import('@myk9/replication').MutationManagerOptions;
