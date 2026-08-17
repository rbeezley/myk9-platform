// Error shaping for the database layer — deliberately client-free.
//
// This lives apart from `supabaseClient.ts` because that module constructs a
// Supabase client at import time, so a caller wanting only the error shape had
// to pay for a client. The global test mock (`src/test/setup.ts`) is exactly
// such a caller: it used to carry a hand-written copy of `createDatabaseError`,
// and that copy drifted — it returned `code: undefined` for `Error` inputs,
// which production never did. The divergence failed in both directions, turning
// unrelated tests red and hiding real code-propagation gaps (MYK9-177).
//
// With the helper here, `setup.ts` imports the real function instead of
// re-implementing it, so the mock cannot disagree with production again.
// `supabaseClient.ts` re-exports both names, so every existing call site that
// imports from there is unchanged.

// Type-safe error handling
export interface DatabaseError extends Error {
  name: string;
  message: string;
  details?: string;
  hint?: string;
  code?: string;
  table?: string;
  operation?: string;
}

export const createDatabaseError = (
  error: unknown,
  table?: string,
  operation?: string
): DatabaseError => {
  // Type guard for error objects. Reading the fields off any object — including
  // an `Error` instance — is intentional: `translatePersonIdentityError` and
  // `translateClubIdentityError` return an `Error` carrying `code`/`details`/
  // `hint` as own properties, so a code must survive that path too.
  const err =
    error && typeof error === 'object'
      ? (error as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
        })
      : {};

  return {
    name: 'DatabaseError',
    message: err.message || 'Database operation failed',
    ...(import.meta.env.DEV && { details: err.details, hint: err.hint }),
    code: err.code,
    table,
    operation,
  } as DatabaseError;
};
