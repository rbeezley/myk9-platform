# Plan — Banner Style (next session)

Banner is the second premium-style implementation after Monogram (PR #182,
merged 2026-05-15). This plan is intentionally written to be **read cold**
by a new conversation — it assumes no memory of how Monogram landed.

## Context: where the codebase is right now

- **Monogram email pipeline is live** in production-staging (edge function
  v6 deployed 2026-05-15 02:27 UTC). Trials with `style='monogram'` or
  `style='banner'` send Monogram-styled emails. Banner is **currently
  piggybacking on the Monogram email builder** — this plan replaces that
  with a Banner-specific builder.
- **Monogram landing page / wizard / entry-blank PDF are deferred** to a
  separate PR. See [`docs/plan-monogram-landing.md`](./plan-monogram-landing.md)
  (untracked in worktree, will need a commit decision when picked up).
- **Cross-cutting infra exists**: `apps/myk9show/src/features/_shared/hooks/`
  has `useCountdown`, `useReducedMotion`, `useRevealOnScroll` — reuse,
  don't copy.
- **Edge function dispatch lives in**
  `supabase/functions/send-confirmation-email/index.ts` (lines ~520–540).
  It's a 3-way `if/else` on `emailBuilder` returned from
  `selectEmailBuilderKey(style)`. Banner work flips `EmailBuilderKey` from
  3 values to 4, updates the mapping, adds the 4th branch.

## What "ship Banner" means in one paragraph

Add a fourth dedicated email builder (parallel to Heritage / Headline /
Monogram), add a per-club brand-color column (`shows.brand_color`), add a
React Email template that reads the brand color from props, and stand up
the app-side Banner feature folder with the signature primitive
(`BannerFlagBar`) plus tokens, fonts, scoped CSS, and the `buildMonogram`
equivalent for Banner (which is just the brand color hook). The full
landing page / wizard / entry-blank PDF for Banner should follow the same
"defer to second PR" pattern Monogram established.

## Source of truth (read before coding)

| File                                                                                                | Why                                                                                                         |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `docs/design/claude_code_handoff/design_handoff_banner/Banner Reconciliation Notes.md`              | The implementation contract — file paths, tokens, migrations, open questions. **Read this first, in full.** |
| `docs/design/claude_code_handoff/design_handoff_banner/README.md`                                   | Visual system, color tokens, motion vocabulary, layout rules                                                |
| `docs/design/claude_code_handoff/design_handoff_banner/Banner Confirmation Email.html`              | The email mock — clone its visual structure into the React Email template                                   |
| `docs/design/claude_code_handoff/design_handoff_banner/Banner Landing Page.html`                    | Landing mock — visual reference (full landing implementation is a follow-up PR)                             |
| **PR #182 as the working template**: GitHub commit `e2858b36` shows the exact file shape to mirror. |

## Schema change required (gating)

Banner is the **first style that needs a migration.** Two changes:

```sql
-- supabase/migrations/<NEXT_TIMESTAMP>_add_shows_brand_color.sql

alter table public.shows
  add column brand_color text default '#0d4d4f' not null
  check (brand_color ~ '^#[0-9a-fA-F]{6}$');

comment on column public.shows.brand_color is
  'Per-club accent color hex. Used by Banner landing-style masthead and
   email. Other landing styles ignore this value (their tokens are fixed).
   Default is deep teal #0d4d4f; admins set per show under Banner style.';
```

**Run via the `/db-push` skill** — the file naming convention is now
`YYYYMMDDHHMMSS_description.sql` (timestamp prefix, not 3-digit number;
the skill docs are stale on this and may need a separate fix).

Confirm migration is applied to staging before running the edge function
deploy — the edge function reads `show.brand_color` and crashes if the
column doesn't exist.

## File tree to add (PR scope-1: email + primitive)

Mirror PR #182's tightened scope — ship the email pipeline + primitive
component, defer landing/wizard/entry-blank to follow-up PRs:

