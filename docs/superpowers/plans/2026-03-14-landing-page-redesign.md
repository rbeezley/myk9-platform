# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix broken interactions and rewrite the myK9Show landing page with dog-show language, better structure, and a new "How It Works" section.

**Architecture:** Edit existing landing components in-place. One new component (HowItWorks). Update Feature type, feature data, FAQ data. Reorder sections in Home.tsx. No new dependencies.

**Tech Stack:** React, TypeScript, Tailwind CSS, Lucide icons, sonner (toasts), react-router-dom

**Spec:** `docs/superpowers/specs/2026-03-14-landing-page-redesign.md`

---

## File Map

| File                                                       | Action                 | Responsibility                                                  |
| ---------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| `apps/myk9show/src/types/index.ts`                         | Modify (lines 223-227) | Add `label` field to `Feature` type                             |
| `apps/myk9show/src/components/landing/Pricing.tsx`         | Modify                 | Fix dead button, add error toast, visual hierarchy, copy        |
| `apps/myk9show/src/components/landing/FeaturesSection.tsx` | Modify                 | Simplify hover, render label field                              |
| `apps/myk9show/src/components/landing/Hero.tsx`            | Rewrite                | Problem-first copy, "Find a Show" CTA, remove search/easter egg |
| `apps/myk9show/src/components/landing/HowItWorks.tsx`      | Create                 | 4-step "How It Works" section                                   |
| `apps/myk9show/src/data/features.tsx`                      | Rewrite                | 3 role-addressed feature cards                                  |
| `apps/myk9show/src/data/faqs.ts`                           | Rewrite                | 6 real FAQ entries                                              |
| `apps/myk9show/src/pages/Home.tsx`                         | Modify                 | Reorder sections, add HowItWorks import                         |
| `apps/myk9show/src/components/landing/FAQSection.tsx`      | Modify                 | Update copy (heading, subtitle, footer)                         |

---

## Chunk 1: Quick Fixes (Pricing + Feature Cards)

### Task 1: Fix Pricing Component

**Files:**

- Modify: `apps/myk9show/src/components/landing/Pricing.tsx`

- [ ] **Step 1: Fix Free tier button — navigate to /sign-up**

In `Pricing.tsx`, change the button `onClick` to handle null `priceId`:

```tsx
<button
  onClick={() => tier.priceId ? handleSubscribe(tier.priceId) : navigate('/sign-up')}
  className={...}
>
```

- [ ] **Step 2: Add error toast on checkout failure**

Add `import { toast } from 'sonner';` at the top of the file.

In the `handleSubscribe` catch block, add a toast:

```tsx
} catch (error) {
  toast.error('Something went wrong. Please try again.');
  logger.error('Failed to create checkout session:', 'landing', {}, error as Error);
}
```

- [ ] **Step 3: Differentiate pricing card borders**

Replace the card container className. Currently both cards use:

```tsx
className = 'relative bg-card rounded-2xl shadow-lg border border-primary';
```

Change to conditional styling:

```tsx
className={`relative bg-card rounded-2xl shadow-lg ${
  tier.popular
    ? 'border-2 border-primary'
    : 'border border-border'
}`}
```

- [ ] **Step 4: Update pricing section copy**

Replace the heading and subtitle in the section header:

Old:

```tsx
<h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
  Simple, Transparent Pricing
</h2>
<p className="text-xl text-muted-foreground">
  Choose the perfect plan for your dog show management needs
</p>
```

New:

```tsx
<h2 className="text-3xl md:text-4xl font-bold text-foreground">
  Free to start. Premium when you're ready.
</h2>
```

Remove the `<p>` subtitle entirely. Remove `mb-4` from h2 since there's no subtitle below it. Keep the `mb-16` on the parent `div`.

