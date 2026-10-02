/**
 * What a person or dog detail page shows, decided in ONE place from every input at
 * once (MYK9-930). The pages render purely from this state, so two branches can
 * never disagree about the same inputs (the failure Codex found three times: a
 * skeleton hiding an error, an empty roster read as "not found").
 *
 * Precedence, highest first:
 *   1. error    A read failed. Always wins, so the retry is always reachable, even
 *               while identity is unresolved or the roster is empty.
 *   2. loading  A read is in flight, or the viewer's identity is unresolved. An
 *               empty roster is not an answer until both have settled.
 *   3. denied   Everything resolved and this viewer may not open the record.
 *   4. notFound Everything resolved, access is fine, and the record is absent.
 *   5. ready    The record is present and openable.
 */
export type DetailPageState = 'error' | 'loading' | 'denied' | 'notFound' | 'ready';

export interface DetailPageInputs {
  /** The viewer's identity (RBAC and their own people row) has resolved. */
  identity: 'resolved' | 'unresolved';
  /** The roster/record read: in flight, settled, or failed. */
  read: 'loading' | 'success' | 'error';
  /** The record is available (live, just created, or held while a delete runs). */
  recordPresent: boolean;
  /** Whether this viewer may open the record. Ignored until identity has resolved. */
  access: 'allowed' | 'denied';
}

export function resolveDetailPageState(inputs: DetailPageInputs): DetailPageState {
  if (inputs.read === 'error') return 'error';
  if (inputs.read === 'loading' || inputs.identity === 'unresolved') return 'loading';
  if (inputs.access === 'denied') return 'denied';
  if (!inputs.recordPresent) return 'notFound';
  return 'ready';
}
