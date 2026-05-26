/**
 * @myk9/ringside — shared ringside experience for myK9 platform.
 *
 * Mounted by apps/myk9q today and (from Phase 1 onward) apps/myk9show's
 * /at-show route. See docs/plans/phase-0-ringside-package.md for the
 * extraction plan and PR sequencing.
 *
 * Public surface — keep this file as the single barrel re-export.
 * Subpath imports (e.g. `from '@myk9/ringside/utils/timeInputParsing'`)
 * are intentionally NOT supported; consumers always import from the
 * package root so internal layout can change without breaking them.
 */

// ── Utils ────────────────────────────────────────────────────────────────
export {
  parseSmartTime,
  isValidTimeFormat,
  timeToSeconds,
  secondsToTime,
  compareTime,
} from './utils/timeInputParsing';
