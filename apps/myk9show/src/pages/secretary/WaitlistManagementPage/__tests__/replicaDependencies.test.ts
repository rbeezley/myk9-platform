// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WAITLIST_READ_TABLES } from '../replicaDependencies';

describe('Waitlist tab replica dependencies', () => {
  it('lists exactly the replica tables the waitlist readers import', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../../services/database/waitlists/reads.ts'),
      'utf8'
    );
    const read = [
      ...source.matchAll(
        /^import \{[^}]*\} from '@\/services\/replication\/(Replicated\w+Table)';$/gm
      ),
    ]
      .map(match => match[1])
      .sort();

    expect(read.length).toBeGreaterThan(0);
    expect(WAITLIST_READ_TABLES.map(t => t.module).sort()).toEqual(read);
  });
});
