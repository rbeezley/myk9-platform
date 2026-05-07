# PRD: myK9Show Premium Experience — Phase 0 + Phase 1

**Version:** 1.0
**Date:** 2026-02-21
**Scope:** Phase 0 (Foundation Fixes) + Phase 1 (The Career Narrative)
**Source:** Ideation session (2026-02-20) + codebase gap analysis + roadmap

---

## 1. One-Sentence Problem

> Dog show exhibitors struggle to track their dogs' competitive careers across shows because no tool treats showing as an ongoing journey (just isolated events), resulting in career progress living in notebooks and heads — invisible, unstrategic, and disconnected from the shows they enter.

---

## 2. Demo Goal (What Success Looks Like)

**The demo must prove three things:**

1. **The Tuesday Screen works** — An exhibitor opens the app on a random Tuesday (no show happening) and sees something worth checking: progress bars toward titles, recent results in career context, and upcoming shows with strategic relevance.

2. **The Post-Show Moment works** — After a show completes, every exhibitor with an account who competed receives an automatic career update: what they earned, where they stand, what it means.

3. **The payment pipeline works end-to-end** — A free user sees gated premium features (judge analytics, competitive awareness), can upgrade via Stripe, and immediately gains access.

**Success = a viewer watches the demo and says:** "I'd check that every day" (exhibitor) or "I need my shows on this platform" (secretary).

### Non-Goals (explicitly out of scope)

- Show Design Engine (Phase 2)
- Smart Entry Recommendations / Campaign Optimization (Phase 3)
- AKC data import (future — manual entry and platform-generated data only)
- Multi-registry support (AKC conformation first, others later)
- Social features, spectator mode, breeding program tracking
- Real-time adaptive show-day scheduling
- Notifications for non-account exhibitors (platform users only for Post-Show Moment)

---

## 3. Target User (Role-Based)

**Primary:** Dog show exhibitor (owner-handler)

- **Role:** Enters their dogs in AKC conformation shows, tracks points toward Championship titles
- **Skill level:** Intermediate — has shown for 1-5 years, understands the point system, enters 5-20 shows per year
- **Key constraint:** Career tracking is manual (mental math, notebooks, spreadsheets). No tool connects results across shows into a coherent career picture. They check entry counts and judge assignments through word of mouth and fragmented websites.

**Secondary (affected by Phase 0):** Show secretary

- Uses myK9Show to manage shows. Their show completion triggers the Post-Show Moment for exhibitors.
- Phase 0 fixes ensure the secretary's existing workflow produces the data that powers the Career Narrative.

---

## 4. Core Use Case (Happy Path)

**"First Career Update → Daily Habit → Premium Upgrade"**

**Start condition:** Exhibitor has an account with 1+ dogs. A show they competed in just completed.

1. Show secretary marks the show as `completed` in myK9Show
2. System auto-generates career updates for all exhibitors (with accounts) who had entries
3. Exhibitor receives a push notification: *"Rex earned 2 points today — 13 of 15 toward his Championship"*
4. Exhibitor taps notification → lands on Rex's **Career Page** (new tab on Dog Details)
5. Career Page shows:
   - Title progress bar (13/15 points toward CH, 1 of 2 majors)
   - Show history timeline with today's result highlighted
   - Career stats (shows entered, win rate, points per show average)
6. Exhibitor navigates to **Tuesday Screen** (Exhibitor Dashboard home)
7. Tuesday Screen shows:
   - Summary banner: total points this month, next milestone across all dogs
   - Expandable card per dog with individual progress bars
   - Upcoming shows on the calendar
   - "Judge Chen is judging Goldens at Riverside — you've placed 1st under her twice" *(premium, shown as locked preview)*
8. Exhibitor taps locked judge insight → **Premium upgrade prompt**
9. Exhibitor completes Stripe checkout → tier updates to `premium`
10. Judge history and competitive awareness unlock immediately

**End condition:** Exhibitor is a paying premium subscriber who checks the app between shows.

---

## 5. Functional Decisions (What It Must Do)

### Phase 0 — Foundation

