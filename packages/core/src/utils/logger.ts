/* eslint-disable no-console */

/**
 * Package logger. Production policy: warnings and errors only.
 *
 * `log`, `debug` and `info` are deliberate NO-OPS, not stubs awaiting a body.
 * This package used to carry a configurable logger — `configureLogger`,
 * `setLogLevel`, and a `settingsReader` an app could install — under which a
 * level of `'all'` made those three reach `console`. MYK9-328 removed that
 * configuration surface (nothing consumed it) and hardcoded the policy, which
 * left three `console.*` calls guarded by a condition that is now false at
 * every call site: `shouldLog('log')`, `shouldLog('debug')` and
 * `shouldLog('info')` are all `false` by construction.
 *
 * Those calls were kept for a while and were unreachable the whole time —
 * dead code that read as working behaviour, and three uncovered statements
 * that no test could ever reach. They are gone. The methods stay so callers do
 * not have to change, and so the levels can be re-enabled in one place if the
 * policy ever changes: give them a body again, and restore a real `shouldLog`.
 *
 * Behaviour is unchanged: these never emitted anything.
 */
export const logger = {
  log: (..._args: unknown[]) => {},
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  debug: (..._args: unknown[]) => {},
  info: (..._args: unknown[]) => {},
};

// Export individual functions for convenience
export const { log, warn, error, debug, info } = logger;
