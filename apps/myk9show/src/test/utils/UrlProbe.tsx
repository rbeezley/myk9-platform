import { useLocation } from 'react-router-dom';

/** Renders the current query string so a test can assert what a control wrote to the URL. */
export function UrlProbe() {
  return <output data-testid="url-search">{useLocation().search}</output>;
}

export function readUrlParams(text: string | null): URLSearchParams {
  return new URLSearchParams(text ?? '');
}
