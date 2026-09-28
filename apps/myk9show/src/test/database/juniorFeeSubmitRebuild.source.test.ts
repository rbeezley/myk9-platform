import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const juniorFeeVersion = '20260928174700';

describe('junior fee survives later submit_show_entries rebuilds', () => {
  it('requires every later full RPC definition to preserve the junior override', () => {
    for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql'))) {
      if (file.slice(0, 14) <= juniorFeeVersion) continue;
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*--.*$/gm, '');
      if (/create\s+or\s+replace\s+function\s+public\.submit_show_entries\s*\(/i.test(sql)) {
        const definition = sql.match(
          /create\s+or\s+replace\s+function\s+public\.submit_show_entries\s*\([\s\S]*?\bAS\s+\$(\w*)\$[\s\S]*?\$\1\$/i
        )?.[0];
        expect(
          definition,
          `${file} rebuilt submit_show_entries without a complete body`
        ).toBeDefined();
        expect(
          definition,
          `${file} rebuilt submit_show_entries without the private junior-status decision`
        ).toMatch(/private\.entry_handler_is_junior\s*\(/i);
      }
    }
  });
});
