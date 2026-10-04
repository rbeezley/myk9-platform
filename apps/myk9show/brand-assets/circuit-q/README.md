# myK9Show circuit-Q logo

The current approved logo is the flat copper, left-facing dog whose tail forms the
leg of the Q, with subtle circuit details. Its traced vector contours preserve the
owner-approved artwork, including the outlined serif lettering.

## Current application assets

- [`../../public/logo.svg`](../../public/logo.svg) — full horizontal logo, used on
  the public landing page and sign-in card. Outlined letters; no font dependency.
- [`../../public/brand-mark.svg`](../../public/brand-mark.svg) — the exact emblem
  extracted from the same paths, used in the compact app header and About dialog.
- `public/brand-mark-{64,128}.png` — transparent emblem raster fallbacks.
- `public/logo.png` and `public/logo.webp` — 1024 px transparent emblem fallbacks;
  WebP remains lossless.
- `public/favicon-{16,32}x{16,32}.png` and `public/favicon.ico` — browser icons;
  ICO contains 16, 32, and 48 px representations.
- `public/pwa-{192,512}x{192,512}.png` and `public/apple-touch-icon.png` — emblem
  on a full-bleed cream square, without baked-in rounded corners.
- `public/pwa-maskable-512x512.png` — 20% inset around the square emblem. Its
  visible contours fit inside the central 80%-diameter safe circle.
- `public/notification-badge-96.png` — white emblem with transparent background.

The master fill is `#b64a11`. In-app images brighten in dark mode. Keep the app's
existing theme colors; this asset replacement does not change the design tokens.
All raster exports come from the SVG emblem, never from a newly generated image.
The full logo and emblem have transparent negative space, including the circuits.

## Earlier concepts (historical only)

The files below predate the approved vector design and are retained as historical
concepts. They are not the application's current exports.

## Master files

- `myk9show-circuit-q-transparent-final.png` — 1254 × 1254 transparent master
- `source/myk9show-circuit-q-chroma.png` — original generated image on green, retained as the source of record
- `myk9show-favicon.ico` — 32 px browser fallback

## Exports

The `png/` directory contains:

- transparent logo exports at 1024, 512, and 256 px
- transparent icon and favicon exports at 64, 32, and 16 px
- cream-background app icons at 512, 192, and 180 px
- a padded 512 px maskable PWA icon
- 1024 px cream and warm-black presentation variants
