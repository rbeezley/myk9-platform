/**
 * Landing capture (MYK9-2181): downloads the web fonts index.html links, before the job
 * closes the capture's network, so the capture can be set in the app's own fonts.
 *
 *   pnpm exec tsx src/test/e2e/capture/downloadFonts.ts <out dir>
 *
 * Writes the stylesheet as the browser is served it, each font file it names, and a manifest
 * from font URL to file name (helpers/landingCapture.ts, serveFontsFrom). Plain GETs to
 * Google Fonts, the same ones any visitor's browser makes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FONT_MANIFEST_FILE,
  FONT_STYLESHEET_FILE,
  fontFileUrls,
  fontStylesheetUrl,
} from '../helpers/landingCapture';

const outDir = process.argv[2];
if (!outDir) {
  console.error('Usage: downloadFonts.ts <out dir>');
  process.exit(2);
}

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const stylesheet = fontStylesheetUrl(readFileSync(join(appDir, 'index.html'), 'utf8'));

// Google Fonts answers by browser: a current Chrome gets woff2 with unicode ranges, which is
// what the capture's Chromium would be served.
const headers = {
  'user-agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};
const get = async (url: string) => {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  return response;
};

mkdirSync(outDir, { recursive: true });
const css = await (await get(stylesheet)).text();
const urls = fontFileUrls(css);
if (urls.length === 0) throw new Error('The font stylesheet names no font files');

const manifest: Record<string, string> = {};
for (const [index, url] of urls.entries()) {
  const file = `font-${index}.woff2`;
  writeFileSync(join(outDir, file), Buffer.from(await (await get(url)).arrayBuffer()));
  manifest[url] = file;
}
writeFileSync(join(outDir, FONT_STYLESHEET_FILE), css);
writeFileSync(join(outDir, FONT_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Saved ${urls.length} font files and the stylesheet to ${outDir}`);
