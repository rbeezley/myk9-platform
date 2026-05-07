# PRD: myK9 Platform

**Status:** Extracted from existing code + planned features
**Date:** 2026-01-14
**Source:** Monorepo codebase analysis + architecture documents
**Confidence:** High (existing), Medium (planned)

---

## 1. Problem Statement

> Dog show exhibitors, stewards, judges, and administrators need a unified platform to manage competitions, score entries, and track results—all while working in venues with unreliable internet connectivity.

**Current pain points:**
- Exhibitors must mail paper entries or use fragmented third-party systems
- No unified platform for entry submission, payment, and results
- Club secretaries manually process entries and payments
- Exhibitors lack visibility into title progress and competition analytics

*Inferred from: Offline-first architecture with IndexedDB + Supabase sync, PWA manifests, and replication package design.*

---

## 2. Current Solution

**What exists:** A monorepo containing two applications and six shared packages that together provide end-to-end dog show management and ringside scoring capabilities.

**How it works:**
1. **myK9Show** provides full show management (events, entries, scheduling, judging assignments)
2. **myK9Q** provides lightweight ringside scoring optimized for tablet use in the field
3. **Shared packages** provide common functionality (database, offline sync, UI, scoring logic)
4. **Supabase backend** provides authentication, storage, and real-time sync when online

**Current business model:** License-based (clubs purchase licenses, data isolated by `license_key`)

---

## 3. Target Users

### Primary Personas

| Role | Context | Key Needs |
|------|---------|-----------|
| **Exhibitor** | Registers dogs, enters shows, views results | Easy registration, real-time results, mobile access |
| **Steward** | Assists judge, manages ring flow, calls entries | Entry list management, status tracking, judge communication |
| **Judge** | Evaluates dogs, records scores/times | Fast score entry, timer controls, offline reliability |
| **Trial Secretary** | Manages entries, armbands, waitlists for assigned shows | Entry processing, armband assignment, move-up handling |
| **Club Admin** | Manages club profile, creates shows | Show creation, judge assignments, fee configuration |
| **Platform Admin** | System-wide access, revenue tracking | Analytics, club payouts, platform health |

### Skill Level
- **Exhibitors:** Consumer-level tech comfort (smartphone/tablet proficient)
- **Stewards/Judges:** Variable—some tech-savvy, many prefer simple interfaces
- **Trial Secretaries:** Moderate—comfortable with data entry and show management
- **Admins:** Power users comfortable with complex interfaces

---

## 4. Core Use Cases

### 4.1 Show Management (myK9Show)

**Start condition:** Admin creates a new show/event

**Steps:**
1. Admin creates show → System scaffolds event structure
2. Admin configures classes/divisions → System validates against rules
3. Exhibitors register entries → System assigns entry numbers
4. Admin schedules rings/judges → System checks for conflicts
5. Day of show: Stewards manage entry flow → Judges score via myK9Q
6. Results sync in real-time → Exhibitors see placements

**End condition:** Show completed with all results published

### 4.2 Ringside Scoring (myK9Q)

**Start condition:** Steward/Judge opens assigned ring

**Steps:**
1. User selects ring/class → System loads cached entry list
2. Steward calls entry into ring → Entry marked "in ring"
3. Judge evaluates and scores → Score saved locally
4. Timer tracked for timed events → Auto-stop at max time
5. Entry marked complete → Next entry called
6. When online → Scores sync to Supabase

**End condition:** All entries in class scored and synced

### 4.3 Online Entry Submission (Planned)

**Start condition:** Exhibitor browses published shows

**Steps:**
1. Exhibitor signs up/logs in → Creates profile and adds dogs
2. Exhibitor browses shows → Filters by date, location, sport
3. Exhibitor selects show → Views available classes with availability
4. Exhibitor adds entries to cart → System shows real-time spot availability
5. Exhibitor checks out → Stripe processes payment
6. Webhook confirms payment → Entries created in database
7. Exhibitor receives confirmation email → Entry details and armband info

**End condition:** Entries confirmed, exhibitor has receipt

### 4.4 Waitlist Management (Planned)

**Start condition:** Class reaches entry limit

