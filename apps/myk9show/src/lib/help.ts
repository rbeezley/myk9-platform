/**
 * Links into the public help site (a separate Astro/Vercel project served at
 * help.myk9show.com). Centralized so a domain change is a one-line edit and
 * deep-links from in-app surfaces stay a single call: helpUrl('secretary-guide').
 *
 * The guide slugs mirror the routes published by apps/docs.
 */
export const HELP_BASE_URL = 'https://help.myk9show.com';

export type HelpGuideSlug =
  | 'exhibitor-guide'
  | 'secretary-guide'
  | 'club-admin-guide';

/**
 * Build a URL into the help site. With no slug it points at the help home;
 * with a slug it deep-links the matching role guide.
 */
export function helpUrl(slug?: HelpGuideSlug): string {
  return slug ? `${HELP_BASE_URL}/guides/${slug}` : HELP_BASE_URL;
}
