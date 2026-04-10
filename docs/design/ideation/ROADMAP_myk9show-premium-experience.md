# myK9Show Premium Experience — Implementation Roadmap

**Date:** 2026-02-21
**Source:** Ideation session (2026-02-20) + codebase gap analysis
**Vision:** "The app understands that dog showing is a career, not a transaction, and that insight benefits both sides of the market."

---

## Current State Assessment

### Already Built (Foundation Exists)

- Dog records, registrations, achievements, competition history (types + UI)
- Show hierarchy (shows → trials → classes → entries) with full secretary workflow
- Scoring across 10 sport formats (agility, obedience, rally, conformation, tracking, lure coursing, barn hunt, fast CAT, dock diving, scent work)
- Auth/RBAC with exhibitor, secretary, judge, admin roles + scoped permissions
- Stripe integration (products, pricing page, feature gates — but payment writes are stubbed)
- Exhibitor dashboard, show calendar, entry workflow
- Notification infrastructure (FCM tokens, notification queue, preferences)
- `exhibitor_profiles.subscription_tier` (free | premium | pro) in the DB
- Realtime infrastructure (RealtimeScoringService, RealtimeEventBus, RealtimeConnectionManager)
- Collaboration services (CollaborationHub, LiveUpdates, Presence)

### Critical Gaps

| Gap | Impact | Blocks |
|-----|--------|--------|
| Payment write path is stubbed (`createPaymentIntent`, `confirmPayment`, `processRefund` are mocks) | Can't charge anyone | All monetization |
| Edge Functions don't exist on disk (stripe-checkout, stripe-customer-portal, stripe-upgrade-subscription) | No server-side Stripe calls | All monetization |
| Feature gates aren't wired (`FeatureGate` always defaults to `'free'`; `subscription_tier` never flows in) | Can't gate premium features | All tiering |
| Tier naming mismatch (`free/basic/premium/enterprise` in code vs `Novice/Advanced/Excellent` in UI) | Confusing, error-prone | Clean tier rollout |
| ExhibitorDashboard uses mock data (no live queries for entries/results) | Exhibitors see fake data | Career Narrative |
| Achievements DB schema doesn't match TypeScript types (migration is minimal) | Can't persist rich achievement data | Title tracking |
| No training journal or title progression DB tables (UI exists, nothing persists) | Career features are empty shells | Career Narrative |
| No AKC/UKC external data import (types exist, no service) | Can't bootstrap career data for existing exhibitors | Career completeness |
| No pedigree database table (UI components exist) | Pedigree data doesn't persist | Future breeding extension |

---

## Phase 0: Foundation Fixes

**Duration:** 2-3 weeks
**Principle:** You can't sell premium until free works end-to-end.

### 0.1 — Wire ExhibitorDashboard to Live Data
- Replace `mockEntries` with live Supabase queries against `entries` table
- Connect exhibitor's dogs → their entries → results via `exhibitor_profiles.person_id`
- Show real upcoming shows, past results, and current entry status

### 0.2 — Deploy Stripe Edge Functions
- Implement `stripe-checkout` Edge Function (create Checkout Session)
- Implement `stripe-customer-portal` Edge Function (manage subscriptions)
- Implement `stripe-upgrade-subscription` Edge Function (tier changes)
- Wire `PaymentService.ts` write methods to call Edge Functions via `supabase.functions.invoke()`
- Test end-to-end with Stripe test mode

### 0.3 — Fix Feature Gate Pipeline
- Flow `exhibitor_profiles.subscription_tier` into `AuthContext`
- Pass actual tier to `FeatureGate` component (replace hardcoded `'free'`)
- Align tier naming: `free` → Novice, `premium` → Advanced, `pro` → Excellent
- Update `featureUtils.ts` plan hierarchy to match

### 0.4 — Upgrade Database Schema
- Migrate `achievements` table to match rich TypeScript interface (`achievement_type`, `discipline`, `level`, `points`, `certificate_url`, etc.)
- Create `title_progress` table (dog_id, title_id, organization, discipline, points_earned, points_required, status, projected_completion_date)
- Create `training_journal` table (dog_id, entry_date, content, tags, linked_show_id)
- Create `pedigree` table (dog_id, sire_id, dam_id, generation)

### 0.5 — Acceptance Criteria
- [ ] ExhibitorDashboard shows real entries for the logged-in user
- [ ] A user can complete a Stripe checkout and their `subscription_tier` updates
- [ ] `FeatureGate` correctly blocks/allows features based on the user's actual tier
- [ ] Achievements can be persisted with full detail (organization, discipline, level, points)
- [ ] `pnpm typecheck` passes, `pnpm build` succeeds