- [ ] **Step 5: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/landing/Pricing.tsx
git commit -m "fix: pricing quick fixes — dead button, error toast, visual hierarchy, copy"
```

---

### Task 2: Fix Feature Card False Affordances

**Files:**

- Modify: `apps/myk9show/src/components/landing/FeaturesSection.tsx`

- [ ] **Step 1: Simplify feature card hover styles**

In `FeaturesSection.tsx`, replace the card `className` (line 20):

Old: `"group relative overflow-hidden bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 shadow-sm backdrop-blur-xl transition-all duration-500 hover:shadow-xl hover:-translate-y-2 cursor-pointer"`

New: `"relative bg-gradient-to-br from-card to-card/80 border border-border rounded-2xl p-8 shadow-sm backdrop-blur-xl transition-shadow duration-300 hover:shadow-md"`

Changes: removed `group`, `cursor-pointer`, `overflow-hidden`, `hover:-translate-y-2`, `hover:shadow-xl`. Simplified transition. (`group` no longer needed since we're removing all group-hover effects.)

- [ ] **Step 2: Remove hover overlay div**

Remove the gradient overlay div (lines 23-24) entirely:

```tsx
<div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
```

This is dead code now that group-hover effects are removed.

- [ ] **Step 3: Simplify icon — remove wrapper div, pulse ring, and animations**

Replace the entire icon block (the `<div className="relative">` wrapper, icon container, pulse ring, and animated icon):

Old (lines 26-34):

```tsx
<div className="relative">
  <div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 relative overflow-hidden">
    {/* Subtle pulse ring effect */}
    <div className="absolute inset-0 rounded-2xl bg-primary/20 scale-0 group-hover:scale-150 opacity-0 group-hover:opacity-100 transition-all duration-700" />
    <div className="text-primary relative z-10 group-hover:scale-110 transition-transform duration-300">
      {feature.icon}
    </div>
  </div>
</div>
```

New:

```tsx
<div className="w-16 h-16 bg-gradient-to-br from-primary/20 to-primary/10 rounded-2xl flex items-center justify-center mb-6">
  <div className="text-primary">{feature.icon}</div>
</div>
```

Removes: wrapper `<div className="relative">`, pulse ring div, icon scale/rotate animations, shadow hover.

- [ ] **Step 4: Simplify title hover animation**

Replace the title element:

Old:

```tsx
<h3 className="text-xl font-semibold mb-3 text-card-foreground group-hover:text-primary transition-colors duration-300 relative">
  {feature.title}
  {/* Subtle underline animation */}
  <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:w-full group-hover:opacity-100 transition-all duration-500" />
</h3>
```

New:

```tsx
<h3 className="text-xl font-semibold mb-3 text-card-foreground">{feature.title}</h3>
```

- [ ] **Step 4: Simplify description hover**

Replace:

```tsx
<p className="text-muted-foreground relative group-hover:text-card-foreground/80 transition-colors duration-300">
```

With:

```tsx
<p className="text-muted-foreground">
```

- [ ] **Step 5: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/landing/FeaturesSection.tsx
git commit -m "fix: remove false affordances from feature cards"
```

---

## Chunk 2: Hero Rewrite

### Task 3: Rewrite Hero Component

**Files:**

- Rewrite: `apps/myk9show/src/components/landing/Hero.tsx`

- [ ] **Step 1: Rewrite Hero.tsx**

Replace the entire file content with:

```tsx
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const dogShowImageWebP = '/logo.webp';
const dogShowImagePNG = '/logo.png';

export default function Hero() {
  return (
    <section className="pt-24 pb-20 md:pt-32 md:pb-28 bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-8">
          {/* Logo - left side */}
          <div className="lg:w-1/2 flex justify-center items-center">
            <div className="h-[350px] flex items-center justify-center">
              <div className="transform transition-all duration-500 hover:scale-105">
                <picture>
                  <source srcSet={dogShowImageWebP} type="image/webp" />
                  <img
                    src={dogShowImagePNG}
                    alt="myK9Show logo"
                    className="w-auto h-auto max-h-full max-w-[300px] object-contain"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    width="300"
                    height="300"
                  />
                </picture>
              </div>
            </div>
          </div>

          {/* Hero content - right side */}
          <div className="lg:w-1/2 text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground leading-tight font-display">
              Dog shows shouldn't be paperwork.
            </h1>
            <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto lg:mx-0">
              Enter shows, track your dogs' careers, and manage events — so you can focus on what
              matters.
            </p>

            {/* CTA Button */}
            <div className="mt-8 flex justify-center lg:justify-start">
              <Button asChild size="lg" className="rounded-full">
                <Link to="/shows">Find a Show</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
```