**Steps:**
1. Exhibitor tries to enter full class → Offered waitlist option
2. Exhibitor joins waitlist → Position assigned (no payment yet)
3. Entry scratched → Trial secretary notified
4. Secretary promotes from waitlist → Top position offered spot
5. Exhibitor notified → 24-hour window to pay
6. Payment received → Entry confirmed
7. No payment → Offer expires, next person notified

**End condition:** Waitlist entry converted to confirmed entry or expired

---

## 5. Functional Requirements

### 5.1 Applications

| ID | Requirement | Source | Confidence |
|----|-------------|--------|------------|
| F1 | myK9Show provides full show management UI | apps/myk9show | High |
| F2 | myK9Q provides lightweight ringside scoring | apps/myk9q | High |
| F3 | Both apps support offline-first operation | @myk9/replication | High |
| F4 | Both apps are installable PWAs | manifest.json files | High |
| F5 | Both apps share visual consistency (teal brand, warm backgrounds) | index.css files | High |

### 5.2 Competition Types Supported

| ID | Competition | Sports | Source |
|----|-------------|--------|--------|
| F6 | AKC Scent Work | Container, Interior, Exterior, Buried, Handler Discrimination | scoring stores |
| F7 | Fast CAT | Timed 100-yard dash | competition configs |
| F8 | UKC Nosework | Similar to AKC Scent Work | competition types |
| F9 | UKC Obedience | Heeling, exercises, stays | scoring sheets |
| F10 | Rally | Numbered stations, timed | rally scoring |
| F11 | ASCA Scent | Australian Shepherd Club of America variant | ASCA configs |

### 5.3 Offline-First Architecture

| ID | Requirement | Source | Confidence |
|----|-------------|--------|------------|
| F12 | All data cached in IndexedDB | @myk9/replication | High |
| F13 | Optimistic UI updates (no loading states for local ops) | replicated tables | High |
| F14 | Background sync when connectivity restored | sync service | High |
| F15 | Conflict resolution favors most recent write | replication logic | Medium |
| F16 | Sync status indicator in UI | sync components | High |

### 5.4 Multi-Tenant Data Isolation

| ID | Requirement | Source | Status |
|----|-------------|--------|--------|
| F17 | Data scoped by license_key | RLS policies | Current |
| F18 | Users can only access their licensed data | 124 RLS policies | Current |
| F19 | Cross-license sharing not supported | schema constraints | Current |
| F20 | Ownership-based RLS (replaces license_key) | ONLINE-ENTRY-SYSTEM.md | Planned |
| F21 | Exhibitors see published shows across all clubs | Planned RLS | Planned |

> **Transition Note:** The platform is shifting from license-based isolation (`license_key`) to ownership-based isolation. Existing `license_key` columns remain for myK9Q compatibility, but new features use natural data hierarchy (Club → Show → Trial → Class → Entry). See [ONLINE-ENTRY-SYSTEM.md](./ONLINE-ENTRY-SYSTEM.md).

### 5.5 Online Entry System (Planned)

| ID | Requirement | Source | Confidence |
|----|-------------|--------|------------|
| F22 | Exhibitors can create accounts and manage profiles | ONLINE-ENTRY-SYSTEM.md | Medium |
| F23 | Exhibitors can browse published shows | ONLINE-ENTRY-SYSTEM.md | Medium |
| F24 | Exhibitors can add entries to cart and checkout | ONLINE-ENTRY-SYSTEM.md | Medium |
| F25 | Stripe processes payments with per-entry platform fee | ONLINE-ENTRY-SYSTEM.md | Medium |
| F26 | Waitlist system for full classes | ONLINE-ENTRY-SYSTEM.md | Medium |
| F27 | Email notifications for confirmations and waitlist | ONLINE-ENTRY-SYSTEM.md | Medium |
| F28 | Premium exhibitor subscriptions for advanced features | ONLINE-ENTRY-SYSTEM.md | Medium |

---

## 6. Business Rules

### 6.1 Scoring Rules

| Rule | Implementation | Notes |
|------|----------------|-------|
| Scent Work: Find = Pass, NF/FN = Fail | QualifyingResult enum | Binary pass/fail |
| Scent Work: Max time varies by level | Timer config per level | Novice: 2:00, Master: 3:00 |
| Fast CAT: Time determines points | Speed calculation formula | 100yd / time × handicap |
| Rally: Deductions from 100 | Point tracking | -1, -3, -10, NQ deductions |