| ID | Function | Notes |
|----|----------|-------|
| F-001 | Display real exhibitor entries on dashboard | Replace mock data with live Supabase queries joining `exhibitor_profiles` → `people` → `entries` via `owner_id` on dogs |
| F-002 | Process Stripe checkout end-to-end | Edge Functions for checkout session creation, portal access, subscription management. Webhook updates `subscription_tier`. |
| F-003 | Gate features by actual subscription tier | Flow `exhibitor_profiles.subscription_tier` through `AuthContext` into `FeatureGate`. Align tier names: free=Novice, premium=Advanced, pro=Excellent. |
| F-004 | Persist rich achievement data | Upgrade `achievements` table schema to match the full `Achievement` interface from `achievement.ts` (20+ fields including org, discipline, level, points). |
| F-005 | Persist title progress records | New `title_progress` table tracking points earned vs. required per title per dog. |
| F-006 | Persist training journal entries | New `training_journal` table for dated entries linked to dogs and optionally to shows. |
| F-007 | Persist pedigree relationships | New `pedigree` table (dog_id, sire_id, dam_id) so existing pedigree UI components have a backing store. |

### Phase 1 — Career Narrative

| ID | Function | Notes |
|----|----------|-------|
| F-101 | Calculate AKC conformation title progress | Points earned (manually entered per result), points required, majors earned/required for CH and GCH levels. |
| F-102 | Display career page per dog | New "Career" tab on `DogDetailsPage` with progress bars, show history timeline, career stats. |
| F-103 | Generate post-show career updates | On show completion: compute per-exhibitor career deltas for platform users only. |
| F-104 | Deliver post-show notifications | Push (FCM) + in-app notification using existing notification infrastructure. |
| F-105 | Display Tuesday Screen dashboard | Exhibitor Dashboard home: summary banner across all dogs, expandable per-dog cards with progress bars, recent results with career context. |
| F-106 | Track judge history per dog | Aggregate from entries + judge_assignments: judge name, times shown, placements, win rate. |
| F-107 | Display competitive awareness (premium) | Regional breed standings, dogs close to finishing, notable entries at upcoming shows. |
| F-108 | Onboard novice exhibitors via First Chapter | Empty career → aspirational framing ("Chapter 1 of many"), title requirements map, contextual guidance. |
| F-109 | Gate premium features with upgrade prompts | Judge analytics and competitive awareness locked for free users with blurred preview + "Upgrade to Advanced" CTA. |
| F-110 | Allow manual point entry per result | Secretary or exhibitor manually enters points awarded for each conformation win. Field on entry/result record. |

---

## 6. UX Decisions

### 6.1 Entry Point

**Post-Show Moment (acquisition hook):**
- Push notification arrives after show completion (platform users only)
- Notification text: `"{DogName} earned {points} points today — {earned}/{required} toward {titleName}"`
- Tap → Dog's Career Page, scrolled to today's result

**Tuesday Screen (daily habit):**
- ExhibitorDashboard home tab (existing route `/exhibitor/dashboard`)
- First thing visible: summary banner with aggregate career momentum, then expandable per-dog cards
- No click required to see value — the numbers are the content

### 6.2 Inputs

**From the user:**
- **Points per result:** Manually entered by secretary or exhibitor after each conformation win. Field: "Points Awarded" (integer, 1-5 for conformation). This is the primary data input for career tracking.
- **Historical achievements:** Manual entry for titles earned before platform adoption (title name, date earned, organization, certificate number).
- **Training journal:** Free-text entries with date and optional show link.

**From the system:**
- Show completion event triggers career update generation
- Entry results (placement, qualification status) flow from scoring workflow
- Judge assignments joined with entry results produce judge history

### 6.3 Outputs

**Career Page (Dog Details → Career tab):**

| Section | Content | Tier |
|---------|---------|------|
| Title Progress | Progress bars per active title pursuit. E.g., "CH: 13/15 pts, 1/2 majors". Includes milestone markers. | Free |
| Show History | Reverse-chronological timeline: show name, date, class, placement, points earned, judge name. Today's result highlighted if applicable. | Free |
| Career Stats | Total shows, placements breakdown (1st/2nd/3rd/4th), points per show avg, time-to-title projection | Free |
| Judge History | Table: judge name, times shown, placements, win rate. Sortable. | Premium |
| Competitive Standing | Breed ranking in region, nearby competitors close to finishing | Premium |

