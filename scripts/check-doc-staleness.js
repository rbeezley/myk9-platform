#!/usr/bin/env node
//
// check-doc-staleness.js
//
// Flags user guides that may have gone stale because a route they document
// changed in this branch's diff. Implements the OPEN-TODOS "[docs] Staleness
// check" item: "compare changed routes against the guide source maps and flag
// any guide that depends on the changed route."
//
// The guide source map (docs/user-guides/workflow-source-map.md) intentionally
// references routes by path only, "so staleness is greppable" — this script is
// that grep, made param-name-insensitive and diff-aware.
//
// Usage:
//   node scripts/check-doc-staleness.js [baseRef] [--strict] [--routes /a,/b]
//
//   baseRef        git ref to diff against (default: origin/main, then main).
//                  Uses three-dot (base...HEAD) so it sees only this branch's
//                  changes since the merge-base, the way a PR diff does.
//   --strict       exit 1 when any documented route changed (for CI gating).
//                  Default is advisory: always exit 0 and print the report.
//   --routes a,b   skip git and treat this comma-separated list as the changed
//                  routes (used by tests and for manual "what guides cover /x?").
//
// Re-verification suppression (strict mode only): a flagged route does NOT fail
// strict if its source-map block was ALSO edited in this same base...HEAD diff.
// Touching the guide-map entry for a route is treated as proof you re-checked the
// guide, so the route may move (e.g. get catalogued in pageDirectory.ts) without
// tripping the gate — provided you reconciled its map block in the same PR. This
// is what lets a "documented route changed" PR pass without de-documenting the
// route (removing its backticks/Docs target to dodge the gate is the anti-pattern
// this check exists to prevent). See reverifiedRoutesFromMapDiff.
//
// Exit codes: 0 = ok / advisory; 1 = --strict and documented routes changed;
//             2 = usage or environment error.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const SOURCE_MAP_REL = 'docs/user-guides/workflow-source-map.md';

// Sentinel used when a source-map block names no `**Docs target:**` line. A
// changed route whose ONLY references carry this sentinel lives in an
// internal/excluded section (e.g. "Admin Workflows", "Routes Excluded from
// Customer Docs") — there is no customer guide that could go stale, so such a
// route is advisory-only and must NOT fail strict mode.
const NO_DOCS_TARGET = '(no docs target)';

// Files where route paths and nav labels are defined. The diff is restricted to
// these so unrelated changes that merely mention a "/foo" string don't trip the
// check. Add to this list when a new route-registry or sidebar file appears.
const ROUTE_SOURCE_PATHS = [
  'apps/myk9show/src/routes',
  'apps/myk9show/src/App.tsx',
  'apps/myk9show/src/features/show-map/showMapRoutes.ts',
  'apps/myk9show/src/pages/scoring/scoringRoutes.ts',
  'apps/myk9show/src/pages/RegistrationWizardPage.routes.ts',
  'apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts',
  'apps/myk9show/src/features/admin-help/data/pageDirectory.ts',
];

// Files whose changes imply a possible *label* change (button/tab/menu text),
// which the QA re-verification trigger table treats as its own staleness cause.
const LABEL_SOURCE_PATHS = [
  'apps/myk9show/src/components/layout/sidebar/unifiedSidebarConfig.ts',
  'apps/myk9show/src/features/admin-help/data/pageDirectory.ts',
];

// Files that define routes as RELATIVE slugs composed under a parent mount,
// e.g. showManagementSections.ts lists `path: 'entry-management'`, mounted under
// `<Route path="/shows/:id">`. A bare slug carries no leading `/`, so the
// absolute-literal extractor misses it; here we map the defining file to its
// base prefix so a slug change composes to the full documented route.
const COMPOSED_ROUTE_BASES = [
  { fileMatch: 'routes/showManagementSections.ts', base: '/shows/:showId' },
];

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests — no git, no fs, no process side effects).
// ---------------------------------------------------------------------------

/**
 * Collapse a route to a param-name-insensitive canonical form so that
 * `/shows/:id` and `/shows/:showId` (both appear in this repo) compare equal.
 * Strips a trailing `/*` splat and trailing slash. Returns null for non-routes.
 */
