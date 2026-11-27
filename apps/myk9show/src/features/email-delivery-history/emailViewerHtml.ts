/**
 * The sandbox for a stored email (MYK9-2487). No scripts, no forms and no same-origin access:
 * none of those tokens is here. The two that are let a link open a new tab, and let that tab be
 * an ordinary page; without the second, myk9show.com would open inside the sandbox and not work.
 */
export const EMAIL_VIEWER_SANDBOX = 'allow-popups allow-popups-to-escape-sandbox';

/**
 * A stored email's html with every link sent to a new tab.
 *
 * In the viewer a plain link navigated the frame itself. myk9show.com refuses to be framed, so
 * "See your entries in My Shows" replaced the email with the browser's error page, and the only
 * way back was to close the dialog. A link can now never navigate the frame: each `<a>` and
 * `<area>` is given `target="_blank"`, whatever target it carried, and a `<base>` covers anything
 * else. `rel="noopener noreferrer"` keeps the new tab from reaching back.
 *
 * Parsed with DOMParser, which runs no script, and only link attributes are changed. A doctype
 * is written back only when the email had one, so the email renders in the mode it was sent in.
 */
export function emailHtmlForViewer(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  for (const link of Array.from(doc.querySelectorAll('a[href], area[href]'))) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }

  for (const stale of Array.from(doc.querySelectorAll('base'))) stale.remove();
  const base = doc.createElement('base');
  base.setAttribute('target', '_blank');
  doc.head.prepend(base);

  const doctype = doc.doctype ? '<!DOCTYPE html>' : '';
  return `${doctype}${doc.documentElement.outerHTML}`;
}
