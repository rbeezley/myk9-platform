-- shows.brand_color — per-club accent color hex for the Banner landing style.
--
-- Banner is the first premium style where the primary accent is meant to
-- vary per club (kennel club brand color: navy, forest, oxblood, etc.).
-- Default ships as deep teal — existing rows pick it up automatically so
-- no backfill is needed.
--
-- Other landing styles ignore this column. The hex check constraint rejects
-- malformed input at write time so frontend code can trust the value.

alter table public.shows
  add column brand_color text not null default '#0d4d4f'
  check (brand_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.shows.brand_color is
  'Per-club accent color hex used by the Banner landing-style masthead and
   confirmation email. Other landing styles ignore this value (their tokens
   are fixed). Default is deep teal #0d4d4f; admins set per show on creation
   when Banner style is chosen.';