**Tuesday Screen (Exhibitor Dashboard) — Summary + Drill-Down Layout:**

| Section | Content | Tier |
|---------|---------|------|
| Summary Banner | "This month: 5 points earned across 2 dogs. Rex is 2 points from CH." Top-level momentum indicator. | Free |
| Dog Cards (expandable) | One card per dog. Collapsed: name, breed, active title, progress bar. Expanded: recent results, next show, career stats. | Free |
| Recent Results | Last 3-5 results with career context ("2 more points to go", "Major win!") | Free |
| Upcoming Shows | Calendar shows the exhibitor might enter. Premium shows strategic hints (judge match, major probability). | Free / Premium hints |
| Judge Insights | "You've done well under Judge Chen — she's judging at Riverside" | Premium (blurred for free) |

**Post-Show Notification:**

| Field | Content |
|-------|---------|
| Title | "{DogName}: Show Day Results" |
| Body | "{points} points earned at {showName}. {earned}/{required} toward {title}." |
| Milestone variant | "MAJOR WIN! {DogName} earned {points} points — {earned}/{required} toward {title}. {majorsEarned}/{majorsRequired} majors." |
| Zero-point variant | "{DogName} competed at {showName}. {earned}/{required} toward {title}. Every show is a chapter." |
| Action | Tap → Career Page for that dog |

### 6.4 Feedback & States

| State | Behavior |
|-------|----------|
| **Loading** | Skeleton shimmer on Career Page sections and Tuesday Screen cards. Summary banner shows shimmer bar. |
| **Success** | Data populates smoothly. Post-show notification includes celebration micro-copy for milestones ("Major win!", "Title complete!"). |
| **Empty career (First Chapter)** | No results yet → "Chapter 1 of many" framing. Show title requirements map: "Here's what it takes to earn a Championship." Progress bar at 0% with encouraging copy. CTA: "Browse upcoming shows." |
| **Single dog** | Tuesday Screen skips summary banner, shows the one dog's career card expanded by default. |
| **Multiple dogs (3-5)** | Summary banner aggregates across all dogs. Cards collapsed by default, most-recently-active dog expanded. |
| **Partial data** | Show results without points (non-conformation, or points not yet entered): display results in timeline, skip point calculation, show "Points: awaiting entry" badge. |
| **Premium locked** | Blurred/dimmed preview of content with lock icon and "Upgrade to Advanced — $4.99/mo" CTA. User can see *that* data exists but not *what* it says. |
| **Stripe checkout flow** | Button → redirect to Stripe Checkout → return to `/checkout/success` → poll `subscription_tier` every 2s for up to 10s → unlock features. |
| **Checkout success** | Confetti or success toast: "Welcome to Advanced! Your career intelligence is now unlocked." Redirect to the feature they tried to access. |
| **Checkout failure** | Toast: "Payment could not be processed. Please try again." Return to previous screen. No tier change. |

### 6.5 Errors (Minimum Viable Handling)

| Scenario | Handling |
|----------|----------|
| No entries found for exhibitor | Tuesday Screen shows First Chapter treatment: "Start your journey" with browse shows CTA |
| Show completion fails to generate notifications | Silent failure with error logged to `frontend_logs`. Career data still recalculates on next page load via `title_progress` table. |
| Stripe webhook delayed (tier not updated after checkout) | Poll `exhibitor_profiles.subscription_tier` every 2s for up to 10s after checkout return. If still `free`, show "Processing your subscription — this usually takes a few seconds" with manual refresh button and support email link. |
| Judge history query returns no data | Section shows "Show under more judges to build your history" with explanation of what data populates this section. |
| Title progress can't be calculated (no points entered) | Show results timeline without progress bar. Banner: "Add points to your results to track title progress." Link to edit most recent result. |
| Points entry is invalid (negative, > 5, non-integer) | Inline validation on the points input field. Prevent save. "Points must be 1-5 for conformation." |
| Notification delivery fails (FCM token expired) | Mark notification as `failed` in `notification_queue`. In-app notification still visible. No retry — user sees it next time they open the app. |

