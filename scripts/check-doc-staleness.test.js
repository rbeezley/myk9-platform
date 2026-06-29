#!/usr/bin/env node
//
// Tests for check-doc-staleness.js. Zero extra deps — run with:
//   node --test scripts/check-doc-staleness.test.js
//
// Covers the pure logic: param-name-insensitive normalization (the core reason
// a naive grep would miss real route changes here, since the repo uses both
// /shows/:id and /shows/:showId), route extraction from markdown and source,
// source-map parsing, and change matching.

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRoute,
  extractRoutesFromMarkdown,
  extractRoutesFromSource,
  extractComposedRoutes,
  parseDiffForRoutes,
  reverifiedRoutesFromMapDiff,
  parseSourceMap,
  matchChangedRoutes,
  selectBlockingFlags,
} = require('./check-doc-staleness.js');

test('normalizeRoute collapses differing param names to one form', () => {
  assert.equal(normalizeRoute('/shows/:id'), '/shows/:');
  assert.equal(normalizeRoute('/shows/:showId'), '/shows/:');
  assert.equal(normalizeRoute('/shows/:showId/trials/:trialId'), '/shows/:/trials/:');
});

test('normalizeRoute strips splats and trailing slashes', () => {
  assert.equal(normalizeRoute('/shows/:showId/*'), '/shows/:');
  assert.equal(normalizeRoute('/exhibitor/entries/'), '/exhibitor/entries');
  assert.equal(normalizeRoute('/'), '/');
});

test('normalizeRoute strips wrapping quotes/backticks and rejects non-routes', () => {
  assert.equal(normalizeRoute('`/dogs/:id`'), '/dogs/:');
  assert.equal(normalizeRoute('"/cart"'), '/cart');
  assert.equal(normalizeRoute('not-a-route'), null);
  assert.equal(normalizeRoute(42), null);
});

test('extractRoutesFromMarkdown pulls only backtick route tokens', () => {
  const md = 'see `/shows/:id` and `/cart`, but not `someVar` or plain /text';
  assert.deepEqual(extractRoutesFromMarkdown(md), ['/shows/:id', '/cart']);
});

test('extractRoutesFromSource handles path=, to=, and navigate() forms', () => {
  const src = `
    <Route path="/at-show/:showId" />
    <Link to='/dogs/:id' />
    navigate("/checkout/success")
  `;
  const got = extractRoutesFromSource(src);
  assert.ok(got.includes('/at-show/:showId'));
  assert.ok(got.includes('/dogs/:id'));
  assert.ok(got.includes('/checkout/success'));
});

test('extractRoutesFromSource ignores bare (non-/) slugs', () => {
  // The gap the composed-route handling fixes: a relative slug is NOT a route here.
  assert.deepEqual(extractRoutesFromSource("{ path: 'entry-management' }"), []);
});

test('extractComposedRoutes prefixes bare slugs with the mount base', () => {
  const src = "{ label: 'Entry Management', path: 'entry-management' },";
  assert.deepEqual(extractComposedRoutes(src, '/shows/:showId'), [
    '/shows/:showId/entry-management',
  ]);
});

test('extractComposedRoutes leaves already-absolute paths unprefixed', () => {
  assert.deepEqual(extractComposedRoutes("path: '/admin/sync'", '/shows/:showId'), ['/admin/sync']);
});

test('parseDiffForRoutes composes slug changes only for the composed-base file', () => {
  // Simulate the reviewer's scenario: renaming the entry-management slug. Without
  // file-aware composition --strict would falsely pass on this secretary route.
  const diff = [
    'diff --git a/apps/myk9show/src/routes/showManagementSections.ts b/apps/myk9show/src/routes/showManagementSections.ts',
    '--- a/apps/myk9show/src/routes/showManagementSections.ts',
    '+++ b/apps/myk9show/src/routes/showManagementSections.ts',
    '@@ -4 +4 @@',
    "-  { label: 'Entry Management', path: 'entry-management' },",
    "+  { label: 'Entry Management', path: 'entries' },",
  ].join('\n');
  const routes = parseDiffForRoutes(diff);
  assert.ok(routes.includes('/shows/:showId/entry-management'), 'old slug composed');
  assert.ok(routes.includes('/shows/:showId/entries'), 'new slug composed');
});

