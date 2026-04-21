import { useQuery } from '@tanstack/react-query';
import { useMemo, type CSSProperties } from 'react';
import { replicatedShowsTable } from '@/services/replication';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

/**
 * Returns a style object setting `--show-accent` to the show's configured
 * accent hex, or `undefined` if the show has no (or malformed) accent.
 *
 * Reads from the replicated shows table so it works offline. Strict hex
 * validation prevents CSS injection from operator-entered data. Memoized so
 * the returned object has a stable reference across renders — matters when
 * the style is passed down to memoized children.
 */
export function useShowAccent(showId: string | undefined): CSSProperties | undefined {
  const { data: show } = useQuery({
    queryKey: ['show', showId],
    queryFn: () => (showId ? replicatedShowsTable.getShowById(showId) : null),
    enabled: !!showId,
    staleTime: 60_000,
  });

  const hex = show?.accent_color;
  return useMemo(() => {
    if (typeof hex !== 'string' || !HEX_PATTERN.test(hex)) return undefined;
    return { '--show-accent': hex } as CSSProperties;
  }, [hex]);
}
