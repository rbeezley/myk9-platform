import { describe, expect, it } from 'vitest';
import { EMAIL_VIEWER_SANDBOX, emailHtmlForViewer } from './emailViewerHtml';

// MYK9-2487: clicking "See your entries in My Shows" inside a stored email navigated the viewer's
// frame to myk9show.com, which refuses to be framed, and the email was replaced by an error page.

const linksOf = (html: string) =>
  Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('a, area'));

describe('emailHtmlForViewer', () => {
  it('sends a plain link to a new tab, so a click cannot navigate the frame', () => {
    const html = emailHtmlForViewer(
      '<html><head><title>x</title></head><body><a href="https://myk9show.com/exhibitor/entries">See your entries in My Shows</a></body></html>'
    );

    const [link] = linksOf(html);
    expect(link?.getAttribute('href')).toBe('https://myk9show.com/exhibitor/entries');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.textContent).toBe('See your entries in My Shows');
  });

  it('overrides a target that would navigate the frame or its parents', () => {
    const html = emailHtmlForViewer(
      '<a href="https://a.example" target="_self">a</a><a href="https://b.example" target="_top">b</a><map><area href="https://c.example" target="_parent"></map>'
    );

    expect(linksOf(html).map(link => link.getAttribute('target'))).toEqual([
      '_blank',
      '_blank',
      '_blank',
    ]);
  });

  it('adds one base target and drops any the email carried', () => {
    const html = emailHtmlForViewer(
      '<html><head><base target="_top" href="https://evil.example/"></head><body><p>Hi</p></body></html>'
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const bases = Array.from(doc.querySelectorAll('base'));
    expect(bases).toHaveLength(1);
    expect(bases[0]?.getAttribute('target')).toBe('_blank');
    expect(bases[0]?.hasAttribute('href')).toBe(false);
  });

  it('keeps the email text and markup, and the doctype only when the email had one', () => {
    const withDoctype = emailHtmlForViewer(
      '<!DOCTYPE html><html><body><p style="margin:0">Venue</p></body></html>'
    );
    const without = emailHtmlForViewer('<p style="margin:0">Venue</p>');

    expect(withDoctype.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(without.startsWith('<!DOCTYPE')).toBe(false);
    expect(withDoctype).toContain('<p style="margin:0">Venue</p>');
    expect(without).toContain('<p style="margin:0">Venue</p>');
  });

  it('leaves an anchor with no href alone', () => {
    const [anchor] = linksOf(emailHtmlForViewer('<a name="top">Top</a>'));

    expect(anchor?.hasAttribute('target')).toBe(false);
  });
});

describe('EMAIL_VIEWER_SANDBOX', () => {
  it('allows new tabs and nothing that runs code, posts a form or shares the origin', () => {
    const tokens = EMAIL_VIEWER_SANDBOX.split(' ');

    expect(tokens.sort()).toEqual(['allow-popups', 'allow-popups-to-escape-sandbox']);
    for (const forbidden of [
      'allow-scripts',
      'allow-forms',
      'allow-same-origin',
      'allow-top-navigation',
    ]) {
      expect(tokens).not.toContain(forbidden);
    }
  });
});