---

## 7. Data & Logic

### 7.1 Inputs

| Data | Source | Notes |
|------|--------|-------|
| Dog records | Supabase `dogs` table | Existing — `owner_id` links to `people.id` |
| Show results | Supabase `entries` table | Existing — `isScored`, `finalPlacement`, `resultStatus` fields |
| Points awarded | Manual entry by secretary/exhibitor | New field: `conformation_points` on entries or a new `result_points` column |
| Judge assignments | Supabase `judge_assignments` table | Existing — links judge (person) to class within a show |
| AKC title rules | Static config in code | New — encode point requirements and major thresholds per title level |
| Subscription tier | `exhibitor_profiles.subscription_tier` | Existing column — needs to flow into `AuthContext` and be updated by Stripe webhooks |
| Stripe checkout events | Stripe webhooks → Edge Functions → DB update | New — Edge Functions process `checkout.session.completed` and update `subscription_tier` |
| FCM tokens | `fcm_tokens` table | Existing — linked to user for push delivery |
| Notification preferences | `notification_preferences` table | Existing — user controls which notification types they receive |

### 7.2 Processing

**Title Progress Calculation:**
```
entries (where dog_id = X, resultStatus in ['Qualified','completed'], conformation_points > 0)
  → sum conformation_points across all scored entries
  → count entries where conformation_points >= 3 as majors
  → look up title requirements from static AKC config
  → compute: {
      pointsEarned, pointsRequired, percentComplete,
      majorsEarned, majorsRequired, majorsComplete,
      status: 'not_started' | 'in_progress' | 'completed'
    }
  → upsert into title_progress table
  → return TitleProgressRecord
```

**Post-Show Moment Generation:**
```
show.status transition → 'completed'
  → query all entries for this show where isScored = true
  → join entries → dogs → owner_id → people → exhibitor_profiles (where auth_user_id IS NOT NULL)
  → filter to platform users only (has account)
  → group by exhibitor
  → for each exhibitor+dog pair:
      → fetch title_progress before this show (cached)
      → recalculate title_progress with new results
      → compute delta: { pointsBefore, pointsAfter, newMajor, titleCompleted }
      → generate notification payload:
          - standard: "{dog} earned {delta} points — {after}/{required} toward {title}"
          - major: "MAJOR WIN! ..."
          - title complete: "TITLE EARNED! {dog} has completed their {title}!"
      → insert into notification_queue (type: 'career_update')
  → trigger notification delivery (FCM + in-app)
```

**Judge History Aggregation:**
```
entries (where dog_id = X, isScored = true)
  → join classes → judge_assignments → people (as judge)
  → group by judge person_id
  → for each judge:
      → count total times shown
      → count placements (1st, 2nd, 3rd, 4th)
      → calculate win rate (1st place / total)
      → get last shown date
  → order by total times shown desc
  → return JudgeHistoryRecord[]
```

**Tuesday Screen Assembly:**
```
current user → exhibitor_profiles → person_id
  → fetch all dogs where owner_id = person_id, deceased = false
  → for each dog:
      → fetch latest title_progress records
      → fetch last 5 entries with results (entries where isScored = true, ordered by show date desc)
  → compute summary:
      → total points earned this month (across all dogs)
      → closest milestone: which dog is nearest to next title
      → upcoming shows: from shows where status = 'published' or 'accepting_entries'
  → return TuesdayScreenData
```

**Feature Gate Flow:**
```
Supabase auth session → fetch exhibitor_profiles.subscription_tier
  → store in AuthContext: { tier: 'free' | 'premium' | 'pro' }
  → FeatureGate component reads tier from context
  → for each gated feature:
      → check tier >= feature.requiredTier
      → if yes: render children
      → if no: render PremiumLockedPreview with upgrade CTA
```