---

## Phase 1: The Career Narrative (The Soul)

**Duration:** 4-6 weeks
**Principle:** This is why exhibitors open the app when there's no show to manage.
**Monetization:** Free tier creates the hook and habit. Premium tier adds strategic intelligence.

### 1.1 — Career Page
- New "Career" tab on `DogDetailsPage` (alongside existing Health, Registrations, Pedigree, etc.)
- Show history timeline: every show entered, result, placement, points earned
- Title progress bars: visual progress toward each title (points earned / points required)
- Career stats: total shows, win rate, titles earned, time to title averages
- **Builds on:** Existing `DogDetailsPage` sub-navigation, `achievementsStore`, `competitionStore`

### 1.2 — Title Rules Engine
- Encode AKC conformation title requirements (CH, GCH, GCH-B/S/G/P)
- Point calculation: entries vs. points awarded, major tracking
- Support for multiple organizations (AKC first, UKC/ASCA later)
- Service: `TitleProgressService` — calculates current progress, remaining requirements, projected timeline
- **Builds on:** Existing `scoring-types.ts` ConformationScore, `achievement.ts` types

### 1.3 — Post-Show Moment
- Trigger: when a show's status transitions to `completed`
- For each exhibitor who had entries: generate a career update
- Content: "Rex earned 2 points today. He now has 13 of 15 toward his Championship. Here's what today's win means."
- Delivery: push notification + in-app notification + optional email
- **Builds on:** Existing notification queue, `NotificationTemplates`, FCM infrastructure
- **Free tier feature** — this is the acquisition hook

### 1.4 — The Tuesday Screen
- Redesign ExhibitorDashboard home tab as the "career dashboard"
- Progress bars for each dog's active title pursuit
- Upcoming shows with strategic relevance ("Judge Chen is judging Golden Retrievers — you've placed 1st under her twice")
- Recent results with career context ("3 more points to go")
- **Builds on:** ExhibitorDashboard (now wired to live data from Phase 0)
- **Free tier feature** — this is the daily habit

### 1.5 — Judge History
- Per-dog tracking: which judges, what placements, win rate per judge
- Data source: join `entries` (with results) to `judge_assignments`
- Display on Career Page: "Judge Performance" section
- **Premium tier feature** — detailed judge analytics and recommendations

### 1.6 — Competitive Awareness (Premium)
- Regional breed rankings based on platform data
- "Dogs close to finishing" in your breed
- Show-specific: "The #1 Golden Retriever in the region just entered this show"
- **Premium tier feature** — the competitive landscape

### 1.7 — First Chapter (Novice Onboarding)
- For dogs with 0 shows: "Cooper: Chapter 1 of many"
- Career page shows the map (title requirements, typical timelines) instead of history
- Opt-in contextual guidance during first show experience
- **Free tier feature** — converts first-timers into second-timers

### 1.8 — Acceptance Criteria
- [ ] Every dog has a Career tab with real data
- [ ] Title progress bars calculate correctly for AKC conformation
- [ ] Post-Show Moment notifications fire automatically when a show completes
- [ ] Tuesday Screen shows personalized career dashboard with live data
- [ ] Judge history displays per-dog placement records
- [ ] Feature gates correctly separate free (career page, post-show, tuesday screen) from premium (judge analytics, competitive awareness)

---

## Phase 2: The Intelligent Show Design Engine (The Spine)

**Duration:** 6-8 weeks
**Principle:** This is why secretaries can't go back to spreadsheets.
**Monetization:** Free tier shows conflicts. Professional tier solves them.

### 2.1 — Constraint Model
- Define the constraint types: judge assignments, ring availability, exhibitor multi-entries, time blocks, breed group ordering, venue limits
- Data model: `ScheduleConstraint` (type, entities, severity, resolution options)
- Service: `ConstraintDetectionService` — given a schedule, enumerate all conflicts
- **Builds on:** Existing show/trial/class hierarchy, judge_assignments table

### 2.2 — Conflict Dashboard (Free)
- Secretary view: real-time dashboard showing all detected conflicts
- Visual: color-coded severity (error/warning/info)
- Grouped by type: judge overlaps, exhibitor time gaps, ring collisions
- Updates instantly as the secretary modifies the schedule
- **Free tier feature** — the secretary's Post-Show Moment (the hook)

