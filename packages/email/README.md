# @myk9/email

Internal, types-only confirmation email data contracts. myK9Show's Heritage and
Magazine prop builders import these interfaces; no React renderer ships here.

Production HTML and palettes are owned by
`supabase/functions/send-confirmation-email/*-email.ts` and its Heritage entry
point. Their existing builder tests and production-content contract assertions
cover the emails that are actually sent. The unused React renderers and token
copies were removed under MYK9-328 rather than adding a second rendering path.

Verify with `pnpm --filter @myk9/email build`, package typecheck, and the
send-confirmation-email suites. There are no runtime package unit tests.
