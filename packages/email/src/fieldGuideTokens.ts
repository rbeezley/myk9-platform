// Field Guide palette + font stacks — single source of truth for the
// React-Email template. Used by FieldGuideConfirmationEmail and any future
// Field-Guide email surface. The Deno edge function keeps its own copy of
// these values (Deno cannot import from workspace packages); see
// supabase/functions/send-confirmation-email/fieldGuide-email.ts.
//
// Visual intent: parchment background, ink text, indicator-orange accents,
// IBM Plex Sans + Mono throughout, zero italics, zero display serifs.
// Field Guide is fully fixed — no per-club brand color machinery.

export const FG = {
  PAPER: '#f6f1e6',
  PAPER_WARM: '#ebe4cf',
  PAPER_DEEP: '#1f2a24',
  INK: '#1f2a24',
  SOFT: '#3a4339',
  MUTE: '#6b6e5e',
  HAIR: '#c4bba0',
  ORANGE: '#c96442',
  ORANGE_DEEP: '#8a3e21',
  CYAN: '#3a6e72',
  DISPLAY: "'IBM Plex Sans', Arial, sans-serif",
  BODY: "'IBM Plex Sans', Arial, sans-serif",
  MONO: "'IBM Plex Mono', Courier, monospace",
} as const;