**Stripe Checkout Flow:**
```
User clicks "Upgrade to Advanced"
  → frontend calls supabase.functions.invoke('stripe-checkout', {
      priceId: products.advanced.priceId,
      successUrl: window.location.origin + '/checkout/success',
      cancelUrl: window.location.origin + '/checkout/cancel'
    })
  → Edge Function creates Stripe Checkout Session with customer email
  → returns { url: checkoutSessionUrl }
  → frontend redirects to Stripe
  → user completes payment
  → Stripe sends checkout.session.completed webhook to Edge Function
  → Edge Function updates exhibitor_profiles.subscription_tier = 'premium'
  → user redirected to /checkout/success
  → frontend polls subscription_tier until updated
  → UI unlocks premium features
```

### 7.3 Outputs

| Output | Destination | Persistence |
|--------|-------------|-------------|
| Title progress calculations | UI (Career Page, Tuesday Screen) | Persisted in `title_progress` table. Recalculated when new results are entered or points are added. |
| Post-show career notifications | Push (FCM) + in-app (notification_queue) | Persisted in `notification_queue` with delivery status tracking. |
| Judge history records | UI (Career Page → Judge History section) | Computed on read (query-time aggregation from entries + judge_assignments). No separate table — query is fast enough for expected data volumes. |
| Career stats | UI (Career Page → Stats section, Tuesday Screen → Summary banner) | Computed on read from entries + title_progress. Could add caching later if needed. |
| Subscription tier | AuthContext → FeatureGate → all gated UI | Persisted in `exhibitor_profiles.subscription_tier`. Updated by Stripe webhooks. |
| Achievements | UI (Career Page → Achievements section) | Persisted in upgraded `achievements` table. Manual entry by user. |
| Training journal | UI (Dog Details → Training Journal tab) | Persisted in `training_journal` table. Manual entry by user. |

### 7.4 New Database Tables

**`title_progress`**
```sql
CREATE TABLE title_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  title_code text NOT NULL,          -- 'CH', 'GCH', 'GCH-B', 'GCH-S', 'GCH-G', 'GCH-P'
  organization text NOT NULL DEFAULT 'AKC',
  discipline text NOT NULL DEFAULT 'Conformation',
  points_earned integer NOT NULL DEFAULT 0,
  points_required integer NOT NULL,
  majors_earned integer NOT NULL DEFAULT 0,
  majors_required integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_date timestamptz,
  completed_date timestamptz,
  last_calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(dog_id, title_code, organization)
);
```

**`achievements` (upgraded from existing migration 005)**
```sql
-- Add missing columns to existing achievements table
ALTER TABLE achievements
  ADD COLUMN IF NOT EXISTS dog_id uuid REFERENCES dogs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS achievement_type text DEFAULT 'Title',
  ADD COLUMN IF NOT EXISTS abbreviation text,
  ADD COLUMN IF NOT EXISTS discipline text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS points integer,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS judge_name text,
  ADD COLUMN IF NOT EXISTS certificate_url text,
  ADD COLUMN IF NOT EXISTS show_id uuid REFERENCES shows(id),
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
```

