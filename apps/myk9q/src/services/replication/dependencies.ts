/**
 * Dependency Injection interfaces for ReplicatedTable
 *
 * This allows for easy testing by injecting mock dependencies
 * while using real implementations in production.
 */

import { DEFAULT_TTL_MS } from './replicationConstants';
import type { ReplicatedTableName } from '@/config/featureFlags';

// Re-export for convenience
export type { ReplicatedTableName };

/**
 * Logger interface - matches the structure of @/utils/logger
 */
export interface Logger {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

/**
 * Diagnostic report structure
 */
export interface DiagnosticReport {
  timestamp?: number;
  error?: Error | string;
  context?: Record<string, unknown>;
}

/**
 * TTL provider function type
 */
export type GetTableTTL = (tableName: ReplicatedTableName) => number;

/**
 * Diagnostics logger function type
 */
export type LogDiagnostics = (report: DiagnosticReport) => void | Promise<void>;

/**
 * All injectable dependencies for ReplicatedTable
 */
export interface ReplicatedTableDependencies {
  logger?: Logger;
  getTableTTL?: GetTableTTL;
  logDiagnostics?: LogDiagnostics;
}

/**
 * Default no-op logger for testing
 */
export const noopLogger: Logger = {
  log: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/**
 * Default TTL provider (5 minutes)
 */
export const defaultGetTableTTL: GetTableTTL = () => DEFAULT_TTL_MS;

/**
 * Default no-op diagnostics
 */
export const noopDiagnostics: LogDiagnostics = () => {};
