/**
 * Deploy myK9Show's env placeholder guard (MYK9-1699). `vercel pull` cannot
 * read back env vars marked Sensitive, so it writes the literal `[SENSITIVE]`
 * into .vercel/.env.production.local and `vercel build` bakes it into the
 * bundle (VITE_VAPID_PUBLIC_KEY='[SENSITIVE]' silently broke push). Fails the
 * deploy when any pulled VITE_* value (the ones Vite inlines into the bundle)
 * is that placeholder. Never prints a value.
 *
 *   SENSITIVE_PLACEHOLDER_ALLOWLIST=KEY_A,KEY_B node --experimental-strip-types scripts/qa/vercel-env-placeholder-guard.ts [env-file]
 *
 * The workflow runs from the repo root, where `vercel pull` writes `.vercel/`.
 * Exit 0 = clean (allowlisted keys warn); 1 = placeholder found or file missing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PLACEHOLDER = '[SENSITIVE]';
export const DEFAULT_ENV_FILE = '.vercel/.env.production.local';
export const BUNDLED_PREFIX = 'VITE_';

export interface GuardResult {
  code: 0 | 1;
  errors: string[];
  warnings: string[];
}

/** Keys whose value is the placeholder, in file order. Handles quotes and `export `. */
export function placeholderKeys(content: string): string[] {
  const keys: string[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    const key = match?.[1];
    const rawValue = match?.[2];
    if (key === undefined || rawValue === undefined) continue;
    let value = rawValue.trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.indexOf(quote, 1) > 0) {
      value = value.slice(1, value.indexOf(quote, 1));
    }
    if (value === PLACEHOLDER) keys.push(key);
  }
  return keys;
}

export function evaluateEnvFile(
  content: string | undefined,
  allowlist: string | undefined
): GuardResult {
  if (content === undefined) {
    return {
      code: 1,
      errors: [
        `${DEFAULT_ENV_FILE} is missing: cannot prove the pulled env has no [SENSITIVE] placeholder (did vercel pull run?)`,
      ],
      warnings: [],
    };
  }
  const allowed = new Set(
    (allowlist ?? '')
      .split(',')
      .map(k => k.trim())
      .filter(Boolean)
  );
  const errors: string[] = [];
  const warnings: string[] = [];
  // Only VITE_* values are inlined into the browser bundle. Build-time secrets
  // (SENTRY_AUTH_TOKEN and friends) legitimately pull as placeholders.
  for (const key of placeholderKeys(content).filter(k => k.startsWith(BUNDLED_PREFIX))) {
    if (allowed.has(key)) {
      warnings.push(
        `${key} is the [SENSITIVE] placeholder and will be baked into the bundle as-is; allowed only until re-added as a non-sensitive Config variable (MYK9-1699)`
      );
    } else {
      errors.push(
        `${key} pulled as [SENSITIVE]: Vercel cannot expose a Sensitive variable to the build. Re-add ${key} in the Vercel project settings as a non-sensitive variable.`
      );
    }
  }
  return { code: errors.length ? 1 : 0, errors, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? DEFAULT_ENV_FILE;
  const content = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  const result = evaluateEnvFile(content, process.env.SENSITIVE_PLACEHOLDER_ALLOWLIST);
  for (const w of result.warnings) console.log(`::warning::${w}`);
  for (const e of result.errors) console.log(`::error::${e.replace(DEFAULT_ENV_FILE, file)}`);
  if (result.code === 0) console.log('vercel-env-placeholder-guard: PASS');
  process.exitCode = result.code;
}
