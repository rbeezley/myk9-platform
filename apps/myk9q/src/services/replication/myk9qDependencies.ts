/**
 * myK9Q Replication Dependencies Provider
 *
 * Provides app-specific implementations for the @myk9/replication package.
 * This enables myK9Q to use the shared replication infrastructure while
 * maintaining its own logging, TTL configuration, and feature flags.
 *
 * Created as part of DEBT-003: Eliminate replication duplication
 */

import { logger } from '@/utils/logger';
import { getTableTTL as getTableTTLImpl } from '@/config/featureFlags';
import type { ReplicatedTableDependencies, GetTableTTL, Logger } from '@myk9/replication';
import type { ReplicatedTableName } from '@/config/featureFlags';

/**
 * Type-safe wrapper for feature flag TTL function.
 *
 * The package uses a generic string parameter while myK9Q uses
 * a strict ReplicatedTableName union type. This wrapper bridges
 * the two interfaces safely.
 */
const getTableTTL: GetTableTTL = (tableName: string): number => {
  return getTableTTLImpl(tableName as ReplicatedTableName);
};

/**
 * Adapter to ensure @myk9/core logger matches package Logger interface.
 * The @myk9/core logger is compatible, but this makes the types explicit.
 */
const loggerAdapter: Logger = {
  log: (...args: unknown[]) => logger.log(...args),
  warn: (...args: unknown[]) => logger.warn(...args),
  error: (...args: unknown[]) => logger.error(...args),
  debug: (...args: unknown[]) => logger.debug?.(...args),
};

/**
 * myK9Q-specific dependencies for ReplicatedTable instances.
 *
 * Usage:
 * ```typescript
 * import { myk9qReplicationDependencies } from '../myk9qDependencies';
 *
 * export class ReplicatedClassesTable extends ReplicatedTable<Class> {
 *   constructor() {
 *     super('classes', undefined, myk9qReplicationDependencies);
 *   }
 * }
 * ```
 */
export const myk9qReplicationDependencies: ReplicatedTableDependencies = {
  logger: loggerAdapter,
  getTableTTL,
  // logDiagnostics is optional - package uses noopDiagnostics if not provided
};
