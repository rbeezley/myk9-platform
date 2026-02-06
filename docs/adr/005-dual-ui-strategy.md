# ADR-005: Dual UI Strategy -- Tailwind/shadcn for myK9Show, Semantic CSS for myK9Q

## Status
Accepted

## Date
2026-01-02

## Context

The two apps in the platform have fundamentally different histories and constraints:

**myK9Show** was migrated into the monorepo from a separate project and was being actively rebuilt. Its UI was already using Radix primitives (later migrated to Base UI) and Tailwind CSS. It had no production users depending on pixel-perfect consistency, so styling changes were low-risk.

**myK9Q** is a production scoring application actively used by judges at dog shows. It has a mature, carefully tuned UI built with semantic CSS: custom design tokens (`design-tokens.css`), purpose-built stylesheets for touch optimization (`touch-targets.css`, `touch-feedback.css`, `one-handed-mode.css`), mobile-specific layouts (`mobile-optimizations.css`, `viewport.css`), accessibility features (`high-contrast.css`, `reduce-motion.css`), and an Apple-inspired design system (`apple-design-system.css`). This CSS represents significant UX investment -- over 20 stylesheet files covering everything from page transitions to container queries.

Rewriting myK9Q's styles to Tailwind would:
- Risk visual regressions for active production users
- Invalidate months of touch/mobile optimization work
- Provide no functional benefit (the app already looks and works well)
- Be a massive effort with negative ROI

## Decision

We adopted a **dual UI strategy**:

1. **myK9Show** uses **Tailwind CSS + shadcn/ui components** from `@myk9/ui`
   - Utility-first CSS with a shared tailwind preset for design consistency
   - Base UI primitives for accessible interactive components
   - `class-variance-authority` for component variants

2. **myK9Q** retains its **semantic CSS** unchanged
   - Custom design tokens and CSS custom properties
   - Purpose-built stylesheets for the mobile-first, touch-optimized scoring experience
   - Theming via separate CSS files (green, orange, purple themes)
   - No Tailwind dependency

The shared `@myk9/ui` package is consumed by myK9Show. myK9Q uses `@myk9/scoring-ui` for shared scoring hooks (logic, not styles) and handles its own presentation layer.

## Consequences

### Positive
- Zero risk of visual regression in the production scoring app
- myK9Q's carefully optimized touch/mobile styles are preserved intact
- myK9Show benefits from Tailwind's rapid prototyping and consistent utility classes
- Each app uses the styling approach that fits its maturity and constraints
- Shared logic (scoring, replication) is decoupled from shared styles

### Negative
- Two different styling paradigms in one monorepo increases cognitive load for developers working across both apps
- Shared visual components (if ever needed by both apps) would require dual implementations or a framework-agnostic approach
- No single design system governs both apps -- visual consistency relies on manual coordination

### Neutral
- myK9Q has a `tailwind-utilities.css` file, suggesting a possible incremental Tailwind adoption path in the future if desired
- The `@myk9/scoring-ui` package bridges the gap by sharing behavioral hooks (stopwatch, entry list filters, drag-and-drop) without imposing a styling framework
