// Gazette palette + font stacks — single source of truth.
// Consumed by GazetteConfirmationEmail (React Email). The Deno edge
// function keeps its own copy of these values, since Deno cannot import
// from workspace packages.

export const GZ = {
  INK: '#2a2520',
  PAPER: '#f7f1e3',
  PAPER_WARM: '#ede5d2',
  SOFT: '#3d352c',
  MUTE: '#7a6e58',
  BROWN: '#6b4f3a',
  HAIR: '#b8a98a',
  DEEP: '#1a1611',
  DISPLAY: "'Playfair Display', Georgia, serif",
  BODY: "'Source Serif 4', Georgia, serif",
  META: "'IBM Plex Mono', Courier, monospace",
} as const;
