import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const standardVerifier = readFileSync(resolve(__dirname, 'standardWebhookSignature.ts'), 'utf8');
const pushAuth = readFileSync(resolve(__dirname, 'pushWebhookAuth.ts'), 'utf8');
const functionSecret = readFileSync(resolve(__dirname, 'functionSecret.ts'), 'utf8');
const resendWebhook = readFileSync(resolve(__dirname, '../resend-webhook/index.ts'), 'utf8');

/**
 * This repo has TWO edge-function trees, and a sweep over one of them is a sweep that misses
 * every Stripe and cron function:
 *
 *   supabase/functions/                 — admin, email, push, askq, passcode, packets
 *   apps/myk9show/supabase/functions/   — stripe-*, cron-*, decline-waitlist-offer
 *
 * The first version of the sweep below walked only the root tree. Caught by Codex review of
 * 608504d41. Both roots are declared here and their contents are counted in a known-answer
 * check, so a wrong or renamed path fails loudly instead of quietly scanning nothing.
 */
const EDGE_FUNCTION_ROOTS: readonly string[] = [
  resolve(__dirname, '..'),
  resolve(__dirname, '../../../apps/myk9show/supabase/functions'),
];

/** Every non-test .ts under either edge-function tree, as [display path, source]. */
function edgeFunctionSources(): [string, string][] {
  const out: [string, string][] = [];
  for (const root of EDGE_FUNCTION_ROOTS) {
    const label = root.includes('apps/myk9show') ? 'apps/myk9show' : 'root';
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = resolve(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.ts') && !/\.(test|source\.test)\.ts$/.test(entry)) {
          out.push([`${label}:${full.slice(root.length + 1)}`, readFileSync(full, 'utf8')]);
        }
      }
    };
    walk(root);
  }
  return out;
}

describe('shared webhook authentication contracts', () => {
  it('routes Standard-Webhooks and push bearer comparison through one timing-safe primitive', () => {
    expect(standardVerifier).toContain("from './timingSafeEqual.ts'");
    expect(standardVerifier).not.toMatch(/function timingSafeEqual/);

    // Bearer comparison lives in `functionSecret.ts` now, shared by the push
    // triggers and `generate-trial-packet`. What must stay true is that every
    // caller reaches the one primitive and none of them grows an `===`.
    expect(functionSecret).toContain("from './timingSafeEqual.ts'");
    expect(functionSecret).toContain('timingSafeEqual(authHeader, `Bearer ${secret}`)');
    expect(functionSecret).not.toMatch(/function timingSafeEqual/);
    expect(pushAuth).toContain("from './functionSecret.ts'");
    expect(pushAuth).toContain("requireFunctionSecret(req, 'PUSH_WEBHOOK_SECRET'");
    expect(pushAuth).not.toMatch(/authHeader\s*===/);
  });

  /**
   * MYK9-471 / SA-2026-09-12-03. MYK9-404 fixed ONE non-constant-time secret comparison
   * (send-confirmation-email) and its pin named that one file, so the next instance —
   * send-push-notification comparing the caller's bearer token to the SERVICE ROLE KEY with
   * `!==` — survived four months and a security audit.
   *
   * A pin on one instance bans a literal; this bans the CLASS. Every edge-function source is
   * swept, so a new `secret === x` anywhere under supabase/functions fails here rather than
   * waiting for someone to notice it.
   *
   * The signal is an identifier whose NAME says secret/token/key on EITHER side, which is what
   * makes a false positive unlikely and a real one unmissable. Comparing such a value to a
   * literal, to undefined/null, or to a `.length` is not the defect, so those are excluded.
   *
   * This guard has been wrong twice, both times by matching less than it claimed, so treat any
   * edit to the pattern as requiring a fresh mutation check in BOTH operand orders:
   *
   *  1. The first draft required a character BEFORE the suffix
   *     (`[A-Za-z_$][\w$]*(?:[Ss]ecret|…)`), so it could not match a bare identifier named
   *     exactly `token` — the very line it was written to catch. Found only by reintroducing
   *     `token !== supabaseServiceKey` and watching the test still pass.
   *  2. The second draft matched the secret-like name on the LEFT only, so `candidate !==
   *     serviceRoleKey` would have slipped through. Found by Codex review of 6921f74f1.
   */
  it('sees both edge-function trees', () => {
    // Known-answer check for the sweep itself. Without it, a renamed directory or a bad
    // relative path makes every assertion below pass by scanning nothing — an unverified
    // harness reports its own bugs as findings about the code.
    const sources = edgeFunctionSources();
    const roots = new Set(sources.map(([path]) => path.split(':')[0]));
    expect([...roots].sort(), 'both edge-function trees must be scanned').toEqual([
      'apps/myk9show',
      'root',
    ]);
    // Sanity floors, not exact counts: this must not become a file-count treadmill.
    expect(sources.filter(([p]) => p.startsWith('root:')).length).toBeGreaterThan(50);
    expect(sources.filter(([p]) => p.startsWith('apps/myk9show:')).length).toBeGreaterThan(10);
    // And the tree Codex found missing must actually contain the Stripe functions.
    expect(sources.some(([p]) => p.startsWith('apps/myk9show:stripe-webhook/'))).toBe(true);
  });

  it('never compares a secret, token or key with === or !== anywhere under functions/', () => {
    const offenders: string[] = [];
    // Match ANY identifier comparison, then decide from the operands. Deciding afterwards is
    // what makes operand order irrelevant — a single regex with the name-shape baked into one
    // side is how draft 2 went wrong. Optional parens so `(token) !== serviceRoleKey` is not a
    // way past it (draft 3, also Codex).
    const comparison =
      /\(?\s*\b([A-Za-z_$][\w$.]*)\s*\)?\s*(===|!==)\s*\(?\s*([A-Za-z_$][\w$.]*)\b\s*\)?/g;
    const secretLike = /(?:[Ss]ecret|[Tt]oken|[Kk]ey)$/;
    const notASecret = /^(undefined|null|true|false)$/;

    for (const [path, source] of edgeFunctionSources()) {
      // Strip comments so the explanatory notes that quote the old expression — including the
      // one in send-confirmation-email/auth.ts and send-push-notification/index.ts — do not
      // register as code. That confusion is exactly how a deployed-bundle grep reported the
      // MYK9-404 fix as absent when it was present.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const [match, left, , right] of code.matchAll(comparison)) {
        const sides = [left, right];
        if (!sides.some(side => secretLike.test(side.split('.').pop() ?? side))) continue;
        if (sides.some(side => notASecret.test(side) || /\.length$/.test(side))) continue;
        offenders.push(`${path}: ${match.trim()}`);
      }
    }

    expect(
      offenders,
      'Use the shared timingSafeEqual from _shared/timingSafeEqual.ts. Offenders:\n' +
        offenders.join('\n')
    ).toEqual([]);
  });

  it('routes Resend verification through the shared Standard-Webhooks verifier', () => {
    expect(resendWebhook).toContain("from '../_shared/standardWebhookSignature.ts'");
    expect(resendWebhook).toContain('verifyStandardWebhookSignature({');
    expect(resendWebhook).not.toContain("from './signature.ts'");
    expect(resendWebhook).not.toContain('matchesAnySignature');
  });
});