Key changes:

- Removed: search box, easter egg, pricing CTA, all unused imports
- Added: `font-display` class on headline for Playfair Display
- CTA: solid primary Button linking to `/shows`
- Alt text: changed from "Robot dog with blue glowing eyes" to "myK9Show logo"
- Kept: logo left/content right layout, responsive stacking, hover:scale-105 on logo

- [ ] **Step 2: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/landing/Hero.tsx
git commit -m "feat: rewrite hero with problem-first copy and Find a Show CTA"
```

---

## Chunk 3: How It Works + Feature Rewrite + FAQ + Section Reorder

### Task 4: Update Feature Type + Rewrite Feature Data

**Files:**

- Modify: `apps/myk9show/src/types/index.ts` (lines 223-227)
- Rewrite: `apps/myk9show/src/data/features.tsx`
- Modify: `apps/myk9show/src/components/landing/FeaturesSection.tsx`

> **Note:** These three files must be updated together — changing the Feature type alone would break typecheck until the data and component are updated.

- [ ] **Step 1: Add label field to Feature type**

In `apps/myk9show/src/types/index.ts`, replace:

```typescript
export interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}
```

With:

```typescript
export interface Feature {
  icon: React.ReactNode;
  label: string;
  title: string;
  description: string;
}
```

- [ ] **Step 2: Replace features.tsx content**

```tsx
import { Dog, Calendar, Building2 } from 'lucide-react';
import type { Feature } from '../types';

const features: Feature[] = [
  {
    icon: <Dog className="w-8 h-8 text-primary" width={32} height={32} />,
    label: 'For Exhibitors',
    title: 'Enter shows, track titles, manage your dogs',
    description:
      'Pre-filled entries, competition history, health records, and title tracking — everything you need before and after show day.',
  },
  {
    icon: <Calendar className="w-8 h-8 text-primary" width={32} height={32} />,
    label: 'For Secretaries',
    title: 'Set up shows, manage entries, publish results',
    description:
      'Smart defaults, class templates, judge assignments. The software handles the logistics so you can handle the show.',
  },
  {
    icon: <Building2 className="w-8 h-8 text-primary" width={32} height={32} />,
    label: 'For Clubs',
    title: 'One platform for your entire trial program',
    description:
      'Registration, payments, scheduling, and reporting. Get your club running on myK9 in a day — we'll help you set up.',
  },
];

export default features;
```

- [ ] **Step 3: Update FeaturesSection to render label**

In `FeaturesSection.tsx`, add the label rendering and update the section heading/subtitle.

Replace the section heading area:

Old:

```tsx
<h2 className="text-3xl font-bold mb-8 text-center">Comprehensive Show Management</h2>
<p className="mb-12 text-center text-muted-foreground">Everything you need to run successful dog shows, from registration to results.</p>
```

New:

```tsx
<h2 className="text-3xl font-bold mb-12 text-center">Built for every role at the show</h2>
```

Inside the card, add the label above the title. After the icon container `</div>` and before the `<h3>`, add:

```tsx
<p className="text-sm font-semibold text-primary mb-2">{feature.label}</p>
```

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/types/index.ts apps/myk9show/src/data/features.tsx apps/myk9show/src/components/landing/FeaturesSection.tsx
git commit -m "feat: rewrite feature cards with role-addressed copy"
```

---

### Task 5: Create How It Works Component

**Files:**

- Create: `apps/myk9show/src/components/landing/HowItWorks.tsx`

- [ ] **Step 1: Create HowItWorks.tsx**

```tsx
import { Search, ClipboardCheck, Trophy, BarChart3 } from 'lucide-react';

const steps = [
  {
    number: 1,
    title: 'Browse',
    description: 'Find shows by date, location, or organization',
    icon: Search,
  },
  {
    number: 2,
    title: 'Enter',
    description: 'Register your dogs in seconds — we remember your info',
    icon: ClipboardCheck,
  },
  {
    number: 3,
    title: 'Compete',
    description: 'Live scoring, run orders, and results on show day',
    icon: Trophy,
  },
  {
    number: 4,
    title: 'Track',
    description: 'Titles, health records, and career history — all in one place',
    icon: BarChart3,
  },
];

export default function HowItWorks() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>

        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 list-none p-0">
          {steps.map(step => (
            <li key={step.number} className="text-center">
              <div className="flex flex-col items-center">
                <div
                  className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-4"
                  aria-hidden="true"
                >
                  <step.icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-sm font-bold text-primary mb-1" aria-hidden="true">
                  Step {step.number}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">{step.title}</h3>
                <p className="text-muted-foreground text-sm max-w-[200px]">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/landing/HowItWorks.tsx
git commit -m "feat: add How It Works section component"
```

