# ADR-002: Base UI (via shadcn/ui) over Radix Primitives

## Status
Accepted

## Date
2026-01-02

## Context

myK9Show originally used Radix UI primitives for accessible, unstyled components (Dialog, Select, Tabs, etc.). Radix was the standard choice for headless React UI libraries and provided solid accessibility foundations.

However, after WorkOS acquired Radix in 2023, development stagnated. Issues and pull requests went unaddressed, releases slowed, and the community expressed concern about the project's long-term viability. For a production platform that depends on actively maintained accessibility primitives, this was a risk.

Alternatives evaluated:
- **Continue with Radix** -- Risky given uncertain maintenance trajectory
- **Headless UI (Tailwind Labs)** -- Smaller component set, tightly coupled to Tailwind
- **Ark UI** -- Promising but less mature ecosystem
- **Base UI (@base-ui/react)** -- MUI's headless primitive layer; actively maintained, backed by MUI's commercial model, accessible by default

shadcn/ui provides a component distribution model (copy-paste, not dependency) built on top of Base UI primitives, giving us styled starting points we can customize.

## Decision

We replaced Radix UI primitives with **Base UI (`@base-ui/react`)**, using **shadcn/ui** as the component distribution layer in the shared `@myk9/ui` package.

Key factors:
- **Active maintenance** -- Base UI is backed by MUI's team and commercial incentive, unlike Radix's uncertain future post-WorkOS acquisition
- **Accessibility built-in** -- Base UI components follow WAI-ARIA patterns out of the box
- **shadcn/ui model** -- Components are copied into our codebase (in `@myk9/ui`), not imported as opaque dependencies, giving full control over styling and behavior
- **Tailwind CSS integration** -- shadcn/ui components use Tailwind classes and `class-variance-authority` for variants, aligning with our CSS strategy for myK9Show

The migration was completed in Phase 2.3 of the monorepo migration (`feat(ui): Complete Phase 2.3 - Migrate from Radix UI to Base UI`).

## Consequences

### Positive
- No longer dependent on Radix's uncertain release cadence
- Full ownership of component code in `@myk9/ui` -- we can patch, extend, or restyle without waiting for upstream
- Base UI's headless approach gives clean separation between behavior and presentation
- shadcn/ui provides well-tested starting points that accelerate component development
- `class-variance-authority` + `tailwind-merge` + `clsx` give a clean variant/styling API

### Negative
- One-time migration cost to replace all Radix imports across myK9Show
- Copied components must be maintained in-repo -- upstream shadcn/ui updates require manual merging
- Base UI has a smaller ecosystem and fewer community examples compared to Radix at its peak

### Neutral
- The `@myk9/ui` package exports a tailwind preset alongside components, allowing consuming apps to share design tokens
- myK9Q does not use `@myk9/ui` components directly -- it retains its semantic CSS approach (see ADR-005)