**`training_journal`**
```sql
CREATE TABLE training_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id),
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL,
  tags text[] DEFAULT '{}',
  linked_show_id uuid REFERENCES shows(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**`pedigree`**
```sql
CREATE TABLE pedigree (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id uuid NOT NULL REFERENCES dogs(id) ON DELETE CASCADE UNIQUE,
  sire_id uuid REFERENCES dogs(id),
  dam_id uuid REFERENCES dogs(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Add `conformation_points` to entries:**
```sql
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS conformation_points integer
    CHECK (conformation_points IS NULL OR (conformation_points >= 0 AND conformation_points <= 5));
```

### 7.5 AKC Conformation Title Rules (Static Config)

```typescript
// src/config/akc-title-rules.ts

export const AKC_CONFORMATION_TITLES = {
  CH: {
    code: 'CH',
    name: 'Champion',
    organization: 'AKC',
    discipline: 'Conformation',
    pointsRequired: 15,
    majorsRequired: 2,
    majorThreshold: 3,  // 3+ points = a major
    prerequisite: null,
  },
  GCH: {
    code: 'GCH',
    name: 'Grand Champion',
    organization: 'AKC',
    discipline: 'Conformation',
    pointsRequired: 25,
    majorsRequired: 0,  // GCH has different requirements (3 majors with competition)
    majorThreshold: 3,
    prerequisite: 'CH',
  },
  'GCH-B': {
    code: 'GCH-B',
    name: 'Grand Champion Bronze',
    pointsRequired: 100,
    majorsRequired: 0,
    majorThreshold: 3,
    prerequisite: 'GCH',
  },
  'GCH-S': {
    code: 'GCH-S',
    name: 'Grand Champion Silver',
    pointsRequired: 200,
    prerequisite: 'GCH-B',
  },
  'GCH-G': {
    code: 'GCH-G',
    name: 'Grand Champion Gold',
    pointsRequired: 400,
    prerequisite: 'GCH-S',
  },
  'GCH-P': {
    code: 'GCH-P',
    name: 'Grand Champion Platinum',
    pointsRequired: 800,
    prerequisite: 'GCH-G',
  },
} as const;
```

**Assumption:** For the demo, the full AKC point schedule (which varies by breed, sex, geographic region, and year to determine how many points a win is worth) is NOT implemented. Points are manually entered per result by the secretary or exhibitor. The title rules engine only needs to sum entered points and count majors against requirements.

### 7.6 Key Design Decisions (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Post-Show Moment audience | Platform users only | No email consent issues, simplest to build, exhibitors must have an account to receive notifications |
| Points data entry | Manual entry per result | Secretary or exhibitor enters points awarded. No external AKC data dependency. Accurate for the user's own records. |
| Tuesday Screen multi-dog layout | Summary + drill-down | Summary banner gives at-a-glance momentum across all dogs. Expandable cards let exhibitors focus on one dog at a time. Scales from 1 to 5+ dogs. |
| Feature gate tier names | free / premium / pro (internal), Novice / Advanced / Excellent (UI) | Aligns with existing `exhibitor_profiles.subscription_tier` enum and Stripe product names |
| Judge history storage | Query-time aggregation (no separate table) | Data volume per dog is small (dozens of entries, not thousands). Computed join is fast enough. Avoids sync complexity. |
| Career stats storage | Computed on read | Same reasoning as judge history. Cache in `title_progress` table for the expensive calculation (point totals). |
| Competitive awareness data source | Platform users only | Rankings based on data within myK9Show. No external data. Transparent: "Rankings based on shows managed on myK9Show." |

---

## Appendix: Existing Infrastructure to Leverage

| What Exists | Where | How It's Used |
|-------------|-------|---------------|
| Dog details page with tab navigation | `DogDetailsTabs.tsx` | Add "Career" tab alongside existing Registrations, Competitions, etc. |
| Achievement types (rich interface) | `types/achievement.ts` | 20+ field interface — DB schema must match |
| Competition history types | `types/achievement.ts` | `Competition`, `PastResult`, `PerformanceStats` interfaces ready to use |
| Exhibitor dashboard (3 variants) | `pages/ExhibitorDashboard.tsx` (main) | Rewire to live data, add Tuesday Screen as home tab |
| Notification infrastructure | `types/notification-types.ts`, `notification_queue` table, FCM tokens | Add `career_update` template type, reuse delivery pipeline |
| Feature gate component | `FeatureGate.tsx`, `featureUtils.ts` | Fix tier flow, add career-specific feature types |
| Stripe products | `stripe-config.ts` | Two products ready: `advanced` (exhibitor), `excellent` (club) |
| `subscription_tier` column | `exhibitor_profiles` table (migration 009) | Already exists as `free | premium | pro` — just needs to be read and used |
| Scoring session workflow | `services/scoring/`, `services/competition/` | Show completion is the trigger point for Post-Show Moment |
| Realtime event bus | `services/realtime/RealtimeEventBus.ts` | Could be used for live career update delivery |
| PremiumGate component | `DogDetailsTabs.tsx` | Already wraps premium tabs — currently bypassed (`isPremium = !!user`), needs real gate |
