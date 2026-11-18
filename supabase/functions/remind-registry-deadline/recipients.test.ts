// @vitest-environment node
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import { describe, expect, it, vi } from 'vitest';
import { resolveNamedSecretaryEmails } from './recipients.ts';

const SHOW_ID = 'a0000000-0000-4000-8000-000000002077';

/** `show_officials` rows already filtered the way the query asks; records the filters used. */
function fakeSupabase(result: { data: unknown; error: { message: string } | null }) {
  const eq = vi.fn();
  const select = vi.fn();
  const chain = {
    select: (columns: string) => {
      select(columns);
      return chain;
    },
    eq: (column: string, value: string) => {
      eq(column, value);
      return Object.assign(Promise.resolve(result), chain);
    },
  };
  const from = vi.fn().mockReturnValue(chain);
  return { client: { from } as unknown as SupabaseClient, from, eq, select };
}

describe('resolveNamedSecretaryEmails', () => {
  it('reads the named secretary from show_officials, not the club admin', async () => {
    const { client, from, eq } = fakeSupabase({
      data: [{ role: 'secretary', people: { email: 'named.secretary@example.com' } }],
      error: null,
    });
    // The club admin (a user_roles row) is a different person and is never read.
    const emails = await resolveNamedSecretaryEmails(client, SHOW_ID);
    expect(emails).toEqual(['named.secretary@example.com']);
    expect(from).toHaveBeenCalledWith('show_officials');
    expect(eq).toHaveBeenCalledWith('show_id', SHOW_ID);
    expect(eq).toHaveBeenCalledWith('role', 'secretary');
  });

  it('drops blank and malformed addresses and de-duplicates by lower case', async () => {
    const { client } = fakeSupabase({
      data: [
        { people: { email: 'Sec@Example.com' } },
        { people: { email: ' sec@example.com ' } },
        { people: { email: '' } },
        { people: { email: 'not-an-address' } },
        { people: null },
      ],
      error: null,
    });
    expect(await resolveNamedSecretaryEmails(client, SHOW_ID)).toEqual(['Sec@Example.com']);
  });

  it('skips a secretary whose person record was soft-deleted', async () => {
    const { client } = fakeSupabase({
      data: [
        { people: { email: 'former@example.com', deleted_at: '2026-11-01T00:00:00Z' } },
        { people: { email: 'current@example.com', deleted_at: null } },
      ],
      error: null,
    });
    expect(await resolveNamedSecretaryEmails(client, SHOW_ID)).toEqual(['current@example.com']);
  });

  it('returns nobody for a successful lookup with no secretary named', async () => {
    const { client } = fakeSupabase({ data: [], error: null });
    expect(await resolveNamedSecretaryEmails(client, SHOW_ID)).toEqual([]);
  });

  it('throws on a failed lookup instead of reading it as nobody', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    await expect(resolveNamedSecretaryEmails(client, SHOW_ID)).rejects.toMatchObject({
      status: 500,
    });
  });
});