---

### Task 6: Expand FAQ Data and Update Section

**Files:**

- Rewrite: `apps/myk9show/src/data/faqs.ts`
- Modify: `apps/myk9show/src/components/landing/FAQSection.tsx`

- [ ] **Step 1: Replace faqs.ts content**

```typescript
import type { FAQ } from '../types';

const faqs: FAQ[] = [
  {
    question: 'What does myK9Show cost?',
    answer:
      'myK9Show is free for browsing shows, entering events, and viewing results. Premium ($4.99/month) adds title tracking, health records, training journals, and performance stats. No per-dog fees — one subscription covers all your dogs.',
  },
  {
    question: 'Does it work offline at the show grounds?',
    answer:
      "Yes. Our companion app myK9Q is built for show day — it works fully offline with automatic sync when you're back online. Scores, run orders, and check-ins all work without an internet connection.",
  },
  {
    question: 'Which organizations do you support?',
    answer:
      "We currently support AKC, UKC, and ASCA events. More organizations are coming — if yours isn't listed, let us know through the club onboarding form.",
  },
  {
    question: 'How do I get my club set up?',
    answer:
      "Fill out the club onboarding form below and we'll get you running — usually within 24 hours. We'll help migrate your existing data and walk you through setup.",
  },
  {
    question: 'Is my data safe?',
    answer:
      'Your data is stored securely on Supabase (built on AWS) with encryption at rest and in transit. We never share your personal information. You can export your data anytime.',
  },
  {
    question: 'Can I use it on my phone or tablet?',
    answer:
      'Absolutely. myK9Show works in any modern browser on phone, tablet, or desktop. For show day, our companion app myK9Q is optimized for tablets at ringside.',
  },
];

export default faqs;
```

- [ ] **Step 2: Update FAQSection heading and subtitle**

In `FAQSection.tsx`, replace the heading area:

Old:

```tsx
<div className="flex justify-center items-center gap-3 mb-4">
  <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
</div>
<p className="text-muted-foreground max-w-2xl mx-auto">
  Got questions? We've got answers! Click on any question below to learn more.
</p>
```

New:

```tsx
<h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
```

Remove the perky subtitle — the heading is sufficient.

- [ ] **Step 3: Update FAQSection footer**

Replace the footer message:

Old:

```tsx
<div className="mt-12 text-center p-6 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl border border-primary/10">
  <div className="flex items-center justify-center gap-2 mb-2">
    <span className="font-semibold text-card-foreground">Still have questions?</span>
  </div>
  <p className="text-muted-foreground">
    Our support team is always ready to help! Reach out anytime and we'll get back to you quickly.
  </p>
</div>
```

New:

```tsx
<div className="mt-12 text-center p-6 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-xl border border-primary/10">
  <p className="font-semibold text-card-foreground mb-1">Still have questions?</p>
  <p className="text-muted-foreground">Reach out anytime — we're happy to help.</p>
</div>
```