### 2.3 — What-If Simulator (Professional)
- "What happens if Judge Smith cancels?" — instant re-solve with alternative configurations
- "What if entries in Sporting are 20% higher than expected?" — schedule stress test
- Temporary schedule branching (preview changes without committing)
- Service: `ScheduleSimulatorService` — applies hypothetical changes and re-runs conflict detection
- **Professional tier feature**

### 2.4 — Adaptive Show Day (Professional)
- Live schedule adjustments when breeds finish early or late
- Push real-time updates to exhibitor phones: "Ring 3 is running 15 minutes ahead. Your breed has been moved up. Updated time: 2:15pm"
- Ring steward view: updated timeline reflecting actual progress
- **Builds on:** Existing realtime infrastructure (RealtimeEventBus, push notifications)
- **Professional tier feature**

### 2.5 — Shared Visibility (Professional)
- Read-only committee dashboard for show chair, superintendent, chief ring steward
- Current schedule, recent changes, active conflicts, ring status
- One person builds; the committee sees
- **Builds on:** Existing RBAC scoped roles (show-level permissions)
- **Professional tier feature**

### 2.6 — Post-Show Report (Professional)
- Auto-generated show report for the secretary after completion
- Entry stats, conflict resolution history, timing data, exhibitor satisfaction indicators
- Eliminates hours of manual post-show paperwork
- **Professional tier feature**

### 2.7 — Acceptance Criteria
- [ ] Conflict detection identifies judge overlaps, exhibitor time gaps, and ring collisions
- [ ] Free conflict dashboard updates in real-time as schedule changes
- [ ] What-if simulator shows impact of hypothetical changes without committing
- [ ] Adaptive show day pushes schedule updates to exhibitor devices
- [ ] Committee members see live read-only dashboard
- [ ] Feature gates correctly separate free (conflict dashboard) from professional (simulator, adaptive, shared visibility)

---

## Phase 3: The Emergent Intelligence Layer (The Moat)

**Duration:** 8-12 weeks
**Principle:** The intelligence that emerges from having both pillars in one platform is the competitive advantage.
**Prerequisite:** Phase 1 + Phase 2 data flowing through the system.

### 3.1 — Smart Entry Recommendations (Premium)
- Combine exhibitor's career state with show structural data
- "Enter Saturday for the major chance with Judge Chen (you've placed 1st under her twice)"
- "Enter Sunday to build data on a new judge"
- Factor in: career needs, judge history, entry predictions, major probability
- Service: `EntryRecommendationEngine` — scoring model that ranks shows by strategic value

### 3.2 — Cross-Show Campaign Optimization (Premium)
- Multi-show cluster strategy
- "The Springfield cluster has 4 shows over 2 days. Enter Shows 1 and 3 for best major probability. Skip Show 2. Enter Show 4 only if Show 1 doesn't produce your major."
- Requires: career goals + multi-show entry data + probability models
- Service: `CampaignOptimizer` — multi-show strategy engine

### 3.3 — Predictive Entry Intelligence (Professional)
- For secretaries: "Your show is projected to have a major in Golden Retrievers"
- "23 exhibitors within 100 miles are one win away from a title in breeds you're offering"
- Dynamic show marketing: "A targeted email to these exhibitors could push 3 breeds over the major threshold"
- Service: `EntryPredictionService` — forecasts entry counts by breed based on regional career data

### 3.4 — Competitive Landscape (Premium)
- Regional standings by breed, updated as shows complete
- "Who's close to finishing" — exhibitors near title completion in your breed
- Trending: newcomers climbing, winning streaks, title finishes
- Data source: aggregated career data across all platform users

### 3.5 — Acceptance Criteria
- [ ] Smart Entry Recommendations surface for shows the exhibitor is browsing
- [ ] Campaign Optimizer produces multi-show strategies for cluster weekends
- [ ] Secretary dashboard shows predicted entry counts and major probability
- [ ] Regional competitive standings update after each show completion
- [ ] Recommendations improve as more data flows through the platform

---

## Phase 4: Monetization Activation (Parallel Track)

**Runs alongside Phases 1-3.** Each phase unlocks features that get gated.

### Tier Architecture