test('parseDiffForRoutes ignores label-only edits where the route is unchanged', () => {
  const diff = [
    'diff --git a/apps/myk9show/src/routes/showManagementSections.ts b/apps/myk9show/src/routes/showManagementSections.ts',
    '--- a/apps/myk9show/src/routes/showManagementSections.ts',
    '+++ b/apps/myk9show/src/routes/showManagementSections.ts',
    '@@ -4 +4 @@',
    "-  { label: 'Results Control', path: 'results-control' },",
    "+  { label: 'Results & Check-In', path: 'results-control' },",
  ].join('\n');
  assert.deepEqual(parseDiffForRoutes(diff), []);
});

test('parseDiffForRoutes does NOT compose slugs from unrelated files', () => {
  const diff = [
    '+++ b/apps/myk9show/src/components/Foo.tsx',
    '@@ -1 +1 @@',
    "+  const x = { path: 'entry-management' };", // not a composed-base file
    '+  <Route path="/shows/:id/setup" />', // absolute literal still caught
  ].join('\n');
  const routes = parseDiffForRoutes(diff);
  assert.ok(!routes.includes('/shows/:showId/entry-management'), 'no false composition');
  assert.ok(routes.includes('/shows/:id/setup'), 'absolute literal still extracted');
});

test('the entry-management slug rename actually flags a documented guide', () => {
  // End-to-end: composed route -> normalized -> matched against a source map that
  // documents /shows/:showId/entry-management (workflow 15).
  const map = `## Secretary Workflows

### 15. Review and approve entries
**Canonical route:** \`/shows/:showId/entry-management\`
**Docs target:** Secretary Guide § Entry Management
`;
  const index = parseSourceMap(map);
  const changed = extractComposedRoutes("path: 'entry-management'", '/shows/:showId');
  const { flagged } = matchChangedRoutes(changed, index);
  assert.equal(flagged.length, 1);
  assert.match(flagged[0].refs[0].docsTarget, /Entry Management/);
});

const SAMPLE_MAP = `# Workflow Source Map

## Routes Excluded from Customer Docs

| Route | Reason |
|---|---|
| \`/admin/sync\` | Internal telemetry |

## Exhibitor Workflows

### 3. Enter a show online
**Outcome:** Exhibitor submits an entry.
**Canonical routes:** \`/shows/:showId/register\` -> \`/cart\` -> \`/checkout/success\`
**Docs target:** Exhibitor Guide § Entry & Payment

### 6. Check in on show day
**Outcome:** Exhibitor marks present.
**Canonical route:** \`/at-show\` or \`/at-show/:showId\`
**Docs target:** Exhibitor Guide § Show Day
`;

test('parseSourceMap indexes routes with their section and docs target', () => {
  const index = parseSourceMap(SAMPLE_MAP);
  // /shows/:showId/register normalizes to /shows/:/register
  const reg = index.get('/shows/:/register');
  assert.ok(reg, 'register route indexed');
  assert.equal(reg[0].section, '3. Enter a show online');
  assert.match(reg[0].docsTarget, /Entry & Payment/);

  // table route is indexed under the ## section
  const sync = index.get('/admin/sync');
  assert.ok(sync, 'table route indexed');
  assert.equal(sync[0].section, 'Routes Excluded from Customer Docs');
});

test('matchChangedRoutes flags documented and separates undocumented', () => {
  const index = parseSourceMap(SAMPLE_MAP);
  // Note the DIFFERENT param name (:id vs :showId) — must still match.
  const { flagged, undocumented } = matchChangedRoutes(
    ['/at-show/:id', '/totally/new/route'],
    index
  );
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].normalized, '/at-show/:');
  assert.match(flagged[0].refs[0].docsTarget, /Show Day/);
  assert.deepEqual(undocumented, ['/totally/new/route']);
});

test('matchChangedRoutes dedupes routes differing only by param name', () => {
  const index = parseSourceMap(SAMPLE_MAP);
  const { flagged } = matchChangedRoutes(['/shows/:id/register', '/shows/:showId/register'], index);
  assert.equal(flagged.length, 1, 'both collapse to one flagged entry');
});

