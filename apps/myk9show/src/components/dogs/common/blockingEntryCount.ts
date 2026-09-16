/**
 * What the delete-dog dialog knows about the entries that would block a delete.
 *
 * `soft_delete_dog` refuses (MK002) when a dog has live paid or scored entries,
 * so the dialog fetches that count to explain the refusal up front. The count
 * therefore has THREE states, not two, and collapsing them is a real defect:
 * before MYK9-600 the prop was `number | undefined` and the dialog read
 * `(count ?? 0) > 0`, so a count that had not arrived, or had failed outright,
 * rendered as "nothing blocks this". The user got a plain, enabled Delete, no
 * override affordance, and an MK002 refusal with nowhere to go.
 *
 * Unknown is not zero. Keep these three cases distinct all the way to the
 * button's `disabled`.
 *
 * WHAT THIS DOES NOT COVER, precisely (MYK9-600 review). `error` means the
 * count QUERY failed — `countBlockingEntriesByDog` threw. It does not mean "the
 * count might be wrong". `countBlockingEntriesByDog` is an ordinary PostgREST
 * `head: true` count over `entries`, so rows RLS hides from this reader are not
 * an error at all: PostgREST returns `count: 0, error: null` and this maps to
 * `{ status: 'ready', count: 0 }`. A reader who cannot see a dog's paid entries
 * still gets a plain, enabled Delete.
 *
 * That residual case is caught server-side, not here: `soft_delete_dog` is
 * SECURITY DEFINER and refuses with MK002 regardless of what the client could
 * read, and MYK9-595 keeps the dialog mounted through a rejected delete so the
 * refusal is reported where the user is still looking. Closing the gap on the
 * client would mean replacing the count with a SECURITY DEFINER counting RPC
 * that sees exactly what the guard sees; until that exists, do not widen this
 * doc comment to claim RLS-hidden entries are handled.
 */
export type BlockingEntryCountState =
  | { status: 'pending' }
  /** `isRetrying` drives the Try again control's own busy state. */
  | { status: 'error'; isRetrying: boolean }
  | { status: 'ready'; count: number };

/**
 * A count nobody asked for. The dialog's default: a caller that does not track
 * blocking entries at all is asserting "not blocked", which is different from a
 * caller whose fetch is still in flight.
 */
export const NOT_BLOCKED: BlockingEntryCountState = { status: 'ready', count: 0 };

/** The subset of a React Query result this mapping needs. */
export interface BlockingEntryCountQueryLike {
  data?: number | undefined;
  isError?: boolean | undefined;
  isFetching?: boolean | undefined;
  isStale?: boolean | undefined;
}

/**
 * Maps a React Query result onto the state above.
 *
 * `isError` wins over `data`: React Query keeps the last successful value on a
 * failed refetch, and a stale count is exactly the thing that must not be
 * presented as current on a destructive, money-adjacent path.
 *
 * `isFetching && isStale` is the same rule applied to the case that actually
 * bit (MYK9-600 round-2 review). React Query retains `data` through
 * `enabled: false` — `gcTime` collects only at ZERO observers, and `DogDialogs`
 * keeps this observer mounted and merely toggles `enabled` with the dialog. So
 * a re-opened dialog holds the PREVIOUS open's number, and a mapper reading
 * only `isError`/`data` reported a confident `ready` for the whole refetch
 * window: an enabled Delete and "This action cannot be undone." over a count
 * that may have become 1 in between, with a fast click earning an MK002 toast.
 * A number with a fetch in flight over it is not a fact about now; it is the
 * same "unknown" as never having had one.
 */
export function toBlockingEntryCountState(
  query: BlockingEntryCountQueryLike
): BlockingEntryCountState {
  if (query.isError) return { status: 'error', isRetrying: query.isFetching === true };
  if (typeof query.data !== 'number') return { status: 'pending' };
  if (query.isFetching && query.isStale) return { status: 'pending' };
  return { status: 'ready', count: query.data };
}