### 6.2 Entry Management

| Rule | Implementation | Notes |
|------|----------------|-------|
| Entry numbers unique per show | Database constraint | Auto-assigned or manual |
| Entry can only be in one ring at a time | Status state machine | Pending → In Ring → Scored |
| Scratched entries excluded from results | Scratch flag | Preserves entry data |
| Entries editable until entry close (Planned) | entry_status check | Confirmed entries locked |
| Waitlist positions assigned sequentially (Planned) | add_to_waitlist() function | Advisory lock prevents races |

### 6.3 User Roles & Permissions

| Role | Can See | Can Edit | Source |
|------|---------|----------|--------|
| **Exhibitor** | Published shows, own entries, own dogs | Own profile, dogs, entries (before close) | Planned |
| **Steward** | Assigned ring entries | Entry status (in-ring, scratched) | Current |
| **Judge** | Assigned ring entries | Scores for assigned rings | Current |
| **Trial Secretary** | Assigned show entries | Entries, armbands, results, waitlist | Planned |
| **Club Admin** | All club shows | Club profile, shows, trials, classes | Planned |
| **Platform Admin** | Everything | Everything | Planned |

> **Note:** RBAC tables (`roles`, `user_roles`, `permissions`) and `RBACService` already exist in the codebase. See `supabase/migrations/005_myk9show_specific.sql`.

### 6.4 Payment Rules (Planned)

| Rule | Implementation | Notes |
|------|----------------|-------|
| Platform fee per entry | $1-2 per entry | Non-refundable |
| Entry fees set by club | Show configuration | Go to club |
| Refunds before entry close | Full entry fee, minus platform fee | Standard policy |
| Refunds after entry close | No refunds | Industry standard |
| Cart expiration | 30 minutes | Soft reservation only |

---

## 7. Data & State

### 7.1 Inputs

| Input | Type | Validation | Source |
|-------|------|------------|--------|
| Dog registration | Form data | Required fields, breed validation | Entry forms |
| Score entry | Numeric/enum | Range validation per competition | Score sheets |
| Timer | Timestamp | Max time enforcement | Timer hooks |
| User credentials | Email/password | Supabase Auth | Auth flows |
| Payment | Stripe Checkout | Webhook confirmation | Planned |

### 7.2 Key Data Entities

| Entity | Purpose | Key Fields | Status |
|--------|---------|------------|--------|
| shows | Event container | id, name, date, venue, license_key | Current |
| classes | Competition divisions | id, show_id, sport_type, level | Current |
| entries | Dog registrations | id, class_id, dog_id, entry_number, entry_status | Current |
| scores | Results | id, entry_id, result, time, faults | Current (merged into entries) |
| users | Authentication | id, email, role, license_key | Current |
| exhibitor_profiles | Exhibitor accounts | id, person_id, auth_user_id, subscription_tier | Planned |
| entry_carts | Shopping carts | id, exhibitor_id, show_id, status, expires_at | Planned |
| entry_cart_items | Cart line items | id, cart_id, dog_id, class_id, entry_fee_cents | Planned |
| waitlist_entries | Class waitlists | id, class_id, exhibitor_id, position, status | Planned |
| stripe_customers | Stripe integration | id, person_id, stripe_customer_id | Current |
| stripe_orders | Payment records | id, stripe_payment_intent_id, amount_cents, status | Current |
| stripe_subscriptions | Premium subscriptions | id, customer_id, stripe_subscription_id, status | Current |

### 7.3 State Management

| State | Storage | Update Pattern |
|-------|---------|----------------|
| Auth state | Supabase session | Reactive subscription |
| Show data | IndexedDB + Supabase | Replicated tables |
| Scoring session | Zustand store | Local-first, sync on save |
| UI preferences | localStorage | User settings store |
| Theme/accent color | CSS variables + localStorage | Applied to :root |
| Cart state (Planned) | Supabase + React state | Server-authoritative |

---

## 8. Error Handling

