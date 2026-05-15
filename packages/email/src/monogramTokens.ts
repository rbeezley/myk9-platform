// Monogram palette + font stacks — single source of truth.
// Used by MonogramConfirmationEmail (React Email) and any future Monogram
// email templates. The Deno edge function keeps its own copy of these values
// (Deno cannot import from workspace packages), see
// supabase/functions/send-confirmation-email/monogram-email.ts.
//
// Visual intent: ivory paper, ink monogram, bronze accent.
// Mirrors the design tokens in apps/myk9show/src/features/monogram/tokens.ts.
//
// Important: the embossed-monogram effect (background-clip:text + text-shadow
// gradient) is **web-only**. Outlook strips background-clip, so in the email
// template the monogram is rendered as solid ink color. See
// templates/MonogramConfirmationEmail.tsx for usage.

export const MG = {
  INK: '#1c1815',
  PAPER: '#f3eee4',
  PAPER_DEEP: '#ece5d4',
  BRONZE: '#8a6938',
  QUILL: '#5a4f3e',
  MUTE: '#7a6f5e',
  MONOGRAM: "'Italiana', 'Bodoni Moda', serif",
  DISPLAY: "'Bodoni Moda', Georgia, serif",
  BODY: "'Crimson Pro', Georgia, serif",
} as const;
