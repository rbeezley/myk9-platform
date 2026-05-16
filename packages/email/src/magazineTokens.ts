// Magazine palette + font stacks — single source of truth.
// Used by MagazineConfirmationEmail (React Email) and any future Magazine
// email templates. The Deno edge function keeps its own copy of these
// values because Deno cannot import from workspace packages —
// supabase/functions/send-confirmation-email/magazine-email.ts mirrors
// every constant here; keep them in sync.

export const MZ = {
  INK: '#1a1a1a',
  SOFT: '#2e2820',
  PAPER: '#f6f1e8',
  PAPER_DEEP: '#ece4d3',
  MUTE: '#7a6e58',
  QUILL: '#5c4f3a',
  GOLD1: '#c9a87c',
  GOLD2: '#a8814f',
  GOLD3: '#4a3826',
  /** Page-background tone outside the 600px email body. */
  PAGE: '#dad2bd',
  DISPLAY: "'Cormorant Garamond', Georgia, serif",
  BODY: "'Source Serif 4', Georgia, serif",
  META: "'Inter Tight', Arial, sans-serif",
} as const;
