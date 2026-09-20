export interface MyEntriesDogState<TDog> {
  dogs: TDog[];
  hasDogs: boolean | undefined;
  currentUserPersonId: string | undefined;
}

/**
 * Keep account A's dog snapshot out of My Shows while account B resolves.
 * The global query client intentionally keeps previous data for fast
 * navigation, but dog ownership is account-scoped and drives both the page's
 * zero state and the Add Dog dialog's owner.
 */
export function deriveMyEntriesDogState<TDog>({
  ownerId,
  dogs,
  isLoading,
  isPlaceholderData,
}: {
  ownerId: string;
  dogs: TDog[];
  isLoading: boolean;
  isPlaceholderData: boolean;
}): MyEntriesDogState<TDog> {
  const visibleDogs = isPlaceholderData ? [] : dogs;

  return {
    dogs: visibleDogs,
    hasDogs: !ownerId
      ? false
      : isLoading || isPlaceholderData
        ? undefined
        : visibleDogs.length > 0,
    currentUserPersonId: ownerId || undefined,
  };
}