| Error Case | Current Handling | Adequate? |
|------------|------------------|-----------|
| Network offline | Queue operations, sync when online | Yes |
| Sync conflict | Last-write-wins with timestamp | Medium |
| Invalid score | Form validation prevents submit | Yes |
| Session timeout | Redirect to login, preserve local data | Yes |
| Database error | Toast notification, retry option | Yes |
| Payment failure (Planned) | Stripe webhook → notify exhibitor | TBD |
| Class full at checkout (Planned) | Offer waitlist position | TBD |
| Waitlist offer expired (Planned) | Notify next in line | TBD |

---

## 9. Technical Architecture

### 9.1 Monorepo Structure

```
myk9-platform/
├── apps/
│   ├── myk9show/     # Full show management (React + Vite)
│   └── myk9q/        # Ringside scoring (React + Vite)
├── packages/
│   ├── core/         # Utilities, types, constants
│   ├── replication/  # Offline-first sync (IndexedDB + Supabase)
│   ├── supabase/     # Client and generated types
│   ├── ui/           # Shared UI components
│   ├── scoring/      # Scoring logic and stores
│   └── scoring-ui/   # Shared scoring UI hooks
├── supabase/
│   ├── migrations/   # Database schema (001-006)
│   └── functions/    # Edge Functions (Planned: webhooks, email)
└── docs/
    ├── PRD.md                  # This document
    ├── ONLINE-ENTRY-SYSTEM.md  # Online entry architecture
    ├── MIGRATION-PLAN.md       # Monorepo migration status
    └── SCHEMA-ANALYSIS.md      # Database documentation
```

### 9.2 Key Technology Choices

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package manager | pnpm | Monorepo support, disk efficiency |
| Build orchestration | Turborepo | Caching, parallel builds |
| UI library (myK9Show) | Base UI via shadcn | Actively maintained |
| CSS framework | Tailwind CSS | Industry standard |
| Database | Supabase | Auth, storage, real-time, RLS |
| State management | Zustand | Lightweight, TypeScript-native |
| Offline storage | IndexedDB via Dexie | Reliable, performant |
| Payments (Planned) | Stripe Checkout + Connect | Industry standard, club payouts |
| Email (Planned) | Resend | Simple API, good deliverability |

### 9.3 Design System

| Token | Light | Dark |
|-------|-------|------|
| Background | #F8F7F4 (warm off-white) | #1a1a1e (warm charcoal) |
| Card | #FEFDFB (subtle cream) | #26292e |
| Primary | #14b8a6 (teal) | #14b8a6 |
| Accent options | Green, Blue, Orange, Purple | Same values |

---

## 10. Business Model

### 10.1 Current Model (License-Based)

```
Club purchases license → license_key isolates data → Club owns data
```

- Revenue: One-time or annual license fees
- Data: Isolated per license, no cross-club visibility
- Exhibitors: Enter via club's interface, no platform accounts

### 10.2 Planned Model (Platform)

```
Platform owns data → Clubs use platform → Per-entry fee → No license needed
```

- Revenue:
  - **Per-entry fee:** $1-2 per entry (platform keeps this)
  - **Premium subscriptions:** $5-10/month for exhibitors (title tracking, analytics)
  - **Entry fees:** Set by club, paid to club (minus platform fee)
- Data: Platform-wide, ownership-based access control
- Exhibitors: Self-service accounts, enter any show on platform

### 10.3 Premium Exhibitor Features (Planned)

| Feature | Description |
|---------|-------------|
| Title tracking | Progress toward next title, predicted completion dates |
| Competition analytics | Qualifying rates by element, venue, judge |
| Training journal | Link training sessions to competition outcomes |
| Health records | Vaccination records, vet visits (clubs often require proof) |
| Multi-dog dashboard | Unified view for handlers with multiple dogs |

---

## 11. Gaps & Recommendations

### 11.1 Missing or Unclear

| Gap | Recommendation | Priority |
|-----|----------------|----------|
| No end-to-end test coverage for critical paths | Add Playwright tests for show creation → scoring → results | High |
| Conflict resolution strategy undocumented | Document and potentially implement merge strategies | Medium |
| No data export/import for show portability | Add CSV/JSON export for show data | Low |
| No accessibility audit | Run WCAG compliance check | Medium |
| Stripe webhook handler not implemented | Implement Edge Function per ONLINE-ENTRY-SYSTEM.md | High (for Phase 2) |
| Email infrastructure not implemented | Integrate Resend per ONLINE-ENTRY-SYSTEM.md | High (for Phase 2) |

