# Landing Page Redesign Spec

**Date:** 2026-03-14
**Status:** Approved
**Audit:** [myk9show-premium-ux-audit.md](../../myk9show-premium-ux-audit.md)

---

## Problem

The myK9Show landing page has broken interactions (dead buttons, fake search, false affordances), generic SaaS copy that doesn't speak to dog show people, and a structure that leads with pricing before establishing value. The audit scored it 24/50 against the premium website checklist.

## Goals

1. Fix all broken/misleading interactions (critical bugs)
2. Rewrite copy in dog-show language aligned with INTENT.md
3. Restructure sections to demonstrate value before asking for money
4. Add missing "How It Works" section and expand FAQ

## Non-Goals

- Logo redesign (brand decision, out of scope)
- Social proof section (no real data yet — add when clubs are onboarded)
- Product screenshots (app still in flux)
- Changes to authenticated experience (separate audit)
- Changes to Club Onboarding form (already well-built)

---

## Part 1: Quick Fixes

These are broken interactions that should be fixed immediately regardless of the content redesign.

### 1A. Free Tier "Get Started" Button

**File:** `apps/myk9show/src/components/landing/Pricing.tsx`

**Current:** `handleSubscribe` returns early when `priceId` is null — button does nothing.

**Fix:** When `priceId` is null, navigate to `/sign-up` instead of calling `handleSubscribe`.

```tsx
// In the button onClick:
onClick={() => tier.priceId ? handleSubscribe(tier.priceId) : navigate('/sign-up')}
```

### 1B. Pricing Checkout Error Toast

**File:** `apps/myk9show/src/components/landing/Pricing.tsx`

**Current:** `handleSubscribe` catches errors and only logs them — no user feedback.

**Fix:** Add a toast notification on checkout failure using `toast.error()` from `sonner` (already used in the app — see `main.tsx`).

### 1C. Pricing Card Visual Hierarchy

**File:** `apps/myk9show/src/components/landing/Pricing.tsx`

**Current:** Both cards have identical `border border-primary` styling.

**Fix:**

- Free tier: `border border-border` (muted)
- Premium tier: `border-2 border-primary` + "Most Popular" badge (keep existing label badge, just make the differentiation clearer)

### 1D. Pricing Section Copy

**File:** `apps/myk9show/src/components/landing/Pricing.tsx`

**Current:** "Simple, Transparent Pricing" / "Choose the perfect plan for your dog show management needs" — generic SaaS copy.

**Fix:** Replace with:

- Heading: "Free to start. Premium when you're ready."
- Subtitle: removed (heading is self-explanatory)

### 1E. Feature Card False Affordances

**File:** `apps/myk9show/src/components/landing/FeaturesSection.tsx`

**Current:** Cards have `cursor-pointer`, `hover:-translate-y-2`, `hover:shadow-xl`, scale/rotate icon animations — but aren't clickable.

**Fix:** Remove `cursor-pointer` and simplify hover to a subtle shadow change only: `hover:shadow-md`. Remove icon scale/rotate/pulse-ring animations. Keep the gradient overlay and text color transitions (subtle, not misleading).

---

## Part 2: Hero Rewrite

**File:** `apps/myk9show/src/components/landing/Hero.tsx`

### Remove

- Search box (fake, non-functional)
- "View Premium Pricing Plans" CTA
- Easter egg triple-click confetti (conflicts with INTENT.md "no animations for the sake of animations")

### New Content

**Headline:**

```
Dog shows shouldn't be paperwork.
```

**Subtitle:**

```
Enter shows, track your dogs' careers, and manage events — so you can focus on what matters.
```

**CTA:** Single primary button (solid variant, not outline):

```
Find a Show → /shows
```

### Layout

Keep existing left/right layout: logo on left, content on right (stacked on mobile). Keep FadeIn animations. Keep the logo hover effect (subtle, harmless).

Use `font-display` (Playfair Display) for the headline to leverage the existing font pairing.

### Cleanup

Remove unused imports after rewrite: `Search`, `Heart`, `Dog`, `Trophy`, `Calendar`, `Star`, `Sparkles`, `PartyPopper`, `useState`, `useRef`. Only keep what the simplified Hero still uses (`Button`, `Link`).

---

## Part 3: Section Reorder

**File:** `apps/myk9show/src/pages/Home.tsx`

**Current order:** Hero → Features → Upcoming Shows → Pricing → Club Onboarding → FAQ

**New order:** Hero → Upcoming Shows → How It Works → Features → Pricing → Club Onboarding → FAQ

Move `UpcomingShows` up to position 2 (immediately after hero). Insert new `HowItWorks` component at position 3. Maintain existing `FadeIn` wrappers on all sections.

---

## Part 4: How It Works Section

