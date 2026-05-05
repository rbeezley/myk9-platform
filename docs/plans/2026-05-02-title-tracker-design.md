# Design: Early Adopter Exhibitor Release

**Date:** 2026-05-02  
**Status:** Approved — ready for implementation planning  
**App:** `apps/myk9show` — no new app, no new Vercel project  
**URL:** `myk9show.com` (existing deployment)

---

## 1. Overview

Release a polished, focused exhibitor experience on myK9Show before the full show management platform is complete. Early adopters get free access to dog management tools — title tracking, training journal, health records, pedigree — while show entry features arrive later.

**The strategy:** myK9Show already has most of this built. The work is unlocking what exists, flagging what isn't ready, and giving exhibitors a clean entry point into the dog tools. When show management is complete, the "coming soon" screens flip to real features and early adopters' data is already in the system.

**Early adopter value proposition:** Track your dog's AKC Scent Work title progress, log training sessions, manage health records, and build your pedigree — free, today, on the platform that will eventually manage your show entries too.

---

## 2. What Early Adopters See

A clean, minimal experience focused entirely on dog management. Show-related features exist in the nav but show "coming soon" screens rather than being hidden — this builds anticipation and signals that more is coming.

### Nav for early adopters
- **My Dogs** — their dog roster, entry point to all dog tools
- **Shows** — coming soon placeholder
- **My Entries** — coming soon placeholder  
- **Calendar** — coming soon placeholder
- **Account / Profile / Notifications** — fully functional

### Dog Details tabs (at `/dogs/:id`)

| Tab | State | Notes |
|---|---|---|
| Activity | ✅ Live | Shows recent activity |
| Registrations | ✅ Live | Shows their own entries |
| Title Progress | ✅ Live (unlocked) | Early adopter bypass on BlurGate |
| Training Journal | ✅ Live (unlocked) | Early adopter bypass on BlurGate |
| Health Records | ✅ Live (unlocked) | Early adopter bypass on BlurGate |
| Pedigree | ✅ Live (unlocked) | Early adopter bypass — verify build status before launch |
| Competitions | 🔒 Feature flagged | Depends on show management |
| Statistics | 🔒 Feature flagged | Depends on competition data |

---

## 3. Feature Flags

A single TypeScript config file. Flip a flag to `true` and redeploy — the "coming soon" screen becomes the real page.

Show-management flags default to `import.meta.env.DEV` so local development (`localhost:5173`) keeps the full exhibitor experience intact for continued Phase 2 testing, while production builds (Vercel) serve the "coming soon" screens. No `.env` files or secrets needed — Vite sets `DEV` automatically.

```typescript
// src/config/features.ts
const dev = import.meta.env.DEV;

export const features = {
  // Dog tools — live for early adopters
  titleTracking: true,
  trainingJournal: true,
  healthRecords: true,
  pedigree: true,        // verify build status before enabling

  // Dog Details tabs — hidden until competition data exists
  competitionsTab: false,
  statisticsTab: false,

  // Show management — production off, dev on
  browsShows: dev,
  showRegistration: dev,
  myEntries: dev,
  calendar: dev,
  showDay: dev,
  analytics: dev,
} as const;
```

**Two gates, different purposes:**

| Gate | What it does | Used for |
|---|---|---|
| `features.*` | Shows a "coming soon" screen | Features not ready yet |
| `BlurGate` / early adopter | Blurs content, upgrade CTA | Premium features |
| Early adopter flag | Bypasses BlurGate | Free access during launch period |

Early adopters see real content instead of the blur — but still see "coming soon" screens for flagged features.

---

## 4. Early Adopter Access Model

A single boolean column on `public.people`:

```sql
ALTER TABLE people ADD COLUMN is_early_adopter BOOLEAN NOT NULL DEFAULT FALSE;
```

`useSubscriptionGate` checks this alongside the existing premium check:

```typescript
const isPremium = subscription?.active || person?.is_early_adopter;
```

Early adopters are set manually via Supabase dashboard for now — no self-serve signup flow needed for v1. When myK9Show launches fully, early adopters keep their access permanently as a reward for joining early.

---

## 5. My Dogs Page

`/dogs` currently shows a public directory of all dogs on the platform. For exhibitors, redirect to a "My Dogs" view showing only their own dogs.

- Exhibitor role → `/dogs` renders their roster with an "Add a dog" CTA
- Non-exhibitor roles → existing browse behavior unchanged
- Dog form (add/edit): registered name, call name, breed, AKC number, DOB — writes to `public.dogs`

---

## 6. Coming Soon Screens

Flagged routes render a consistent placeholder instead of the real page. Simple, not apologetic — positions the feature as coming, not missing.

```
[Icon]
[Feature Name]

Show entry and competition management is coming soon.
We're building it now — your dogs and training data
will be ready and waiting when it arrives.

[Notify me when it's ready →]  (optional — captures email interest)
```

One reusable `ComingSoonPage` component, takes a title, icon, and description as props.

---

## 7. AKC Scent Work Title Seeding

A single migration seeds title definitions into `sport_templates` and `sport_titles`. The title engine already reads from these tables — this is data only, no code changes.

**Structure:**
- Elements: Container, Interior, Exterior, Buried
- Levels: Novice, Advanced, Excellent, Master
- Element titles: SWCN, SWIN, SWEN, SWBN, SWCA, SWIA, SWEA, SWBA, SWCE, SWIE, SWEE, SWBE, SWCM, SWIM, SWEM, SWBM
- Combined level titles: SWN, SWA, SWE, SWM

> ⚠️ **Before writing the migration:** Confirm exact leg counts per element/level with user against current AKC rulebook. Especially confirm whether Master differs from lower levels.

---

## 8. Implementation Order

1. **Feature flags config** — `src/config/features.ts` + wire into routes and Dog Details tabs
2. **Coming soon component** — one reusable page, apply to all flagged routes
3. **Early adopter migration** — `is_early_adopter` column + `useSubscriptionGate` update
4. **My Dogs redirect** — exhibitor role sees their roster at `/dogs`
5. **AKC Scent Work seed migration** — title definitions (verify leg counts first)
6. **Pedigree tab audit** — confirm it's shippable before enabling
7. **QA walk** — sign in as a new exhibitor, walk the full early adopter experience end-to-end

---

## 9. Data Safety

Once real exhibitors are using the platform, the following tables hold real user data and must be treated as production:

- `public.people`
- `public.dogs`
- `public.manual_results`
- `public.training_journal_entries`
- `public.training_milestones`
- `public.sport_templates` / `public.sport_titles`

All myK9Show migrations touching these tables must be tested on a Supabase branch before pushing to main. See project memory: `project_titles_app_shared_tables.md`.

---

## 10. Integration Path to Full myK9Show

When show management is complete:

1. Flip feature flags to `true` for shows, entries, calendar, competitions tab, statistics tab
2. Early adopters' dogs, scores, and training data are already in the system — no migration
3. `useTitleProgress` automatically merges manual results with platform-scored trial results
4. Early adopters retain free premium access permanently

No data transfer, no duplicate accounts, no separate merge work.

---

## 11. Out of Scope (v1)

- Self-serve early adopter signup flow
- "Notify me" email capture on coming soon screens (add later)
- Multi-sport title tracking beyond AKC Scent Work
- Automatic result population from show trials
- Social / sharing features
