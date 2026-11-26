import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Source-pinned: both functions read Deno.env at module scope, so they cannot
// be imported under vitest (MYK9-2446).
const sources = {
  'stripe-customer-portal': readFileSync(
    resolve(__dirname, '../../../supabase/functions/stripe-customer-portal/index.ts'),
    'utf8'
  ),
  'stripe-upgrade-subscription': readFileSync(
    resolve(__dirname, '../../../supabase/functions/stripe-upgrade-subscription/index.ts'),
    'utf8'
  ),
};

describe.each(Object.entries(sources))('%s error handling', (name, source) => {
  const catchBlock = source.slice(source.lastIndexOf('} catch (error: unknown) {'));

  it('returns a generic 500 and never the raw error message to the client', () => {
    expect(catchBlock).toContain(
      "return corsResponse(corsHeaders, { error: 'request_failed' }, 500);"
    );
    expect(catchBlock).not.toMatch(/error:\s*error instanceof Error/);
    expect(catchBlock).not.toMatch(/error:\s*message/);
  });

  it('logs the detail server-side', () => {
    expect(catchBlock).toContain(`console.error('${name} error:', message);`);
  });

  it('answers unparseable or non-object JSON with 400 before the outer catch', () => {
    const parseStart = source.indexOf('body = await req.json();');
    expect(parseStart).toBeGreaterThan(-1);
    const parseBlock = source.slice(parseStart, parseStart + 300);
    expect(parseBlock).toContain(
      "return corsResponse(corsHeaders, { error: 'Invalid JSON body' }, 400);"
    );
    expect(source).toContain("if (!body || typeof body !== 'object') {");
  });
});

describe('stripe-upgrade-subscription keeps livemode scoping (MYK9-2187)', () => {
  it('still passes stripeLivemode to the ownership check', () => {
    expect(sources['stripe-upgrade-subscription']).toContain('stripeLivemode,');
  });
});
