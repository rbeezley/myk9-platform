// Poster palette + font stacks — single source of truth.
// Used by PosterConfirmationEmail (React Email) and any future Poster email
// templates. The Deno edge function keeps its own copy of these values
// (Deno cannot import from workspace packages), see
// supabase/functions/send-confirmation-email/poster-email.ts.
//
// Visual intent: warm cream paper, ink masthead strip, Archivo Black at
// 56px (with Inter Tight as fallback), red accent on emphasis words and
// armband numbers. The ink-blot and rotating square graphic shapes are
// intentionally OMITTED from the email — `mix-blend-mode` is not
// supported in Outlook, and a flat-color circle behaves badly in Gmail.
// The email becomes typography-only, which is honest about the medium.
//
// Important: Archivo Black is listed first in the DISPLAY stack, with
// Inter Tight as the immediate fallback. Web-mail clients with Google
// Fonts loaded will render Archivo Black; clients that strip the Google
// font link (most desktop clients) will fall back to Inter Tight, which
// is heavy enough at 800/900 to carry the visual register.

export const PO = {
  CREAM: '#f3ede0',
  CREAM_WARM: '#e9dfc8',
  INK: '#1f1d18',
  INK_SOFT: '#3a342a',
  MUTE: '#7a7466',
  HAIR: '#cabe9f',
  RED: '#c83b1a',
  RED_DEEP: '#8a2810',
  OLIVE: '#3d3a2a',
  /** Display stack — Archivo Black with Inter Tight as immediate fallback. */
  DISPLAY: "'Archivo Black','Inter Tight', Arial, sans-serif",
  /** Body display — Inter Tight. */
  DISPLAY_TIGHT: "'Inter Tight', Arial, sans-serif",
  /** Body — Inter. */
  BODY: "'Inter', Arial, sans-serif",
  /** Mono — IBM Plex Mono. */
  MONO: "'IBM Plex Mono', Courier, monospace",
} as const;
