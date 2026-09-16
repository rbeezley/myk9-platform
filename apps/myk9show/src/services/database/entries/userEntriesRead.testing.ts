/**
 * Test-only entry points for `userEntriesRead.ts`.
 *
 * `entries/index.ts` re-exports its siblings with `export *`, so anything
 * declared in the read module itself becomes reachable from the production
 * barrel. This file is never re-exported, so importing from here is the only
 * way in and a production import of a test hook cannot happen by accident.
 */
export { resetDegradedReadWarningsForTests } from './userEntriesRead';
