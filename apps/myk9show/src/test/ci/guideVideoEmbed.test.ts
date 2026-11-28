// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { embedGuideVideos } from '../../../../docs/scripts/videoEmbed.mts';

/**
 * A guide marks a how-to video with a plain "Watch:" line holding a youtu.be link (MYK9-2189).
 * The help site turns that line into the player; everywhere else it stays a link. These tests
 * hold the rewrite to exactly that line, and hold each guide's video to its own section.
 */
const guide = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../../../../../docs/user-guides', name), 'utf8');

describe('embedGuideVideos', () => {
  it('turns a Watch line into the player and keeps the link under it', () => {
    const html = embedGuideVideos(
      '## Enter\n\n> **Watch:** [How to enter a show (1 min 24 s)](https://youtu.be/J2gw-w8I2gE)\n\nText.'
    );
    expect(html).toBe(
      [
        '## Enter',
        '',
        '<figure class="guide-video">',
        '<iframe src="https://www.youtube-nocookie.com/embed/J2gw-w8I2gE" title="How to enter a show" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>',
        '<figcaption>Watch: <a href="https://youtu.be/J2gw-w8I2gE">How to enter a show (1 min 24 s)</a></figcaption>',
        '</figure>',
        '',
        'Text.',
      ].join('\n')
    );
  });

  it('keeps the words after the link as the caption note, escaped', () => {
    const html = embedGuideVideos(
      '> **Watch before show day:** [Score a dog](https://youtu.be/1d6sVXNVDak) Needs a signal & <5 min.'
    );
    expect(html).toContain(
      '<figcaption>Watch before show day: <a href="https://youtu.be/1d6sVXNVDak">Score a dog</a> Needs a signal &amp; &lt;5 min.</figcaption>'
    );
  });

  it.each([
    ['a link in a sentence', 'See [the video](https://youtu.be/J2gw-w8I2gE) for more.'],
    ['a link that is not a video', '> **Watch:** [Guide](https://help.myk9show.com/guides)'],
    ['another kind of note', '> **Tip:** [Video](https://youtu.be/J2gw-w8I2gE)'],
    ['an id of the wrong length', '> **Watch:** [Video](https://youtu.be/short)'],
    ['a playlist', '[Playlist](https://www.youtube.com/playlist?list=PLf1-NSG71E4o)'],
    ['a Watch line inside a list', '- > **Watch:** [Video](https://youtu.be/J2gw-w8I2gE)'],
    ['a nested blockquote', '> > **Watch:** [Video](https://youtu.be/J2gw-w8I2gE)'],
    ['an http link', '> **Watch:** [Video](http://youtu.be/J2gw-w8I2gE)'],
    ['a title holding a bracket', '> **Watch:** [Video [new]](https://youtu.be/J2gw-w8I2gE)'],
  ])('leaves %s as written', (_case, markdown) => {
    expect(embedGuideVideos(markdown)).toBe(markdown);
  });
});

describe('the guides carry each how-to video in its own section', () => {
  const sectionOf = (markdown: string, heading: string) => {
    const start = markdown.indexOf(`\n${heading}\n`);
    expect(start, `heading not found: ${heading}`).toBeGreaterThan(-1);
    const next = markdown.indexOf('\n## ', start + heading.length + 1);
    return markdown.slice(start, next === -1 ? undefined : next);
  };

  it.each([
    ['judge-steward-quickstart.md', '## See the run order', 'UBEsVB1ssag'],
    ['judge-steward-quickstart.md', '## Score a dog', '1d6sVXNVDak'],
    ['judge-steward-quickstart.md', '## When the signal drops', 'ObID-sB29v4'],
    ['secretary-guide.md', '## 1 · Create a show, its trials, and its classes', 'IAltmLZVG9A'],
    ['secretary-guide.md', '## 3 · Edit a show, or reassign a judge', '2Loklv39bVI'],
    ['secretary-guide.md', '## 11 · Set the run order', 'mKj5PIHfAmY'],
    ['secretary-guide.md', '## 18 · Check dogs in', 'mKj5PIHfAmY'],
    ['secretary-guide.md', '## 23 · Release results to exhibitors', 'INYaO2cTmgw'],
    ['exhibitor-guide.md', '## Section 3 — Add Your Dog', '3LBeFqQrNGg'],
    ['exhibitor-guide.md', '## Section 4 — Enter a Show', 'J2gw-w8I2gE'],
  ])('%s, "%s"', (file, heading, id) => {
    const html = embedGuideVideos(sectionOf(guide(file), heading));
    expect(html).toContain(`https://www.youtube-nocookie.com/embed/${id}`);
    expect(html.match(/<iframe /g)).toHaveLength(1);
  });

  // MYK9-2374: each role's overview video sits above its guide's first section.
  it.each([
    ['secretary-guide.md', 'BsFynPKdU7o'],
    ['judge-steward-quickstart.md', 'ArI51_l_2pg'],
    ['exhibitor-guide.md', 'oPArgY21hw4'],
    ['club-admin-guide.md', 'bAQBMxBGSkw'],
  ])('%s opens with its overview video', (file, id) => {
    const markdown = guide(file);
    const top = markdown.slice(0, markdown.indexOf('\n## '));
    const html = embedGuideVideos(top);
    expect(html).toContain(`https://www.youtube-nocookie.com/embed/${id}`);
    expect(html.match(/<iframe /g)).toHaveLength(1);
    expect(markdown.split(`youtu.be/${id}`).length - 1).toBe(1);
  });

  it('prints the address in place of the player', () => {
    const css = readFileSync(
      resolve(import.meta.dirname, '../../../../docs/src/styles/global.css'),
      'utf8'
    );
    const print = css.slice(css.indexOf('@media print'));
    expect(print).toMatch(/\.guide-video iframe \{\s*display: none;/);
    expect(print).toContain("content: ' (' attr(href) ')';");
  });

  // YouTube's newer playlist ids are short: PL plus 11 characters, not the older 34. Each of
  // these was opened signed out on 2026-11-18 and its page title is the playlist's name.
  it.each([
    ['judge-steward-quickstart.md', 'myK9Show - Judges and Stewards', 'PLNz_qO-RIZtg'],
    ['secretary-guide.md', 'myK9Show - Secretaries', 'PLPE_AEgvi2AU'],
    ['exhibitor-guide.md', 'myK9Show - Exhibitors', 'PLf1-NSG71E4o'],
  ])('%s links the "%s" playlist', (file, name, id) => {
    expect(sectionOf(guide(file), '## Still need help?')).toContain(
      `[${name}](https://www.youtube.com/playlist?list=${id})`
    );
  });

  it('tells a judge the scoring video is for before show day', () => {
    const section = sectionOf(guide('judge-steward-quickstart.md'), '## Score a dog');
    expect(section).toContain('**Watch before show day:**');
    expect(section).toContain('The video needs a signal. Scoring at the ring does not.');
  });
});