function normalizeRoute(raw) {
  if (typeof raw !== 'string') return null;
  let route = raw
    .trim()
    .replace(/^[`'"]|[`'"]$/g, '')
    .trim();
  if (!route.startsWith('/')) return null;
  route = route.replace(/\/\*+$/, ''); // drop trailing splat: /shows/:showId/* -> /shows/:showId
  route = route.replace(/\/:[A-Za-z0-9_]+/g, '/:'); // param names -> placeholder
  if (route.length > 1) route = route.replace(/\/+$/, ''); // trailing slash
  return route === '' ? '/' : route;
}

/** Extract backtick-quoted route tokens (`/...`) from markdown. */
function extractRoutesFromMarkdown(md) {
  return Array.from(md.matchAll(/`(\/[^`]*)`/g), m => m[1]);
}

/**
 * Extract route literals from a line of source (or a diff hunk line). Catches
 * `path="/x"`, `to='/x'`, `navigate("/x")`, and bare quoted "/x" forms.
 */
function extractRoutesFromSource(text) {
  const routes = [];
  for (const m of text.matchAll(/["'`](\/[A-Za-z0-9_:*\-/]*)["'`]/g)) {
    routes.push(m[1]);
  }
  return routes;
}

/**
 * Compose relative `path: '<slug>'` declarations onto a base prefix. Used for
 * files whose routes are nested slugs (see COMPOSED_ROUTE_BASES). Slugs that are
 * already absolute (start with `/`) are returned as-is, not double-prefixed.
 */
function extractComposedRoutes(text, base) {
  const routes = [];
  for (const m of text.matchAll(/\bpath:\s*["'`]([^"'`]+)["'`]/g)) {
    const slug = m[1];
    if (slug.startsWith('/')) routes.push(slug);
    else routes.push(`${base.replace(/\/$/, '')}/${slug}`);
  }
  return routes;
}

/**
 * Parse `git diff` text into the set of route literals that changed. Tracks the
 * current file from `+++ b/<path>` headers so composed-slug files contribute
 * their full routes, and only added/removed content lines are scanned.
 *
 * Unchanged route literals can still appear on edited lines, such as a nav label
 * rename where `{ label, path }` live together. Keep only the symmetric
 * difference so label-only edits do not masquerade as route changes.
 */
function parseDiffForRoutes(diffText) {
  const added = new Map();
  const removed = new Map();
  let currentFile = null;
  const record = (target, route) => {
    const norm = normalizeRoute(route);
    if (!norm || norm === '/') return;
    target.set(norm, route);
  };

  for (const line of diffText.split('\n')) {
    const fileHeader = line.match(/^\+\+\+ b\/(.+)/);
    if (fileHeader) {
      currentFile = fileHeader[1];
      continue;
    }
    if (line.startsWith('---')) continue; // old-file header, not content
    if (!/^[+-]/.test(line)) continue; // context / hunk meta
    const target = line.startsWith('+') ? added : removed;
    const content = line.slice(1);
    for (const r of extractRoutesFromSource(content)) record(target, r);
    if (currentFile) {
      const composed = COMPOSED_ROUTE_BASES.find(c => currentFile.includes(c.fileMatch));
      if (composed) {
        for (const r of extractComposedRoutes(content, composed.base)) record(target, r);
      }
    }
  }

  return [
    ...[...removed].filter(([norm]) => !added.has(norm)).map(([, route]) => route),
    ...[...added].filter(([norm]) => !removed.has(norm)).map(([, route]) => route),
  ];
}

/**
 * Normalized routes whose backtick tokens appear on ANY changed (+/-) line of a
 * source-map diff. This is the re-verification signal: editing the guide-map block
 * that documents a route — in either direction — is proof the author re-checked
 * that guide, so the route may change without failing strict mode (see header).
 *
 * Deliberately a UNION over touched lines, NOT the symmetric difference that
 * parseDiffForRoutes computes. There the goal is to detect genuine route *changes*
 * and ignore in-place label edits, so a token present on both sides cancels. Here
 * the opposite is wanted: any touch of a route-bearing map line — including an
 * in-place edit where the token sits on both the '-' and '+' side — must count as
 * re-verification, so we never cancel.
 */
function reverifiedRoutesFromMapDiff(diffText) {
  const set = new Set();
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue; // file headers
    if (!/^[+-]/.test(line)) continue; // context / hunk meta
    for (const raw of extractRoutesFromMarkdown(line.slice(1))) {
      const norm = normalizeRoute(raw);
      if (norm && norm !== '/') set.add(norm);
    }
  }
  return set;
}

/**
 * Parse the source map into an index: normalizedRoute -> [{ section, docsTarget, raw }].
 * Workflow blocks (### headings) carry a real "Docs target:" line; table-only
 * sections (## headings) are indexed too, tagged "(table)".
 */
function parseSourceMap(md) {
  const lines = md.split(/\r?\n/);
  const index = new Map();

  let currentH2 = null;
  let currentH3 = null;
  // Collect blocks so we can attach the Docs target line, which follows routes.
  // Strategy: buffer the current ### block; flush on the next heading.
  let block = { section: null, lines: [] };

  const flush = () => {
    if (!block.section) {
      block = { section: null, lines: [] };
      return;
    }
    const text = block.lines.join('\n');
    const docsMatch = text.match(/\*\*Docs target:\*\*\s*(.+)/);
    const docsTarget = docsMatch ? docsMatch[1].trim() : NO_DOCS_TARGET;
    for (const raw of extractRoutesFromMarkdown(text)) {
      const norm = normalizeRoute(raw);
      if (!norm) continue;
      if (!index.has(norm)) index.set(norm, []);
      index.get(norm).push({ section: block.section, docsTarget, raw });
    }
    block = { section: null, lines: [] };
  };

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    if (h2 && !line.startsWith('###')) {
      flush();
      currentH2 = h2[1].trim();
      currentH3 = null;
      block = { section: currentH2, lines: [line] };
      continue;
    }
    if (h3) {
      flush();
      currentH3 = h3[1].trim();
      block = { section: currentH3, lines: [line] };
      continue;
    }
    if (block.section) block.lines.push(line);
    else if (currentH2 || currentH3) {
      block = { section: currentH3 || currentH2, lines: [line] };
    }
  }
  flush();
  return index;
}

/**
 * Match a set of changed route strings against the source-map index.
 * Returns { flagged: [{ route, normalized, refs }], undocumented: [route] }.
 */
function matchChangedRoutes(changedRoutes, index) {
  const flagged = [];
  const undocumented = [];
  const seen = new Set();
  for (const raw of changedRoutes) {
    const norm = normalizeRoute(raw);
    if (!norm || norm === '/') continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (index.has(norm)) {
      flagged.push({ route: raw, normalized: norm, refs: index.get(norm) });
    } else {
      undocumented.push(raw);
    }
  }
  return { flagged, undocumented };
}

/**
 * Of the flagged routes, the subset that should BLOCK strict mode. A changed
 * route only risks a stale *customer guide* if at least one of its source-map
 * references names a real Docs target. Routes whose references are all
 * `NO_DOCS_TARGET` live in internal/excluded sections — advisory-only, never a
 * CI failure. (Advisory mode still reports every flagged route.)
 */
function selectBlockingFlags(flagged) {
  return flagged.filter(f => f.refs.some(r => r.docsTarget !== NO_DOCS_TARGET));
}

// ---------------------------------------------------------------------------
// Git + CLI (side-effecting; skipped when this file is require()'d).
// ---------------------------------------------------------------------------

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function resolveBaseRef(preferred) {
  const candidates = preferred ? [preferred] : ['origin/main', 'main'];
  for (const ref of candidates) {
    try {
      git(['rev-parse', '--verify', '--quiet', ref]);
      return ref;
    } catch {
      /* try next */
    }
  }
  return null;
}

function changedFiles(baseRef) {
  const out = git(['diff', '--name-only', `${baseRef}...HEAD`, '--', ...ROUTE_SOURCE_PATHS]);
  return out.split('\n').filter(Boolean);
}

function changedRoutesFromGit(baseRef) {
  // --unified=0 so only added/removed lines appear; collect route literals from
  // both sides (a renamed/removed path shows as a '-' line, a new one as '+').
  // parseDiffForRoutes also composes relative-slug files onto their base mount.
  const out = git(['diff', '--unified=0', `${baseRef}...HEAD`, '--', ...ROUTE_SOURCE_PATHS]);
  return parseDiffForRoutes(out);
}

function labelFilesChanged(baseRef) {
  try {
    const out = git(['diff', '--name-only', `${baseRef}...HEAD`, '--', ...LABEL_SOURCE_PATHS]);
    return out.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function sourceMapChanged(baseRef) {
  try {
    const out = git(['diff', '--name-only', `${baseRef}...HEAD`, '--', SOURCE_MAP_REL]);
    return out.split('\n').filter(Boolean).length > 0;
  } catch {
    return false;
  }
}

/** Set of normalized routes whose source-map block changed in this diff (see
 *  reverifiedRoutesFromMapDiff). --unified=0 so only added/removed lines count. */
function reverifiedRoutesFromGit(baseRef) {
  try {
    const out = git(['diff', '--unified=0', `${baseRef}...HEAD`, '--', SOURCE_MAP_REL]);
    return reverifiedRoutesFromMapDiff(out);
  } catch {
    return new Set();
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/check-doc-staleness.js [baseRef] [--strict] [--routes /a,/b]');
    return 0;
  }
  const strict = args.includes('--strict');
  const routesFlagIdx = args.indexOf('--routes');
  const explicitRoutes =
    routesFlagIdx !== -1 && args[routesFlagIdx + 1]
      ? args[routesFlagIdx + 1]
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
      : null;
  const baseArg = args.find((a, i) => !a.startsWith('-') && args[i - 1] !== '--routes');

  const mapPath = path.join(repoRoot, SOURCE_MAP_REL);
  if (!fs.existsSync(mapPath)) {
    console.error(`Source map not found: ${SOURCE_MAP_REL}`);
    return 2;
  }
  const index = parseSourceMap(fs.readFileSync(mapPath, 'utf8'));

  let changed;
  let labelChanges = [];
  let mapAlsoChanged = false;
  let reverified = new Set();

  if (explicitRoutes) {
    changed = explicitRoutes;
  } else {
    const baseRef = resolveBaseRef(baseArg);
    if (!baseRef) {
      console.error('Could not resolve a base ref (tried origin/main, main). Pass one explicitly,');
      console.error('or use --routes /a,/b to check specific routes without git.');
      return 2;
    }
    try {
      changed = changedRoutesFromGit(baseRef);
      labelChanges = labelFilesChanged(baseRef);
      mapAlsoChanged = sourceMapChanged(baseRef);
      reverified = reverifiedRoutesFromGit(baseRef);
    } catch (err) {
      console.error(`git diff failed against ${baseRef}: ${err.message}`);
      return 2;
    }
    console.log(`Diffing route sources against ${baseRef}...HEAD`);
  }

  const { flagged, undocumented } = matchChangedRoutes(changed, index);
  // Re-verification suppression: a documented route that changed does not block
  // strict mode if its source-map block was also edited in this same diff. Touching
  // the guide-map entry is proof the guide was re-checked (see header).
  let blocking = selectBlockingFlags(flagged);
  const reverifiedBlocking = blocking.filter(f => reverified.has(f.normalized));
  blocking = blocking.filter(f => !reverified.has(f.normalized));

  if (flagged.length === 0 && undocumented.length === 0 && labelChanges.length === 0) {
    console.log('No documented routes changed — no guide re-verification triggered.');
    return 0;
  }

  if (flagged.length > 0) {
    const blockingSet = new Set(blocking.map(f => f.normalized));
    console.log('\n⚠  Guides to RE-VERIFY (a documented route changed):');
    for (const { route, normalized, refs } of flagged) {
      let tag = '';
      if (reverified.has(normalized)) {
        tag = '  (re-verified in this diff — guide-map block also changed)';
      } else if (!blockingSet.has(normalized)) {
        tag = '  (advisory only — no customer Docs target)';
      }
      console.log(`\n  ${route}${tag}`);
      const printed = new Set();
      for (const ref of refs) {
        const key = `${ref.section} :: ${ref.docsTarget}`;
        if (printed.has(key)) continue;
        printed.add(key);
        console.log(`    • ${ref.section}`);
        console.log(`      → ${ref.docsTarget}`);
      }
    }
  }

  if (reverifiedBlocking.length > 0) {
    console.log(
      '\n✓  Re-verified in this diff (guide-map block also changed — does NOT block strict):'
    );
    for (const f of reverifiedBlocking) console.log(`    • ${f.route}`);
  }

  if (labelChanges.length > 0) {
    console.log('\nℹ  Label-bearing files changed (check button/tab/menu text in guides):');
    for (const f of labelChanges) console.log(`    • ${f}`);
  }

  if (undocumented.length > 0) {
    console.log('\nℹ  Changed routes NOT in the source map (new route to document, or internal):');
    for (const r of undocumented) console.log(`    • ${r}`);
  }

  if (mapAlsoChanged) {
    console.log(
      `\nNote: ${SOURCE_MAP_REL} also changed in this diff — the map may already be reconciled.`
    );
  }

  console.log(
    '\nThis is advisory. Re-verify flagged guides per docs/user-guides/documentation-qa-checklist.md.'
  );

  if (strict && flagged.length > 0 && blocking.length === 0) {
    const why =
      reverifiedBlocking.length > 0
        ? 'flagged routes are internal/excluded or re-verified in this diff'
        : 'flagged routes are all internal/excluded (no customer Docs target)';
    console.log(`\nStrict mode: ${why}, so this does not fail.`);
  }

  // Strict mode fails only when a route tied to a real customer guide changed AND
  // its guide-map block was not re-verified in this diff. Internal/excluded routes
  // are advisory-only (see selectBlockingFlags); re-verified routes are suppressed
  // (see reverifiedRoutesFromMapDiff).
  return strict && blocking.length > 0 ? 1 : 0;
}

module.exports = {
  normalizeRoute,
  extractRoutesFromMarkdown,
  extractRoutesFromSource,
  extractComposedRoutes,
  parseDiffForRoutes,
  reverifiedRoutesFromMapDiff,
  parseSourceMap,
  matchChangedRoutes,
  selectBlockingFlags,
};

if (require.main === module) {
  process.exit(main(process.argv));
}
