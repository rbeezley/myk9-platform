import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations');
const juniorFeeVersion = '20260928174700';

describe('junior fee survives later submit_show_entries rebuilds', () => {
  it('requires every later full RPC definition to preserve the junior override', () => {
    for (const file of readdirSync(migrationsDir).filter(name => name.endsWith('.sql'))) {
      if (file.slice(0, 14) <= juniorFeeVersion) continue;
      const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
      if (/create\s+or\s+replace\s+function\s+public\.submit_show_entries\s*\(/i.test(sql)) {
        expect(sql, `${file} rebuilt submit_show_entries without junior pricing`).toContain(
          'junior_handler_fee'
        );
      }
    }
  });
});
