import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NOT_READ_RPC_NAMES,
  READ_RPC_NAMES,
  READ_RPC_PREFIX,
  isReadRpc,
} from '../../../scripts/landing-capture/guardRules';

// The capture guard lets an RPC leave the browser when its name says it reads
// (scripts/landing-capture/guardRules.ts). A name proves nothing, so this test ties the rule
// to the database: an RPC passes only if its latest definition in supabase/migrations is
// declared STABLE or IMMUTABLE, which Postgres enforces (such a function cannot change data).
// A read-named function without that declaration must be on NOT_READ_RPC_NAMES, and is refused.

const MIGRATIONS = resolve(__dirname, '../../../../../supabase/migrations');

/** Timestamped migrations run after the numbered ones, each group in name order. */
const order = (file: string) => (/^\d{14}/.test(file) ? `1${file}` : `0${file.padStart(80, '0')}`);

/** Whether each function's latest definition is declared read-only, by function name. */
function latestVolatility(): Map<string, { readOnly: boolean; file: string }> {
  const latest = new Map<string, { readOnly: boolean; file: string }>();
  const files = readdirSync(MIGRATIONS)
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => (order(a) < order(b) ? -1 : 1));
  const create = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z_0-9]+)"?\s*\(/gi;
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS, file), 'utf8').replace(/--.*$/gm, '');
    const starts = [...sql.matchAll(create)];
    starts.forEach((match, i) => {
      const name = match[1];
      if (name === undefined) return;
      const end = starts[i + 1]?.index ?? sql.length;
      // The volatility is declared outside the dollar-quoted body.
      const declaration = sql.slice(match.index, end).replace(/\$([a-z_]*)\$[\s\S]*?\$\1\$/gi, ' ');
      latest.set(name.toLowerCase(), {
        readOnly: /\b(STABLE|IMMUTABLE)\b/i.test(declaration),
        file,
      });
    });
  }
  return latest;
}

describe('RPCs the capture guard treats as reads', () => {
  const functions = latestVolatility();
  const readNamed = [...functions.keys()].filter(
    name => READ_RPC_PREFIX.test(name) || READ_RPC_NAMES.has(name)
  );

  it('found the migrations and the functions the rule is about (positive control)', () => {
    expect(functions.size).toBeGreaterThan(200);
    expect(readNamed.length).toBeGreaterThan(50);
    expect(functions.get('ringside_update_entry')?.readOnly).toBe(false);
    expect(functions.get('is_site_admin')?.readOnly).toBe(true);
  });

  it('lists exactly the read-named functions the database does not declare read-only', () => {
    const mayWrite = readNamed.filter(name => !functions.get(name)?.readOnly).sort();
    expect(mayWrite).toEqual([...NOT_READ_RPC_NAMES].sort());
  });

  it('passes only functions the database declares read-only', () => {
    const passed = [...functions.keys()].filter(isReadRpc);
    expect(passed.length).toBeGreaterThan(50);
    for (const name of passed) {
      expect(functions.get(name), name).toMatchObject({ readOnly: true });
    }
  });

  it('declares the two reads that are passed by name, and refuses the ones that may write', () => {
    for (const name of READ_RPC_NAMES) {
      expect(functions.get(name), name).toMatchObject({ readOnly: true });
      expect(isReadRpc(name)).toBe(true);
    }
    for (const name of NOT_READ_RPC_NAMES) expect(isReadRpc(name), name).toBe(false);
    expect(isReadRpc('get_show_access_codes')).toBe(false);
    expect(isReadRpc('ringside_update_entry')).toBe(false);
  });
});