test('selectBlockingFlags keeps only routes tied to a real customer Docs target', () => {
  const flagged = [
    // Internal route — its only reference carries the no-docs-target sentinel.
    {
      route: '/admin/users',
      normalized: '/admin/users',
      refs: [{ section: 'Admin Workflows', docsTarget: '(no docs target)' }],
    },
    // Customer-guide route — a real Docs target.
    {
      route: '/exhibitor/payments',
      normalized: '/exhibitor/payments',
      refs: [{ section: '10. View payments', docsTarget: 'Exhibitor Guide § Payments' }],
    },
    // Mixed — internal AND a guide; the guide makes it blocking.
    {
      route: '/club-admin/payments',
      normalized: '/club-admin/payments',
      refs: [
        { section: 'Admin Workflows', docsTarget: '(no docs target)' },
        { section: '21. Stripe onboarding', docsTarget: 'Club Admin Guide § Payments' },
      ],
    },
  ];
  const blocking = selectBlockingFlags(flagged).map(f => f.normalized);
  assert.deepEqual(blocking, ['/exhibitor/payments', '/club-admin/payments']);
  assert.ok(!blocking.includes('/admin/users'), 'internal route must not block strict');
});

test('selectBlockingFlags returns empty when every flagged route is internal', () => {
  const flagged = [
    {
      route: '/admin/users',
      normalized: '/admin/users',
      refs: [{ section: 'Admin Workflows', docsTarget: '(no docs target)' }],
    },
    {
      route: '/admin/dashboard',
      normalized: '/admin/dashboard',
      refs: [{ section: 'Admin Workflows', docsTarget: '(no docs target)' }],
    },
  ];
  assert.equal(selectBlockingFlags(flagged).length, 0);
});

test('reverifiedRoutesFromMapDiff collects routes from removed map lines', () => {
  // The catalog scenario: gap-audit table rows for the three payment routes are
  // DELETED, so each token appears only on a '-' line.
  const diff = [
    '+++ b/docs/user-guides/workflow-source-map.md',
    '@@ -17,3 +0,0 @@',
    '-| `/exhibitor/payments`  | My Payments   | EXHIBITOR  |',
    '-| `/club-admin/members`  | Members       | CLUB_ADMIN |',
    '-| `/club-admin/payments` | Payments      | CLUB_ADMIN |',
  ].join('\n');
  const set = reverifiedRoutesFromMapDiff(diff);
  assert.deepEqual([...set].sort(), [
    '/club-admin/members',
    '/club-admin/payments',
    '/exhibitor/payments',
  ]);
});

test('reverifiedRoutesFromMapDiff counts in-place edits (UNION, not symmetric diff)', () => {
  // A route token present on BOTH the '-' and '+' side of an in-place prose edit
  // must still count as re-verified — the key difference from parseDiffForRoutes,
  // whose symmetric difference would cancel it to nothing.
  const diff = [
    '+++ b/docs/user-guides/workflow-source-map.md',
    '@@ -104 +104 @@',
    '-**Canonical route:** `/exhibitor/payments` — not yet in nav',
    '+**Canonical route:** `/exhibitor/payments` — sidebar link under My Payments',
  ].join('\n');
  const set = reverifiedRoutesFromMapDiff(diff);
  assert.ok(set.has('/exhibitor/payments'));
  assert.deepEqual(parseDiffForRoutes(diff), [], 'parseDiffForRoutes cancels it; we must not');
});

test('reverifiedRoutesFromMapDiff normalizes param names and ignores context/header lines', () => {
  const diff = [
    '+++ b/docs/user-guides/workflow-source-map.md',
    '--- a/docs/user-guides/workflow-source-map.md',
    '@@ -1 +1 @@',
    '+**Canonical route:** `/shows/:showId/entry-management`',
    ' unchanged context mentioning `/should-not-count`',
  ].join('\n');
  const set = reverifiedRoutesFromMapDiff(diff);
  assert.ok(set.has('/shows/:/entry-management'), 'param names collapsed');
  assert.ok(!set.has('/should-not-count'), 'context line ignored');
});

test('reverifiedRoutesFromMapDiff returns empty for a diff with no route tokens', () => {
  const diff = [
    '+++ b/docs/user-guides/workflow-source-map.md',
    '@@ -1 +1 @@',
    '-Some prose without any backtick route.',
    '+Reworded prose, still no route.',
  ].join('\n');
  assert.equal(reverifiedRoutesFromMapDiff(diff).size, 0);
});
