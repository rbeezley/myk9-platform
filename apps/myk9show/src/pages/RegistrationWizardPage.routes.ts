export function isShowDeskLateEntryMode(searchParams: URLSearchParams): boolean {
  return searchParams.get('source') === 'show-desk' && searchParams.get('entryMode') === 'late';
}

export function resolveRegistrationCompletionPath(
  showId: string,
  isLateEntryMode: boolean
): string {
  const encodedShowId = encodeURIComponent(showId);
  return isLateEntryMode
    ? `/secretary/shows/${encodedShowId}/show-desk`
    : `/shows/${encodedShowId}`;
}
