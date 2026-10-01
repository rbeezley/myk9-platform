/**
 * One canonical form for user-supplied website URLs, used both when saving
 * (validation) and when rendering stored values as links, so the displayed
 * label and the href can never disagree about the destination.
 *
 * Accepts only http(s) URLs with a dotted host and NO credentials: a website
 * never legitimately carries `user:pass@`, and `https://good.org\t@evil.com`
 * parses (the URL parser strips tabs/newlines) as host `evil.com` with
 * userinfo `good.org`, which would spoof the displayed domain.
 */

// Any `scheme://` prefix, not just http(s) — otherwise `ftp://x.org` is
// mistaken for a bare domain and gets `https://` prepended on top of it.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Returns the canonical `https?://…` string, or null when unsafe/unparseable. */
export function canonicalizeWebsiteUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  // `mailto:info@x.org` becomes `https://mailto:info@x.org`, which parses with
  // credentials and is rejected below.
  const candidate = HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // `new URL('https://word')` accepts a single word; a website needs a dot.
  if (!url.hostname.includes('.')) return null;
  if (url.username || url.password) return null;

  return url.toString();
}

export interface SafeWebsiteLink {
  /** Canonical absolute URL; safe to use as an href. */
  href: string;
  /** Host plus any path/query, derived from the same canonical URL as `href`. */
  label: string;
}

/** For rendering a stored (possibly raw/legacy) value as a link; null means render no link. */
export function getSafeWebsiteLink(value: string | null | undefined): SafeWebsiteLink | null {
  const href = canonicalizeWebsiteUrl(value);
  if (!href) return null;
  const url = new URL(href);
  const rest = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
  return { href, label: `${url.host}${rest}` };
}
