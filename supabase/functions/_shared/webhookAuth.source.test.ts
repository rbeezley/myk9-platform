import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const standardVerifier = readFileSync(resolve(__dirname, 'standardWebhookSignature.ts'), 'utf8');
const pushAuth = readFileSync(resolve(__dirname, 'pushWebhookAuth.ts'), 'utf8');
const functionSecret = readFileSync(resolve(__dirname, 'functionSecret.ts'), 'utf8');
const resendWebhook = readFileSync(resolve(__dirname, '../resend-webhook/index.ts'), 'utf8');

/** Every non-test .ts under supabase/functions, as [repo-relative path, source]. */
function edgeFunctionSources(): [string, string][] {
  const root = resolve(__dirname, '..');
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.ts') && !/\.(test|source\.test)\.ts$/.test(entry)) {
        out.push([full.slice(root.length + 1), readFileSync(full, 'utf8')]);
      }
    }
  };
  walk(root);
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
   * Deliberately narrow on the right-hand side: the match requires an identifier whose NAME
   * says secret/token/key, which is what makes a false positive unlikely and a real one
   * unmissable. Comparing such a value to a literal, to undefined/null, or to a `.length` is
   * not the defect, so those are excluded.
   */
  it('never compares a secret, token or key with === or !== anywhere under functions/', () => {
    const offenders: string[] = [];
    // `[\w$]*` before the suffix must be ZERO-or-more, not one-or-more. A first draft used
    // `[A-Za-z_$][\w$]*(?:…)`, which requires a character BEFORE the suffix and so could not
    // match a bare identifier named exactly `token`, `secret` or `key` — i.e. it missed the very
    // line it was written to catch. Confirmed by re-introducing `token !== supabaseServiceKey`
    // and watching this test still pass, which is the only reason the bug was found.
    const pattern =
      /\b([\w$]*(?:[Ss]ecret|[Tt]oken|[Kk]ey))\b\s*(?:===|!==)\s*([A-Za-z_$][\w$.]*)/g;

    for (const [path, source] of edgeFunctionSources()) {
      // Strip comments so the explanatory notes that quote the old expression — including the
      // one in send-confirmation-email/auth.ts and send-push-notification/index.ts — do not
      // register as code. That confusion is exactly how a deployed-bundle grep reported the
      // MYK9-404 fix as absent when it was present.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const [match, left, right] of code.matchAll(pattern)) {
        if (/^(undefined|null|true|false)$/.test(right)) continue;
        if (/\.length$/.test(right)) continue;
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