```
packages/email/src/
├── bannerTokens.ts                                 NEW
├── templates/
│   └── BannerConfirmationEmail.tsx                 NEW
└── __tests__/
    └── BannerConfirmationEmail.test.ts             NEW
└── index.ts                                        MODIFY: export Banner

packages/email/src/types.ts                         MODIFY: add BannerConfirmationProps

supabase/functions/send-confirmation-email/
├── banner-email.ts                                 NEW (Deno builder)
├── banner-email.test.ts                            NEW
├── email-style-registry.ts                         MODIFY: 'banner' → 'banner'
├── email-style-registry.test.ts                    MODIFY: 4-way dispatch
└── index.ts                                        MODIFY: 4-way switch +
                                                    pass brand_color through

apps/myk9show/src/features/banner/
├── tokens.ts                                       NEW
├── fonts.ts                                        NEW (Inter + Inter Tight)
├── banner.css                                      NEW (scoped under [data-banner])
├── index.ts                                        NEW (public barrel)
├── components/
│   └── BannerFlagBar.tsx                           NEW (signature primitive)
├── hooks/
│   └── useBannerBrandColor.ts                      NEW (per-club color + contrast)
└── __tests__/
    ├── BannerFlagBar.test.tsx                      NEW
    └── useBannerBrandColor.test.ts                 NEW
```

**Approximate scope: ~15–18 files, ~1500–2000 line diff.** Same shape as
PR #182.

## Per-file implementation notes

### Migration: `shows.brand_color`

- Default `'#0d4d4f'` (deep teal) means existing rows pick up the demo
  color automatically — no backfill needed.
- The `CHECK` constraint regex `^#[0-9a-fA-F]{6}$` rejects malformed hex
  at write time. **Test this**: insert `'red'` and expect failure.
- Comment on the column documents the per-club semantics so future
  engineers don't generalize it to other styles.

### `useBannerBrandColor(show)` hook

Returns `{ flag, flagDeep, flagBright, textOnFlag }`:

```ts
export function useBannerBrandColor(show: { brand_color?: string | null }) {
  const flag = show.brand_color ?? '#0d4d4f';
  // Derive deep/bright via OKLCH math OR hardcoded 70%/130% lightness shifts.
  // Recommendation: use CSS color-mix() at consumption sites for the web
  // (browsers support it well in 2026), do it in JS only for the email
  // builder.
  const flagDeep = darken(flag, 0.4);
  const flagBright = lighten(flag, 0.2);
  // OKLCH luminance: if flag is too light, white text becomes unreadable.
  // Returns 'white' or '#111' depending on flag's relative luminance.
  const textOnFlag = relativeLuminance(flag) > 0.5 ? '#111' : '#ffffff';
  return { flag, flagDeep, flagBright, textOnFlag };
}
```

Use a small WCAG-style relative-luminance helper. Tests should cover:

- Default teal returns white text
- A near-white brand color returns ink text
- A near-black brand color returns white text
- Malformed input falls back to teal (defensive — even though DB constraint enforces hex, frontend may receive nulls)

### `BannerFlagBar` primitive

- Two variants: `'masthead'` (top, large) and `'final'` (bottom CTA band, dark).
- Accepts `color` prop (the brand `flag`) and `textColor` prop (from `textOnFlag`).
- No animation by itself — animation hooked at the section level via `useRevealOnScroll`.

### `bannerTokens.ts` (email-package side)

```ts
export const BN = {
  PAPER: '#fafaf8',
  PAPER_WARM: '#f0eeea',
  INK: '#111111',
  SOFT: '#2a2a2a',
  MUTE: '#6b6b6b',
  HAIR: '#d8d8d4',
  // Default flag — overridden per-show via props
  FLAG_DEFAULT: '#0d4d4f',
  FLAG_DEEP_DEFAULT: '#093234',
  FLAG_BRIGHT_DEFAULT: '#1a7679',
  WARN: '#d97742',
  DISPLAY: "'Inter Tight', Arial, sans-serif",
  BODY: "'Inter', Arial, sans-serif",
} as const;
```

### `BannerConfirmationEmail.tsx`

- Reads `brandColor`, `brandColorDeep`, `brandColorBright`, `textOnFlag`
  from props — **never** hardcodes flag values.
- The Deno function precomputes these and passes them in (Outlook doesn't
  support `color-mix()` or OKLCH).
- Masthead is a full-width `<table>` row with `bgColor` set to the brand
  flag and text color set from `textOnFlag`.
