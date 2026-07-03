export function isShowDeskLateEntryMode(searchParams: URLSearchParams): boolean {
  return searchParams.get('source') === 'show-desk' && searchParams.get('entryMode') === 'late';
}

export function buildExhibitorRegistrationPath(showId: string): string {
  return `/shows/${encodeURIComponent(showId)}/register`;
}

export function buildSecretaryRegistrationPath(showId: string): string {
  return `/secretary/register/${encodeURIComponent(showId)}`;
}

export function buildShowDeskLateEntryPath(showId: string): string {
  return `${buildSecretaryRegistrationPath(showId)}?source=show-desk&entryMode=late`;
}

export function resolveRegistrationExitPath(
  showId: string,
  isLateEntryMode: boolean
): string | null {
  if (!isLateEntryMode) return null;
  return `/shows/${encodeURIComponent(showId)}/show-desk`;
}

export function resolveRegistrationCompletionPath(
  showId: string,
  isLateEntryMode: boolean
): string {
  return (
    resolveRegistrationExitPath(showId, isLateEntryMode) ?? `/shows/${encodeURIComponent(showId)}`
  );
}
