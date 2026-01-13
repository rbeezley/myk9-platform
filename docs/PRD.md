# PRD: myK9 Platform

**Status:** Extracted from existing code
**Date:** 2026-01-13
**Source:** Monorepo codebase analysis
**Confidence:** High

---

## 1. Problem Statement

> Dog show exhibitors, stewards, judges, and administrators need a unified platform to manage competitions, score entries, and track results—all while working in venues with unreliable internet connectivity.

*Inferred from: Offline-first architecture with IndexedDB + Supabase sync, PWA manifests, and replication package design.*

---

## 2. Current Solution

**What exists:** A monorepo containing two applications and six shared packages that together provide end-to-end dog show management and ringside scoring capabilities.

**How it works:**
1. **myK9Show** provides full show management (events, entries, scheduling, judging assignments)
2. **myK9Q** provides lightweight ringside scoring optimized for tablet use in the field
3. **Shared packages** provide common functionality (database, offline sync, UI, scoring logic)
4. **Supabase backend** provides authentication, storage, and real-time sync when online

---

## 3. Target Users

### Primary Personas

| Role | Context | Key Needs |
|------|---------|-----------|
| **Exhibitor** | Registers dogs, enters shows, views results | Easy registration, real-time results, mobile access |
| **Steward** | Assists judge, manages ring flow, calls entries | Entry list management, status tracking, judge communication |
| **Judge** | Evaluates dogs, records scores/times | Fast score entry, timer controls, offline reliability |
| **Admin** | Manages shows, assigns judges, generates reports | Full show oversight, scheduling tools, data export |

### Skill Level
- **Exhibitors:** Consumer-level tech comfort (smartphone/tablet proficient)
- **Stewards/Judges:** Variable—some tech-savvy, many prefer simple interfaces
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

| ID | Requirement | Source | Confidence |
|----|-------------|--------|------------|
| F17 | Data scoped by license_key | RLS policies | High |
| F18 | Users can only access their licensed data | 124 RLS policies | High |
| F19 | Cross-license sharing not supported | schema constraints | High |

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

### 6.3 User Roles & Permissions

| Rule | Implementation | Notes |
|------|----------------|-------|
| Judges can only score assigned rings | Ring assignments table | Enforced at query level |
| Stewards can manage entries but not score | Role-based UI | Different views per role |
| Admins have full access within license | License-scoped RLS | Cannot see other licenses |

---

## 7. Data & State

### 7.1 Inputs

| Input | Type | Validation | Source |
|-------|------|------------|--------|
| Dog registration | Form data | Required fields, breed validation | Entry forms |
| Score entry | Numeric/enum | Range validation per competition | Score sheets |
| Timer | Timestamp | Max time enforcement | Timer hooks |
| User credentials | Email/password | Supabase Auth | Auth flows |

### 7.2 Key Data Entities

| Entity | Purpose | Key Fields |
|--------|---------|------------|
| shows | Event container | id, name, date, venue, license_key |
| classes | Competition divisions | id, show_id, sport_type, level |
| entries | Dog registrations | id, class_id, dog_id, entry_number |
| scores | Results | id, entry_id, result, time, faults |
| users | Authentication | id, email, role, license_key |

### 7.3 State Management

| State | Storage | Update Pattern |
|-------|---------|----------------|
| Auth state | Supabase session | Reactive subscription |
| Show data | IndexedDB + Supabase | Replicated tables |
| Scoring session | Zustand store | Local-first, sync on save |
| UI preferences | localStorage | User settings store |
| Theme/accent color | CSS variables + localStorage | Applied to :root |

---

## 8. Error Handling

| Error Case | Current Handling | Adequate? |
|------------|------------------|-----------|
| Network offline | Queue operations, sync when online | Yes |
| Sync conflict | Last-write-wins with timestamp | Medium |
| Invalid score | Form validation prevents submit | Yes |
| Session timeout | Redirect to login, preserve local data | Yes |
| Database error | Toast notification, retry option | Yes |

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
└── supabase/
    └── migrations/   # Database schema
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

### 9.3 Design System

| Token | Light | Dark |
|-------|-------|------|
| Background | #F8F7F4 (warm off-white) | #1a1a1e (warm charcoal) |
| Card | #FEFDFB (subtle cream) | #26292e |
| Primary | #14b8a6 (teal) | #14b8a6 |
| Accent options | Green, Blue, Orange, Purple | Same values |

---

## 10. Gaps & Recommendations

### 10.1 Missing or Unclear

| Gap | Recommendation |
|-----|----------------|
| No end-to-end test coverage for critical paths | Add Playwright tests for show creation → scoring → results |
| Conflict resolution strategy undocumented | Document and potentially implement merge strategies |
| No data export/import for show portability | Add CSV/JSON export for show data |
| No accessibility audit | Run WCAG compliance check |

### 10.2 Potential Improvements

| Improvement | Rationale |
|-------------|-----------|
| Upgrade to shadcn Nova style when available | More compact UI for data-dense screens |
| Replace custom dialog components with standard shadcn | Better maintainability (28 files identified) |
| Add real-time collaboration indicators | Show who's scoring which ring |
| Implement push notifications | Alert exhibitors when their turn approaches |

### 10.3 Questions for Stakeholders

| Question | Why It Matters |
|----------|----------------|
| What's the sync conflict priority? | Current last-write-wins may lose data |
| Should exhibitors see real-time ring progress? | Affects notification and live display features |
| Is cross-license data sharing ever needed? | Current RLS prevents all cross-license access |

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