- [ ] **Step 4: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/data/faqs.ts apps/myk9show/src/components/landing/FAQSection.tsx
git commit -m "feat: expand FAQ with 6 real questions and update section copy"
```

---

### Task 7: Reorder Sections in Home.tsx

**Files:**

- Modify: `apps/myk9show/src/pages/Home.tsx`

- [ ] **Step 1: Add HowItWorks import**

Add at the top of Home.tsx with the other imports:

```tsx
import HowItWorks from '@/components/landing/HowItWorks';
```

- [ ] **Step 2: Reorder sections**

Replace the return JSX. Current order:

1. Hero
2. FeaturesSection (wrapped in FadeIn)
3. UpcomingShows (wrapped in FadeIn with delay)
4. Pricing (wrapped in FadeIn)
5. ClubOnboardingForm (wrapped in FadeIn)
6. FAQSection (wrapped in FadeIn)

New order:

```tsx
return (
  <div className="min-h-screen bg-background">
    <Hero />

    {/* Upcoming Shows - moved up to prove value immediately */}
    <FadeIn>
      <div className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Suspense fallback={<DelightfulLoading variant="carousel" />}>
            <UpcomingShows
              shows={mappedShows}
              variant="carousel"
              className="mt-8"
              isLoading={showsLoading}
              isEmpty={!showsLoading && mappedShows.length === 0}
            />
          </Suspense>
        </div>
      </div>
    </FadeIn>

    {/* How It Works */}
    <FadeIn>
      <HowItWorks />
    </FadeIn>

    {/* Features Section */}
    <FadeIn>
      <FeaturesSection features={memoizedFeatures} />
    </FadeIn>

    {/* Pricing Section */}
    <FadeIn>
      <Pricing />
    </FadeIn>

    {/* Club Onboarding Form */}
    <FadeIn>
      <ClubOnboardingForm />
    </FadeIn>

    {/* FAQ Section */}
    <FadeIn>
      <FAQSection faqs={memoizedFaqs} />
    </FadeIn>
  </div>
);
```

Remove the `delay={0.1}` from the UpcomingShows FadeIn (no longer needed since it's the first content section).

- [ ] **Step 3: Run typecheck and lint**

Run: `cd apps/myk9show && pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/pages/Home.tsx
git commit -m "feat: reorder landing sections — shows first, add How It Works"
```

---

## Chunk 4: Visual Verification

### Task 8: Add HowItWorks Render Test

**Files:**

- Create: `apps/myk9show/src/components/landing/__tests__/HowItWorks.test.tsx`

- [ ] **Step 1: Write render test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HowItWorks from '../HowItWorks';

describe('HowItWorks', () => {
  it('renders all four steps', () => {
    render(<HowItWorks />);

    expect(screen.getByText('How It Works')).toBeInTheDocument();
    expect(screen.getByText('Browse')).toBeInTheDocument();
    expect(screen.getByText('Enter')).toBeInTheDocument();
    expect(screen.getByText('Compete')).toBeInTheDocument();
    expect(screen.getByText('Track')).toBeInTheDocument();
  });

  it('renders step descriptions', () => {
    render(<HowItWorks />);

    expect(screen.getByText(/Find shows by date/)).toBeInTheDocument();
    expect(screen.getByText(/Register your dogs/)).toBeInTheDocument();
    expect(screen.getByText(/Live scoring/)).toBeInTheDocument();
    expect(screen.getByText(/Titles, health records/)).toBeInTheDocument();
  });

  it('uses semantic ol for accessibility', () => {
    const { container } = render(<HowItWorks />);
    const list = container.querySelector('ol');
    expect(list).toBeInTheDocument();
    expect(list?.querySelectorAll('li')).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `cd apps/myk9show && pnpm test -- --run src/components/landing/__tests__/HowItWorks.test.tsx`
Expected: 3 tests pass

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/components/landing/__tests__/HowItWorks.test.tsx
git commit -m "test: add HowItWorks component render tests"
```

---

### Task 9: Manual Visual Review

- [ ] **Step 1: Start dev server**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm dev:show`

- [ ] **Step 2: Verify in browser**

Check at http://localhost:5173 (logged out):

1. Hero: "Dog shows shouldn't be paperwork." headline, "Find a Show" CTA
2. "Find a Show" navigates to `/shows`
3. Upcoming Shows carousel renders (or empty state)
4. How It Works: 4 steps in a row (desktop), 2x2 (tablet), stacked (mobile)
5. Features: 3 role-addressed cards, no cursor-pointer, subtle hover
6. Pricing: "Free to start. Premium when you're ready." heading, different card borders
7. Free tier "Get Started" navigates to `/sign-up`
8. FAQ: 6 questions, all expand/collapse
9. Toggle dark mode — verify all sections look correct

- [ ] **Step 3: Final typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: No errors

- [ ] **Step 4: Run tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All passing (no landing page tests should break since they're mostly snapshot-free)
