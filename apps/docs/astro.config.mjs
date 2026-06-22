import { defineConfig } from 'astro/config';

// Static docs site — myK9Show Guides.
// Output is plain static HTML/CSS; Vercel auto-detects Astro and serves the
// build output. No adapter needed for static output.
export default defineConfig({
  site: 'https://guides.myk9show.com',
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
