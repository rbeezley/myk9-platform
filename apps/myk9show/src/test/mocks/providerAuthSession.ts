/**
 * MYK9-1992: `ReplicationSyncProvider.triggerSync` reads `supabase.auth.getSession()` to defer
 * until a session exists. Provider tests that mock `supabase.auth` spread this in so a live
 * session answers, and add only the `onAuthStateChange` they drive.
 */
export const providerAuthSessionStub = {
  getSession: () =>
    Promise.resolve({
      data: { session: { access_token: 'tok', user: { id: 'u1' } } },
      error: null,
    }),
};
