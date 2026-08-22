/**
 * Status-chip classes for surfaces that carry NEUTRAL states.
 *
 * `<Badge variant="secondary">` is unusable on a Card in dark mode. The tokens
 * `--card`, `--muted`, `--secondary`, `--background-alt`, `--input` and
 * `--popover` are ALL `#1e1c19` there, and `--secondary-foreground` is the same
 * value as `--card-foreground`, so the chip measures 1.00:1 against the card it
 * sits on and its text is the same colour as the prose around it. `badgeVariants`
 * also sets `border-transparent`, so nothing rescues the shape. The chip stops
 * reading as a chip and becomes a run of body text. Light mode is only slightly
 * better at 1.25:1.
 *
 * The `--chip-*` pairs are the fix: stone measures 9.66:1 text-on-chip in dark
 * and 9.92:1 in light, versus the 1.00:1 collapse.
 *
 * ON THE BORDER. These carry `border-border` rather than the `border-transparent`
 * used elsewhere, which gives an actual edge (1.21:1 dark, 1.36:1 light). No
 * token in the system reaches WCAG 1.4.11's 3:1 for a component boundary -- the
 * best `--chip-*` background separation is 1.23:1 -- and that is deliberate here
 * rather than an oversight: 1.4.11 governs visual information REQUIRED to
 * identify a component or its state, and on these chips the state is the text,
 * at 9.66:1. The rounded rectangle is decoration. Making chip boundaries clear
 * 3:1 app-wide is a design-system decision with its own token, not something to
 * settle inside one page's fixes.
 *
 * The explicit `hover:` is load-bearing: tailwind-merge does NOT drop
 * `hover:bg-secondary/80` from the Badge variant just because `className`
 * overrides the base background, so without it the chip flashes back to the
 * collapsed colour on hover.
 */

/** Neutral, informational state. No action implied. */
export const NEUTRAL_STATUS_CHIP =
  'border-border bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)] hover:bg-[color:var(--chip-stone-bg)]';

/**
 * A state that is waiting on the treasurer to do something, but is not a
 * failure. Amber is the best-separated chip against the dark card (1.23:1) and
 * reads as "attend to this" without the alarm of `destructive`.
 */
export const WAITING_STATUS_CHIP =
  'border-border bg-[color:var(--chip-amber-bg)] text-[color:var(--chip-amber-fg)] hover:bg-[color:var(--chip-amber-bg)]';