- **Same critical assertion as Monogram**: test that the rendered HTML
  contains no `background-clip: text`. Banner's design has no embossed
  letters but a regression copy-paste from Monogram is still possible.

### `banner-email.ts` (Deno builder)

- Duplicates the BN palette constants locally (same pattern as
  `headline-email.ts` and `monogram-email.ts`).
- Accepts a `brandColor: string` field on the data interface.
- Computes `brandColorDeep`, `brandColorBright`, `textOnFlag` inline (Deno
  can't import a workspace package).
- Renders the masthead bar with the brand color as background and the
  computed text color.
- HTML escapes all user-controlled fields (use `esc()` helper, same as
  the other builders).

### Registry update

`EmailBuilderKey` becomes `'heritage' | 'headline' | 'monogram' | 'banner'`.
The map flips:

```ts
const STYLE_TO_EMAIL_BUILDER: Record<EmailStyle, EmailBuilderKey> = {
  monogram: 'monogram',
  banner: 'banner', // was 'monogram'
  headline: 'headline',
  magazine: 'heritage',
  poster: 'heritage',
  gazette: 'heritage',
  fieldGuide: 'heritage',
  heritage: 'heritage',
};
```

Update `email-style-registry.test.ts` to assert the new mapping.

### Edge function `index.ts` switch

Add the 4th branch and pass `brand_color` through:

```ts
let html: string;
if (emailBuilder === 'headline') {
  html = buildHeadlineHtml(emailData);
} else if (emailBuilder === 'monogram') {
  html = buildMonogramHtml({ ...emailData, monogramLetters });
} else if (emailBuilder === 'banner') {
  html = buildBannerHtml({
    ...emailData,
    brandColor: show.brand_color ?? '#0d4d4f',
  });
} else {
  html = buildHtml(emailData);
}
```

Note: the Supabase query at line ~310 already selects `show.style` and
similar columns — extend it to include `brand_color`.

## Tests to ship in this PR

| File                                    | Coverage                                                                                                          | ~Lines |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| `useBannerBrandColor.test.ts`           | Default / per-club / contrast fallback / malformed input                                                          | 80     |
| `BannerFlagBar.test.tsx`                | Masthead + final variants, color prop, text color prop                                                            | 60     |
| `banner-email.test.ts`                  | Output shape, brand color in masthead, XSS escaping, no background-clip, custom-color override, contrast fallback | 240    |
| `BannerConfirmationEmail.test.ts`       | React Email snapshot + brand-color prop override + 600px table layout + no display:flex/grid                      | 150    |
| `email-style-registry.test.ts` (modify) | 4-way dispatch assertion                                                                                          | +12    |

## Cross-cutting risk: existing trials with `style='banner'`

Per PR #182's registry change, any show currently set to `style='banner'`
is sending **Monogram-styled emails today.** When this PR deploys, those
same trials will switch to **Banner-styled emails.** That's a visible
change for any real-world Banner-style show.

Before the deploy step:

1. Run `SELECT count(*) FROM shows WHERE style = 'banner';` to know the
   blast radius.
2. Optionally do a curl-invoke against a test trial with `style='banner'`
   and visually verify the email render before letting the cron fire.

## Open questions to resolve BEFORE writing code

The reconciliation notes flag five. Answer first:

1. **One column or three for brand color?** Recommend one column +
   runtime derivation via `color-mix()` for the web and JS for the email.
2. **Default flag color?** Recommend `#0d4d4f` (teal) — admin sets per
   show during creation.
3. **Email contrast handling?** Deno function precomputes
   `textOnFlag`; never use CSS in the email template (Outlook has no
   OKLCH support).
4. **Sub-bar status dot color** — per-club or always `--bn-warn`?
   Recommend universal (it signals "live", not brand).
5. **PDF cover alignment** — Banner's existing PDF cover uses black; align
   to brand color in this PR or defer? Recommend defer; PDF cover work
   can ship in the same follow-up PR as Banner landing page.

## Effort estimate

- Migration + db-push: 0.5 hour
- `useBannerBrandColor` hook + tests: 1 hour
- `BannerFlagBar` primitive + tests: 1 hour
- Email tokens + types + React template + tests: 2.5 hours
- Deno builder + tests: 2 hours
- Registry update + dispatch wiring: 0.5 hour
- App-side tokens / fonts / css / barrel: 1 hour
- Verification (typecheck + 100+ tests) + commit/PR/review fixes: 1 hour

**Total: ~9 hours, one focused session.** Same shape as PR #182 but with
the schema change adding modest overhead.

## Workflow (mirrors PR #182)

1. Read this doc + the Banner Reconciliation Notes + the Banner email mock HTML
2. Answer the 5 open questions above (write decisions into the PR description)
3. Write migration → run `/db-push` → verify column exists on staging
4. Write app-side scaffolding (tokens, fonts, css, hook, primitive)
5. Write email package (tokens, types, template, test)
6. Write Deno builder + test
7. Wire registry + edge function dispatch + update registry test
8. Run `pnpm typecheck` + all tests → fix any failures
9. Commit (single squash-mergeable commit, or 2 commits: "migration" + "feat")
10. Push, open PR, address review fixes per `/review` output
11. `gh pr merge <N> --squash --admin` from main repo dir (GHA billing
    still blocked until 2026-06-01; ignore the failed Quality Checks)
12. Deploy edge function: `supabase functions deploy send-confirmation-email --no-verify-jwt`
13. Spot-check a Banner trial's email render before the next cron fires

## Known gotchas from PR #182 (apply lessons)

1. **Worktree path discipline** — write every file under
   `.claude/worktrees/<branch>/...`, not the main-repo absolute path. If
   the harness's CLAUDE.md says you're in a worktree, double-check `pwd`
   before the first Write.
2. **The PostToolUse typecheck hook** is currently disabled via
   `.claude/settings.local.json` (`disableAllHooks: true`). If you want
   it back, remove that line; otherwise it stays off (won't cause
   failures, just won't catch type errors per-file).
3. **`pnpm typecheck` hook timeout is 120s** but cold runs can exceed that.
   Bulk-write sessions need the hook disabled — keep `disableAllHooks` on
   for the implementation phase, run typecheck manually at phase
   boundaries.
4. **The `monogram-email.ts` deploy hiccup** — when fast-forwarding a
   `git pull` after a merge, untracked files in conflict paths block the
   pull. Run `git status` after every merge; if untracked files exist
   under paths the merge introduces, `mv` them aside first.
5. **CI is billing-blocked** until 2026-06-01. Sub-10s GHA failures are
   not code regressions; merge with `--admin` based on local typecheck +
   tests passing. Vercel previews are the meaningful "build still works"
   signal.

## Definition of done

- [ ] Migration applied to staging — `shows.brand_color` exists, defaults to teal
- [ ] `pnpm typecheck` clean (21/21 packages)
- [ ] All new tests pass + existing test suites unaffected
- [ ] PR opened, reviewed (`/review <N>`), fixes addressed
- [ ] PR merged to `main` via `--admin` (billing override)
- [ ] Edge function deployed via `supabase functions deploy ...`
- [ ] Manual curl invoke of a test Banner trial renders the email with the brand color in the masthead
- [ ] Banner blast-radius query run, results noted in PR description

---

## Starter prompt to paste into the new conversation

```
Read docs/plan-banner-style.md in this repo — it's the implementation
contract for the Banner premium style, written cold for this session. It
references PR #182 (Monogram, merged 2026-05-15) as the working template.

Start by:
1. Confirming the current branch (should be claude/<your-new-name>, off main)
2. Reading the plan doc end-to-end
3. Reading docs/design/claude_code_handoff/design_handoff_banner/Banner
   Reconciliation Notes.md
4. Answering the 5 open questions at the bottom of that file

Then propose a tighter scope (email pipeline + primitive only, OR include
the full landing page) and confirm with me before writing code. Heuristic:
if you can ship < 20 files with clean tests in one session, include
landing; otherwise email-only is fine.

CI is billing-blocked until 2026-06-01 — local typecheck + tests are the
source of truth.
```

---

**Status:** plan doc is untracked in the worktree. Either commit it
standalone before starting Banner, or fold into the first scaffolding
commit. Choice is the next session's.