| Tier | Public Name | DB Value | Price | Target | What's Included |
|------|-------------|----------|-------|--------|-----------------|
| Free | Novice | `free` | $0 | Everyone | Post-Show Moment, basic career page, basic show management, conflict detection dashboard |
| Premium | Advanced | `premium` | $9.99-14.99/mo or $99-149/yr | Exhibitors | Judge history, strategic recommendations, campaign optimization, competitive awareness, advanced career analytics |
| Professional | Excellent | `pro` | $99-299/show | Clubs/Secretaries | Full show design engine, what-if simulator, adaptive show day, shared visibility, predictive entry intel, post-show reports |

### Key Monetization Principles

1. **Everything that creates data or drives the flywheel is free.** Free users are the network — they generate the career data that makes premium tiers valuable.
2. **Free tier tells you where you are. Premium tier tells you where to go.** Same model as fitness trackers: step count is free, training plan is premium.
3. **Per-show pricing for secretaries** rather than annual subscription — lower trial barrier for volunteer organizations. Annual offered as a discount once usage is established.
4. **The free tier is the data acquisition layer.** The more free users, the more valuable premium becomes.

### Feature Gate Mapping

| Feature | Tier | Phase |
|---------|------|-------|
| Post-Show Moment notifications | Free | 1 |
| Basic career page (show history, points, titles) | Free | 1 |
| Title progress bars | Free | 1 |
| Tuesday Screen (career dashboard) | Free | 1 |
| First Chapter (novice onboarding) | Free | 1 |
| Basic show creation and entry management | Free | Existing |
| Conflict detection dashboard | Free | 2 |
| Judge history and performance analysis | Premium | 1 |
| Competitive awareness (rankings, standings) | Premium | 1 |
| Smart Entry Recommendations | Premium | 3 |
| Cross-Show Campaign Optimization | Premium | 3 |
| Advanced career analytics | Premium | 1 |
| What-if simulator | Professional | 2 |
| Adaptive show day scheduling | Professional | 2 |
| Shared committee visibility | Professional | 2 |
| Predictive entry intelligence | Professional | 3 |
| Auto-generated post-show reports | Professional | 2 |
| Dynamic show marketing tools | Professional | 3 |

---

## Open Questions (From Ideation Session)

These need resolution before or during implementation:

1. **Post-Show Moment delivery:** Entry forms contain emails, but the first unsolicited contact must feel like a gift, not spam. Needs email consent strategy (CAN-SPAM, GDPR considerations).

2. **Career data bootstrapping:** How do we populate career histories for exhibitors who join mid-career? Options: AKC data import, manual entry, third-party data sources. Affects Phase 1 completeness.

3. **Constraint solver complexity:** Real-time constraint satisfaction for 200+ breeds across multiple rings and judges is non-trivial. Needs feasibility investigation — heuristic approaches (fast, good enough) vs. sophisticated optimization. UX must feel instant.

4. **Minimum data density for intelligence:** Smart Entry Recommendations require data from multiple shows. What's the minimum viable data density for a region? How does the app provide value before that threshold?

5. **AKC/UKC rules engine scope:** Different registries have different title structures, point systems, and requirements. Start with AKC conformation, but the architecture must support extension.

6. **Superintendent relationship:** The show design engine could be positioned as a tool for superintendents (B2B) or as a replacement for their scheduling function. Positioning matters.

7. **Pricing validation:** $9.99-14.99/mo exhibitor and $99-299/show professional pricing are estimates. Both need market validation within the dog show community.

---

## What This Vision Explicitly Is Not

From the ideation session — boundaries to maintain:

- **Not a social network.** Competitive awareness (leaderboards, standings), not friend lists and feeds. Facebook groups already own the social layer.
- **Not a spectator app (yet).** The novice exhibitor angle is kept; the broader spectator vision is deferred to year 2-3.
- **Not a breeding program manager (yet).** Multi-generational tracking is Phase 2+ after exhibitor and secretary experiences are nailed.
- **Not a B2B data analytics platform (yet).** Health of the Sport Dashboard requires massive platform adoption first — year 3+.
- **Not gamification.** Career tracking uses fitness tracker simplicity (progress bars), not RPG mechanics (skill trees, unlocks).

---

## Recommended Starting Point

**Phase 0 is the prerequisite for everything.**

Highest-impact first moves:
1. Wire ExhibitorDashboard to live data (replaces mocks, proves the data layer)
2. Fix the feature gate pipeline (`subscription_tier` → `FeatureGate`)
3. Upgrade achievements schema (unblocks Career Narrative)
4. Deploy Stripe Edge Functions (unblocks monetization)

Once Phase 0 is complete, Phase 1 (Career Narrative) is the strategic priority — it's the soul of the product and the acquisition engine that makes everything else grow.
