import { postgrestGetShowById } from './reads.postgrest';

/**
 * MYK9-779: one show's detail row as the server returns it to a signed-out
 * guest, or null when anon may not see it (a draft, a soft-deleted show, no
 * such id). Online-only by design: never the device replica, which holds
 * whatever an earlier signed-in session could see, and it throws on failure
 * so React Query reports an error instead of "not found".
 */
export async function getPublicShowById(id: string) {
  const { data } = await postgrestGetShowById(id, { publicOnly: true });
  return data ?? null;
}
