/**
 * Dependency Injection interfaces for ReplicatedTable
 *
 * This allows for easy testing by injecting mock dependencies
 * while using real implementations in production.
 */

/**
 * Logger interface - matches the structure of @myk9/core logger
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
  error?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Diagnostics logger function type
 */
export type LogDiagnostics = (report: DiagnosticReport) => void | Promise<void>;

/**
 * Database corruption handler function type
 */
export type HandleDatabaseCorruption = () => void;

/**
 * All injectable dependencies for ReplicatedTable
 */
export interface ReplicatedTableDependencies {
  logger?: Logger;
  logDiagnostics?: LogDiagnostics;
}

/**
 * Dependencies for DatabaseManager
 */
export interface DatabaseManagerDependencies {
  logger?: Logger;
  logDiagnostics?: LogDiagnostics;
  handleDatabaseCorruption?: HandleDatabaseCorruption;
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
 * Default no-op diagnostics
 */
export const noopDiagnostics: LogDiagnostics = () => {};

/**
 * Default no-op corruption handler
 */
export const noopCorruptionHandler: HandleDatabaseCorruption = () => {};
