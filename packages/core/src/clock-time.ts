/**
 * Dependency-free entry for the clock-time parser (`@myk9/core/clock-time`), so the app's
 * entry chunk and `@myk9/ringside/run-queue` can read a class's time of day without
 * importing the whole core barrel (MYK9-1504). Nothing here may import another module
 * except the parser itself.
 */
export * from './utils/parseClockTime';