### 11.2 Potential Improvements

| Improvement | Rationale |
|-------------|-----------|
| Upgrade to shadcn Nova style when available | More compact UI for data-dense screens |
| Replace custom dialog components with standard shadcn | Better maintainability (28 files identified) |
| Add real-time collaboration indicators | Show who's scoring which ring |
| Implement push notifications | Alert exhibitors when their turn approaches |

### 11.3 Questions for Stakeholders

| Question | Why It Matters | Status |
|----------|----------------|--------|
| What's the sync conflict priority? | Current last-write-wins may lose data | Open |
| Should exhibitors see real-time ring progress? | Affects notification and live display features | Open |
| Is cross-license data sharing ever needed? | Transitioning to ownership-based model | Resolved: Yes, via platform |
| Refund policy details? | Before/after entry close behavior | Recommendation in ONLINE-ENTRY-SYSTEM.md |
| Waitlist offer window? | 24 hours online, 30 minutes day-of recommended | Recommendation in ONLINE-ENTRY-SYSTEM.md |

---

## 12. Implementation Roadmap

### Current State
- [x] Monorepo structure with shared packages
- [x] myK9Show: Show management UI
- [x] myK9Q: Ringside scoring
- [x] Offline-first architecture
- [x] RBAC tables and services
- [x] Stripe tables (customers, orders, subscriptions)

### Planned: Online Entry System

| Phase | Focus | Key Deliverables |
|-------|-------|------------------|
| **Phase 1** | Foundation | Exhibitor registration, show browsing, RLS updates |
| **Phase 2** | Entry Flow | Cart system, Stripe checkout, webhooks, email |
| **Phase 3** | Secretary Tools | Waitlist management, move-ups, armband assignment |
| **Phase 4** | Premium Features | Subscriptions, title tracking, analytics |
| **Phase 5** | Operations | Stripe Connect, revenue dashboard, admin tools |

See [ONLINE-ENTRY-SYSTEM.md](./ONLINE-ENTRY-SYSTEM.md) for detailed architecture and implementation plan.

---

## Appendix: Code References

### Key Files

| Purpose | File |
|---------|------|
| Monorepo config | [pnpm-workspace.yaml](../pnpm-workspace.yaml) |
| App entry (myK9Show) | [apps/myk9show/src/main.tsx](../apps/myk9show/src/main.tsx) |
| App entry (myK9Q) | [apps/myk9q/src/main.tsx](../apps/myk9q/src/main.tsx) |
| Replication logic | [packages/replication/src/](../packages/replication/src/) |
| Scoring stores | [packages/scoring/src/stores/](../packages/scoring/src/stores/) |
| Design tokens | [apps/myk9show/src/index.css](../apps/myk9show/src/index.css) |
| Database schema | [supabase/migrations/](../supabase/migrations/) |
| RBAC service | [apps/myk9show/src/services/rbac/](../apps/myk9show/src/services/rbac/) |
| Stripe client | [apps/myk9show/src/lib/stripe.ts](../apps/myk9show/src/lib/stripe.ts) |

### Package Exports

```typescript
// @myk9/core - Utilities and types
import { logger, formatDate, ValidationError } from '@myk9/core';

// @myk9/replication - Offline-first data
import { ReplicatedTable, replicatedClassesTable } from '@myk9/replication';

// @myk9/scoring - Scoring logic
import { useScoringStore, useTimerStore, QualifyingResult } from '@myk9/scoring';

// @myk9/scoring-ui - Scoring UI hooks
import { useStopwatch, useEntryListFilters } from '@myk9/scoring-ui';

// @myk9/ui - Shared components
import { Button, Card, Dialog } from '@myk9/ui';
```

---

## Changelog

| Date | Author | Change |
|------|--------|--------|
| 2026-01-13 | Claude (SK-Reverse-PRD) | Initial extraction from codebase |
| 2026-01-14 | Claude | Added Online Entry System plans, updated business model, roles, data entities |
