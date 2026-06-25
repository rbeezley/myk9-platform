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
  parseSourceMap,
  matchChangedRoutes,
} = require('./check-doc-staleness.js');

test('normalizeRoute collapses differing param names to one form', () => {
  assert.equal(normalizeRoute('/shows/:id'), '/shows/:');
  assert.equal(normalizeRoute('/shows/:showId'), '/shows/:');
  assert.equal(
    normalizeRoute('/shows/:showId/trials/:trialId'),
    '/shows/:/trials/:'
  );
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
  const { flagged } = matchChangedRoutes(
    ['/shows/:id/register', '/shows/:showId/register'],
    index
  );
  assert.equal(flagged.length, 1, 'both collapse to one flagged entry');
});
