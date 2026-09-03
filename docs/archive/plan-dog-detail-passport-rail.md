# Dog detail page — passport rail layout

> **Status:** Complete (merged #1974, 2026-09-02)

Design: [Dog Detail Page canvas](https://claude.ai/code/artifact/d0bfd714-9f26-40c0-8c75-756858c1cbc8) (direction C, chosen 2026-09-02).

## Goal

Replace the dog detail page's hero card + three-panel layout with a fixed **identity rail** (photo, name, badges, key facts, registry table, owner, actions) beside a full-width content column that keeps the existing Overview / Career / Records hierarchy. The rail reuses the registry-card language shipped for `/dogs` and the My Shows dog strip (`DogRegistryTable`, branch `claude/dog-cards-redesign-233f01`, merged into this branch).

## Phases

1. **Rail.** `DogDetailsMain/DogIdentityRail.tsx` composes what `HeroProfileCard`, `sidebar/AboutCard`, `sidebar/OwnerContactCard` and `sidebar/RegistrationsCard` rendered. Those four components are deleted. Status/sex badges come from one shared `dogStatusBadges.ts` so the card and the rail cannot drift.
2. **Overview.** Title progress moves from the sidebar into Overview as its first section (`TitleProgressSection.tsx`, premium-only — the sidebar INTENT comment carries over). `sidebar/TitleProgressCard` is deleted.
3. **Layout.** `DogDetailsMain/index.tsx` stops using `RecordPageLayout` and lays out `rail | main` directly: stacked below `lg`, rail `320px` at `lg+`. Secretary keeps its narrow surface (Registrations + vaccinations, no tabs) with the owner framed as Primary contact and Verify for entry as the primary action.
4. **Testing.** `AboutCard.test.tsx` migrates to `DogIdentityRail.test.tsx` (measurement + age rules); `ownerResolution.test.tsx` asserts the rail carries the owner and precedes the tabs; `TitleProgressSection.test.tsx` pins premium gating. Run the dog suites shuffled 6×, `pnpm typecheck`, `pnpm lint`, `pnpm qa:code-quality-ratchet`.
