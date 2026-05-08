// Heritage palette + font stacks — single source of truth.
// Used by HeritageConfirmationEmail (React Email) and any future
// Heritage email templates. The Deno edge function keeps its own
// copy of these values (Deno cannot import from workspace packages).

export const HC = {
  INK: '#1a1612',
  PAPER: '#f8f4ea',
  CLARET: '#8a1818',
  GOLD: '#8a6a45',
  QUILL: '#6b4f3a',
  DISPLAY: "'Cormorant Garamond', Georgia, serif",
  BODY: "'EB Garamond', Georgia, serif",
} as const;
