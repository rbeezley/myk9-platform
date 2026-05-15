// Banner palette + font stacks — single source of truth.
// Used by BannerConfirmationEmail (React Email) and any future Banner email
// templates. The Deno edge function keeps its own copy of these values
// (Deno cannot import from workspace packages), see
// supabase/functions/send-confirmation-email/banner-email.ts.
//
// Visual intent: bright paper, monolithic flag bar, sans-serif throughout,
// zero italics, zero serifs, zero ornament glyphs. The flag color is
// per-club configurable via `shows.brand_color`; the values below are
// fallback defaults used when a club has no brand color set.
//
// Important: the per-club flag color and its deep/bright siblings are
// passed into the template as props, not constants. The constants below
// are only for surrounding chrome (body text, captions, hairlines).

export const BN = {
  PAPER: '#fafaf8',
  PAPER_WARM: '#f0eeea',
  INK: '#111111',
  SOFT: '#2a2a2a',
  MUTE: '#6b6b6b',
  HAIR: '#d8d8d4',
  /** Default flag color — overridden per show via props.brandColor. */
  FLAG_DEFAULT: '#0d4d4f',
  FLAG_DEEP_DEFAULT: '#093234',
  FLAG_BRIGHT_DEFAULT: '#1a7679',
  WARN: '#d97742',
  DISPLAY: "'Inter Tight', Arial, sans-serif",
  BODY: "'Inter', Arial, sans-serif",
} as const;