**New file:** `apps/myk9show/src/components/landing/HowItWorks.tsx`

Four numbered steps in a horizontal grid (stacks to 2x2 on mobile):

| Step | Title   | Description                                                   |
| ---- | ------- | ------------------------------------------------------------- |
| 1    | Browse  | Find shows by date, location, or organization                 |
| 2    | Enter   | Register your dogs in seconds — we remember your info         |
| 3    | Compete | Live scoring, run orders, and results on show day             |
| 4    | Track   | Titles, health records, and career history — all in one place |

**Section heading:** "How It Works"

**Visual treatment:** Numbered circles (`bg-primary/10 text-primary font-bold`) above each step. Uses design tokens for dark mode compatibility. Wrapped in FadeIn.

**Responsive:** 4 columns at `lg`, 2 columns at `sm`/`md`, 1 column below `sm`.

**Accessibility:** Use semantic `<ol>` with list items for screen reader support. Visual numbering is decorative (`aria-hidden`).

---

## Part 5: Feature Cards Rewrite

**Files:**

- `apps/myk9show/src/data/features.tsx` — replace content
- `apps/myk9show/src/components/landing/FeaturesSection.tsx` — simplify hover, add "See all features" link

### New Cards (3 role-addressed)

**Card 1 — For Exhibitors**

- Title: "Enter shows, track titles, manage your dogs"
- Description: "Pre-filled entries, competition history, health records, and title tracking — everything you need before and after show day."
- Icon: `Dog` from lucide-react

**Card 2 — For Secretaries**

- Title: "Set up shows, manage entries, publish results"
- Description: "Smart defaults, class templates, judge assignments. The software handles the logistics so you can handle the show."
- Icon: `Calendar` from lucide-react

**Card 3 — For Clubs**

- Title: "One platform for your entire trial program"
- Description: "Registration, payments, scheduling, and reporting. Get your club running on myK9 in a day — we'll help you set up."
- Icon: `Building2` from lucide-react

### Section Changes

- Section heading: "Built for every role at the show"
- Subtitle: removed (heading is self-explanatory)
- Omit "See all features" link for now — add when a features page exists. (Adding a non-functional link would repeat the false affordance problem we're fixing.)
- Hover: subtle `hover:shadow-md` only — no cursor-pointer, no scale/rotate/translate

### Feature Type Update

Add a `label` field to the `Feature` type for the role prefix:

```typescript
interface Feature {
  icon: React.ReactNode;
  label: string; // e.g. "For Exhibitors"
  title: string; // e.g. "Enter shows, track titles, manage your dogs"
  description: string;
}
```

Update `FeaturesSection.tsx` to render the label as a small teal text above the title.

---

## Part 6: FAQ Expansion

**File:** `apps/myk9show/src/data/faqs.ts`

Replace current 4 generic questions with 6 real ones:

1. **"What does myK9Show cost?"**
   "myK9Show is free for browsing shows, entering events, and viewing results. Premium ($4.99/month) adds title tracking, health records, training journals, and performance stats. No per-dog fees — one subscription covers all your dogs."

2. **"Does it work offline at the show grounds?"**
   "Yes. Our companion app myK9Q is built for show day — it works fully offline with automatic sync when you're back online. Scores, run orders, and check-ins all work without an internet connection."

3. **"Which organizations do you support?"**
   "We currently support AKC, UKC, and ASCA events. More organizations are coming — if yours isn't listed, let us know through the club onboarding form."

4. **"How do I get my club set up?"**
   "Fill out the club onboarding form below and we'll get you running — usually within 24 hours. We'll help migrate your existing data and walk you through setup."

5. **"Is my data safe?"**
   "Your data is stored securely on Supabase (built on AWS) with encryption at rest and in transit. We never share your personal information. You can export your data anytime."

6. **"Can I use it on my phone or tablet?"**
   "Absolutely. myK9Show works in any modern browser on phone, tablet, or desktop. For show day, our companion app myK9Q is optimized for tablets at ringside."

---

## Testing

- Verify Free tier button navigates to `/sign-up`
- Verify Premium tier button still creates checkout session (authenticated) or redirects to sign-in (unauthenticated)
- Verify checkout error shows toast/alert
- Verify feature cards are not clickable (no cursor-pointer, no hover lift)
- Verify "Find a Show" CTA navigates to `/shows`
- Verify section order: Hero → Shows → How It Works → Features → Pricing → Onboarding → FAQ
- Verify How It Works renders 4 steps, responsive on mobile (2x2)
- Verify FAQ accordion expands/collapses for all 6 questions
- Visual review in light and dark mode
- Mobile responsive check (hero stacking, feature cards stacking, How It Works 2x2)
- Run `pnpm typecheck` and `pnpm lint`
