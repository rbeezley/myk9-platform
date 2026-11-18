// A guide marks a how-to video with one plain Markdown line:
//
//   > **Watch:** [How to enter a show (1 min 24 s)](https://youtu.be/J2gw-w8I2gE)
//
// That line reads as an ordinary link in the repo, on GitHub and in the copy AskQ answers
// from. On the help site it becomes the player, with the link kept underneath for anyone whose
// browser blocks the player. Any words after the link stay as the caption's note.
//
// Only a youtu.be link on a "Watch…" line of its own is rewritten. Every other link is left
// exactly as written.

const WATCH_LINE =
  /^> \*\*(Watch[^*:\n]*):\*\* \[([^\]\n]+)\]\(https:\/\/youtu\.be\/([A-Za-z0-9_-]{11})\)[ \t]*([^\n]*)$/gm;

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The player's accessible name: the link text without its "(1 min 24 s)" length. */
const withoutLength = (text: string): string => text.replace(/\s*\([^)]*\)\s*$/, '');

export function embedGuideVideos(markdown: string): string {
  return markdown.replace(
    WATCH_LINE,
    (_line: string, label: string, text: string, id: string, note: string) => {
      const caption = [
        `${escapeHtml(label)}: <a href="https://youtu.be/${id}">${escapeHtml(text)}</a>`,
        note.trim() ? ` ${escapeHtml(note.trim())}` : '',
      ].join('');
      return [
        '<figure class="guide-video">',
        `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${escapeHtml(withoutLength(text))}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`,
        `<figcaption>${caption}</figcaption>`,
        '</figure>',
      ].join('\n');
    }
  );
}
