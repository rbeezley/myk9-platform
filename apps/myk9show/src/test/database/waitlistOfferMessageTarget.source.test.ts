import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../../services/database/waitlists/reads.ts'),
  'utf8'
);

describe('waitlist offer message target wiring', () => {
  it('maps waitlist exhibitor_id through exhibitor_profiles before messaging', () => {
    expect(source).toContain("from('exhibitor_profiles')");
    expect(source).toContain('person:person_id(first_name, last_name)');
    expect(source).toContain("logQuery('exhibitor_profiles', 'waitlist_offer_message_target'");
    expect(source).not.toContain("from('people')");
  });
});
