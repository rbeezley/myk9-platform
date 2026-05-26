/**
 * @myk9/ringside — shared ringside experience for myK9 platform.
 *
 * Mounted by apps/myk9q today and (from Phase 1 onward) apps/myk9show's
 * /at-show route. See docs/plans/phase-0-ringside-package.md for the
 * extraction plan and PR sequencing.
 *
 * This file is intentionally empty in PR A — the scaffold's only job is
 * to prove the package builds, the workspace wiring resolves, and host
 * apps can import the namespace without errors. Real exports land
 * starting in PR B (shared types + utilities).
 */

// Sentinel export so the compiled bundle is non-empty and the build
// confirms a successful round-trip through tsup. Removed once PR B
// lands real exports.
export const RINGSIDE_PACKAGE_VERSION = '0.0.1';
