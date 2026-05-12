export function getSignInReturnTo(searchParams: URLSearchParams): string {
  return searchParams.get('returnTo') || '/';
}
