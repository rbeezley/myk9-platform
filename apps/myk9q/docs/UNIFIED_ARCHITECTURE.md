# myK9 Unified Platform Architecture

> **Document Version**: 1.1
> **Created**: November 2025
> **Updated**: November 2025
> **Status**: Planning Phase

---

## Executive Summary

This document describes the architecture for consolidating two dog show management applications into a unified platform:

| Application | Primary Users | Key Capabilities |
|-------------|---------------|------------------|
| **myK9Q** | Judges, Stewards | Lightweight scoring, offline-first, real-time results |
| **myK9Show** | Exhibitors, Secretaries, Admins | Show management, entries, payments, exhibitor tools |

**Goal**: One unified database, **one codebase with build variants**, producing both a full-featured app and a lightweight "lite" scoring app for judges.

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Code merge direction** | myK9Q features → myK9Show | myK9Show has richer foundation (auth, RBAC, payments, exhibitor data) |
| **Code sharing approach** | Build variants (not shared library) | Simpler maintenance, single source of truth |
| **Database target** | myK9Show-Working | Has Supabase Auth, RBAC, Stripe integration |
| **ID strategy** | Mixed (UUID + bigint) | Minimize migration effort |
| **Entry/Result design** | Merged (myK9Q approach) | More efficient for scoring operations |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Database Architecture](#2-database-architecture)
3. [Application Architecture](#3-application-architecture)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Offline-First Architecture](#5-offline-first-architecture)
6. [Shared Component Library](#6-shared-component-library)
7. [Deployment Strategy](#7-deployment-strategy)
8. [Migration Plan](#8-migration-plan)
9. [Technical Decisions](#9-technical-decisions)
10. [Appendices](#appendices)

---

## 1. System Overview

### 1.1 Platform Vision

```
┌─────────────────────────────────────────────────────────────────────┐
│                        myK9 Platform                                 │
│                    (Build Variants Architecture)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                    ┌─────────────────────────────┐                  │
│                    │      ONE CODEBASE           │                  │
│                    │    (myK9Show repo)          │                  │
│                    │                             │                  │
│                    │  src/                       │                  │
│                    │  ├── features/              │                  │
│                    │  │   ├── scoring/    [ALL]  │                  │
│                    │  │   ├── offline/    [ALL]  │                  │
│                    │  │   ├── entries/    [FULL] │                  │
│                    │  │   ├── payments/   [FULL] │                  │
│                    │  │   ├── health/     [FULL] │                  │
│                    │  │   └── titles/     [FULL] │                  │
│                    │  └── ...                    │                  │
│                    └──────────────┬──────────────┘                  │
│                                   │                                  │
│                    ┌──────────────┴──────────────┐                  │
│                    │                             │                  │
│           ┌────────▼────────┐         ┌─────────▼─────────┐        │
│           │  npm run        │         │  npm run          │        │
│           │  build:lite     │         │  build:full       │        │
│           └────────┬────────┘         └─────────┬─────────┘        │
│                    │                            │                   │
│           ┌────────▼────────┐         ┌─────────▼─────────┐        │
│           │  myK9Q Lite     │         │   myK9Show Full   │        │
│           │  (~800 KB)      │         │   (~2.5 MB)       │        │
│           │                 │         │                   │        │
│           │  • Scoring      │         │  • All Features   │        │
│           │  • Offline      │         │  • Entries        │        │
│           │  • Voice/TV     │         │  • Payments       │        │
│           │  • License Key  │         │  • Health/Titles  │        │
│           │                 │         │  • Full Auth      │        │
│           │  scoring.myk9.com         │  app.myk9.com     │        │
│           └────────┬────────┘         └─────────┬─────────┘        │
│                    │                            │                   │
│                    └──────────────┬─────────────┘                   │
│                                   │                                  │
│                    ┌──────────────▼──────────────┐                  │
│                    │   Supabase (Unified DB)     │                  │
│                    │   myK9Show-Working          │                  │
│                    │                             │                  │
│                    │  • PostgreSQL 15            │                  │
│                    │  • Supabase Auth            │                  │
│                    │  • Real-time Subscriptions  │                  │
│                    │  • Edge Functions           │                  │
│                    │  • Storage (images/docs)    │                  │
│                    └─────────────────────────────┘                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 User Personas & Access Patterns

| Persona | App | Auth Method | Primary Actions | Offline Need |
|---------|-----|-------------|-----------------|--------------|
| **Judge** | myK9Q Lite | License Key | Score entries, manage run order | **Critical** |
| **Steward** | myK9Q Lite | License Key | Call dogs, update status | **Critical** |
| **Exhibitor** | myK9Show | Supabase Auth | Enter shows, track titles, view results | Medium |
| **Secretary** | myK9Show | Supabase Auth | Manage shows, entries, payments | Medium |
| **Admin** | myK9Show | Supabase Auth | System configuration, user management | Low |

### 1.3 Key Design Principles

1. **Offline-First for Scoring**: Judges must be able to score even without internet
2. **Real-Time for Results**: Exhibitors see results as they're posted
3. **Single Source of Truth**: One database for all data
4. **Shared Code**: Common logic in shared library, not duplicated
5. **Independent Deployments**: Apps can be deployed/updated independently
6. **Progressive Enhancement**: Full features when online, core features offline

---

## 2. Database Architecture

### 2.1 Unified Database: myK9Show-Working

**Project**: `eergfbehjghvfqvzkhsu`
**Region**: us-east-2
**PostgreSQL**: 15.x

### 2.2 Schema Design

#### 2.2.1 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CORE ENTITIES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐      ┌─────────────────────┐│
│  │  club   │──1:N─│  show   │──1:N─│  trial  │──1:N─│       class         ││
│  │  (UUID) │      │  (UUID) │      │  (UUID) │      │       (UUID)        ││
│  └─────────┘      │         │      └─────────┘      │                     ││
│                   │license_ │                       │ + element, level    ││
│                   │key (str)│                       │ + time_limit_*      ││
│                   └─────────┘                       │ + area_count        ││
│                                                     │ + scoring fields    ││
│                                                     └──────────┬──────────┘│
│                                                                │            │
│  ┌─────────┐                                                   │            │
│  │   dog   │                                          ┌────────▼────────┐  │
│  │  (UUID) │──────────────────────────────────────────│     entry       │  │
│  │         │                                          │     (UUID)      │  │
│  │ +owner  │                                          │                 │  │
│  │ +health │                                          │ + scoring cols  │  │
│  │ +titles │                                          │ + result_status │  │
│  └─────────┘                                          │ + placements    │  │
│                                                       │ + times/faults  │  │
│  ┌─────────┐                                          │                 │  │
│  │  user   │──────────────────────────────────────────│ + handler_id    │  │
│  │  (UUID) │                                          └─────────────────┘  │
│  │         │                                                               │
│  │ +roles  │                                                               │
│  │ +profile│                                                               │
│  └─────────┘                                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          SUPPORTING ENTITIES                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EXHIBITOR FEATURES          SCORING FEATURES           SYSTEM              │
│  ─────────────────           ────────────────           ──────              │
│  • health_record             • class_requirements       • role              │
│  • vaccination               • result_visibility_*      • permission        │
│  • medication                • nationals_*              • user_role         │
│  • allergy                   • judge_profiles           • notification_*    │
│  • vet_visit                 • tv_messages              • sync_queue        │
│  • achievement               • announcements            • sync_conflict     │
│  • competition               • push_subscriptions       • stripe_*          │
│  • dog_registration          • rules/rulebooks          • *_template        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 2.2.2 Table Ownership

| Domain | Tables | Origin | ID Type |
|--------|--------|--------|---------|
| **Core** | `show`, `trial`, `class`, `entry` | Merged | UUID |
| **Users** | `user`, `role`, `permission`, `user_role` | myK9Show | UUID |
| **Dogs** | `dog`, `dog_registration`, `health_*`, `achievement` | myK9Show | UUID |
| **Scoring** | `class_requirements`, `*_result_visibility_*`, `nationals_*` | myK9Q | bigint |
| **Notifications** | `announcements`, `push_subscriptions`, `notification_*` | Both | Mixed |
| **Rules** | `rules`, `rulebooks`, `rule_organizations`, `rule_sports` | myK9Q | UUID |
| **Payments** | `stripe_*` | myK9Show | bigint |
| **Sync** | `sync_queue`, `sync_conflict`, `offline_scoring` | myK9Show | UUID |

#### 2.2.3 Key Schema Decisions

**1. Merged Entry + Result Design**

The `entry` table contains both entry information AND scoring results in a single row. This is more efficient for scoring operations (1 write instead of 2).

```sql
-- entry table includes scoring columns:
entry (
  -- Entry fields
  id UUID PRIMARY KEY,
  dog_id UUID REFERENCES dog(id),
  class_id UUID REFERENCES class(id),
  handler_id UUID REFERENCES user(id),
  armband_number INTEGER,
  entry_status TEXT,  -- 'checked-in', 'at-gate', 'in-ring', 'completed'

  -- Scoring fields (formerly in separate 'result' table)
  result_status TEXT,  -- 'pending', 'qualified', 'nq', 'absent', 'excused'
  search_time_seconds NUMERIC,
  area1_time_seconds NUMERIC,
  area2_time_seconds NUMERIC,
  total_correct_finds INTEGER,
  total_incorrect_finds INTEGER,
  total_faults INTEGER,
  final_placement INTEGER,
  points_earned INTEGER,
  judge_notes TEXT,
  scoring_completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  license_key VARCHAR  -- For RLS filtering
)
```

**2. License Key Multi-Tenancy**

The `license_key` column enables:
- Row-Level Security (RLS) filtering
- Quick passcode-based access for judges
- Data isolation between shows

```sql
-- Example RLS policy
CREATE POLICY "Users can view entries for their show"
ON entry FOR SELECT
USING (license_key = current_setting('app.license_key', true));
```

**3. Dual ID Strategy**

- **UUID**: For tables shared with myK9Show (user, dog, show, trial, class, entry)
- **bigint**: For myK9Q-specific scoring tables (class_requirements, nationals_*)

This minimizes migration effort while maintaining referential integrity.

### 2.3 Database Views

Views provide compatibility layers between the two apps:

```sql
-- Compatibility view for myK9Q (uses plural table names)
CREATE VIEW shows AS SELECT * FROM show;
CREATE VIEW trials AS SELECT * FROM trial;
CREATE VIEW classes AS SELECT * FROM class;
CREATE VIEW entries AS SELECT * FROM entry;
```

---

## 3. Application Architecture

### 3.1 myK9Q (Scoring App)

**Purpose**: Lightweight, offline-first scoring for judges at ringside

**Tech Stack**:
- React 19.2.0
- Zustand (state management)
- Tailwind CSS
- Custom IndexedDB replication
- Service Workers (PWA)
- Vite

**Key Features**:
- Offline scoring with sync
- Real-time run order updates
- Push notifications
- Voice announcements
- TV display mode
- Multiple scoresheet types (AKC, UKC, ASCA)

**Architecture**:
```
src/
├── pages/              # Route-based pages
├── components/         # UI components
├── services/
│   ├── replication/    # Offline sync engine
│   └── scoring/        # Scoring logic
├── stores/             # Zustand stores
├── hooks/              # Custom React hooks
├── utils/              # Utilities
└── types/              # TypeScript types
```

### 3.2 myK9Show (Full Platform)

**Purpose**: Complete show management for exhibitors, secretaries, and admins

**Tech Stack**:
- React 18.3.1
- Zustand (state management)
- Tailwind CSS + Radix UI
- Dexie (IndexedDB)
- TanStack React Query
- Vite

**Key Features**:
- Show creation and management
- Online entry system
- Payment processing (Stripe)
- Dog management (health, titles, training)
- Judge assignments
- RBAC permissions
- Offline support

**Architecture**:
```
src/
├── pages/              # Role-based pages
├── components/         # 42 component categories
├── services/
│   ├── database/       # Dexie + Supabase
│   ├── sync/           # Offline sync
│   └── rbac/           # Permissions
├── store/              # 30+ Zustand stores
├── hooks/              # 40+ custom hooks
├── providers/          # React context providers
└── types/              # 40+ type files
```

### 3.3 Feature Matrix

| Feature | myK9Q Lite | myK9Show Full |
|---------|------------|---------------|
| **Scoring** | ✅ Full | ✅ Full |
| **Offline Mode** | ✅ Critical | ✅ Supported |
| **Entry Management** | View only | ✅ Full CRUD |
| **Dog Profiles** | View only | ✅ Full CRUD |
| **Health Records** | ❌ | ✅ Full |
| **Title Tracking** | ❌ | ✅ Full |
| **Training Journal** | ❌ | ✅ Full |
| **Show Creation** | ❌ | ✅ Full |
| **Payment Processing** | ❌ | ✅ Stripe |
| **User Management** | ❌ | ✅ RBAC |
| **Push Notifications** | ✅ Web Push | ✅ FCM |
| **Voice Announcements** | ✅ | ❌ |
| **TV Display** | ✅ | ❌ |

---

## 4. Authentication & Authorization

### 4.1 Dual Auth System

The platform supports two authentication methods that coexist:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Authentication Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐                    ┌─────────────────────────┐ │
│  │  myK9Q      │                    │      myK9Show           │ │
│  │  (Judges)   │                    │   (Exhibitors/Staff)    │ │
│  └──────┬──────┘                    └───────────┬─────────────┘ │
│         │                                       │               │
│         ▼                                       ▼               │
│  ┌─────────────┐                    ┌─────────────────────────┐ │
│  │ License Key │                    │    Supabase Auth        │ │
│  │  Passcode   │                    │   (Email/Password)      │ │
│  │             │                    │                         │ │
│  │ "aa260"     │                    │ user@example.com        │ │
│  └──────┬──────┘                    └───────────┬─────────────┘ │
│         │                                       │               │
│         │         ┌─────────────┐               │               │
│         └────────►│  Unified    │◄──────────────┘               │
│                   │  Database   │                               │
│                   │             │                               │
│                   │ RLS Filter: │                               │
│                   │ license_key │                               │
│                   │     OR      │                               │
│                   │ auth.uid()  │                               │
│                   └─────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 License Key Authentication (myK9Q)

**How it works**:
1. User enters show's license key (e.g., "aa260")
2. App validates key exists in `show` table
3. Key stored in localStorage for session
4. All queries filtered by `license_key`

**Use cases**:
- Quick access for judges at ringside
- No account creation needed
- Shared access for show staff

**Security considerations**:
- Keys should be complex enough to prevent guessing
- Keys can be rotated per show
- RLS ensures data isolation

### 4.3 Supabase Auth (myK9Show)

**How it works**:
1. User creates account with email/password
2. Supabase manages JWT tokens
3. User assigned roles via `user_role` table
4. Permissions checked via RBAC system

**Roles**:
| Role | Description | Permissions |
|------|-------------|-------------|
| `exhibitor` | Dog owners | Enter shows, manage dogs, view results |
| `judge` | Competition judges | Score classes, view schedules |
| `secretary` | Show staff | Manage entries, run orders, payments |
| `admin` | System admin | Full access |
| `steward` | Ring steward | Call dogs, update status |

### 4.4 RLS Policies

```sql
-- License key based (myK9Q style)
CREATE POLICY "license_key_access" ON entry
FOR ALL USING (
  license_key = current_setting('app.license_key', true)
);

-- Auth based (myK9Show style)
CREATE POLICY "owner_access" ON dog
FOR ALL USING (
  owner_id = auth.uid()
);

-- Combined (unified)
CREATE POLICY "unified_access" ON entry
FOR SELECT USING (
  license_key = current_setting('app.license_key', true)
  OR handler_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_role ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_id IN (SELECT id FROM role WHERE name IN ('admin', 'secretary'))
  )
);
```

---

## 5. Offline-First Architecture

### 5.1 Overview

Both apps support offline operation, but with different implementations:

| Aspect | myK9Q | myK9Show |
|--------|-------|----------|
| **Storage** | Custom IndexedDB | Dexie (IndexedDB wrapper) |
| **Sync Strategy** | Custom ReplicationManager | DifferentialSyncService |
| **Conflict Resolution** | Last-write-wins | Multi-strategy |
| **Service Worker** | Active (Workbox) | Ready but disabled |

### 5.2 myK9Q Replication Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 myK9Q Offline Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    React Application                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         ││
│  │  │   Stores    │  │    Hooks    │  │  Components │         ││
│  │  │  (Zustand)  │  │             │  │             │         ││
│  │  └──────┬──────┘  └──────┬──────┘  └─────────────┘         ││
│  │         │                │                                   ││
│  │         └────────────────┼───────────────────────────────┐  ││
│  │                          ▼                               │  ││
│  │              ┌───────────────────────┐                   │  ││
│  │              │  ReplicationManager   │                   │  ││
│  │              │                       │                   │  ││
│  │              │  • 16 replicated tables│                  │  ││
│  │              │  • 5-min sync interval │                  │  ││
│  │              │  • Conflict resolution │                  │  ││
│  │              └───────────┬───────────┘                   │  ││
│  │                          │                               │  ││
│  │         ┌────────────────┼────────────────┐              │  ││
│  │         ▼                ▼                ▼              │  ││
│  │  ┌───────────┐    ┌───────────┐    ┌───────────┐        ││
│  │  │ IndexedDB │    │  Supabase │    │  Service  │        ││
│  │  │  (Local)  │◄──►│  (Remote) │    │  Worker   │        ││
│  │  └───────────┘    └───────────┘    └───────────┘        ││
│  │                                                          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Replicated Tables** (16 total):
- `entries`, `classes`, `trials`, `shows`
- `class_requirements`
- `show_result_visibility_defaults`
- `trial_result_visibility_overrides`
- `class_result_visibility_overrides`
- `announcements`, `announcement_reads`
- `push_notification_config`, `push_subscriptions`
- `event_statistics`, `nationals_rankings`
- `view_stats_summary`, `view_audit_log`

**Sync Configuration**:
```typescript
// Priority and TTL by table
const tableConfig = {
  entries: { priority: 'critical', ttl: 12 * 60 * 60 * 1000 },  // 12 hours
  classes: { priority: 'critical', ttl: 12 * 60 * 60 * 1000 },
  trials: { priority: 'critical', ttl: 12 * 60 * 60 * 1000 },
  shows: { priority: 'critical', ttl: 12 * 60 * 60 * 1000 },
  announcements: { priority: 'high', ttl: 24 * 60 * 60 * 1000 },
  // ...
};
```

### 5.3 Conflict Resolution

**Strategy**: Last-Write-Wins with server authority

```typescript
// ConflictResolver.ts
resolveConflict(local: Record, server: Record): Record {
  // Server always wins if timestamps are equal or server is newer
  if (server.updated_at >= local.updated_at) {
    return server;
  }
  // Local wins only if definitely newer
  return local;
}
```

**Corruption Recovery**:
- Automatic detection of IndexedDB corruption
- Auto-reset with re-sync from server
- Temporary disable of replication during recovery

### 5.4 Service Worker Strategy

**Caching Strategies**:
| Resource Type | Strategy | TTL |
|---------------|----------|-----|
| Supabase API | NetworkFirst | 1 hour |
| Static Assets | CacheFirst | 7 days |
| Navigation | CacheFirst | 24 hours |

**Push Notification Handling**:
- Service worker receives push events
- Displays notification with action buttons
- Handles click actions (navigate to entry, dismiss, etc.)

---

## 6. Build Variants Architecture

### 6.1 Overview

Instead of maintaining separate codebases or a shared npm package, we use **build variants** - one codebase that produces different outputs based on build-time configuration.

```
┌─────────────────────────────────────────────────────────────────┐
│                    BUILD VARIANTS                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ONE CODEBASE (myK9Show repo)                                   │
│       │                                                          │
│       ├── npm run build:lite   ──►  myK9Q Lite (~800 KB)        │
│       │                              • Scoring only              │
│       │                              • Offline-first             │
│       │                              • License key auth          │
│       │                                                          │
│       └── npm run build:full   ──►  myK9Show Full (~2.5 MB)     │
│                                      • All features              │
│                                      • Full auth + RBAC          │
│                                      • Payments, health, titles  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 Feature Flags

Features are controlled via environment variables at build time:

**`.env.lite`** (for myK9Q Lite build):
```bash
VITE_APP_MODE=lite
VITE_APP_NAME=myK9Q
VITE_FEATURE_SCORING=true
VITE_FEATURE_OFFLINE=true
VITE_FEATURE_VOICE=true
VITE_FEATURE_TV_DISPLAY=true
VITE_FEATURE_LICENSE_KEY_AUTH=true

VITE_FEATURE_SUPABASE_AUTH=false
VITE_FEATURE_ENTRIES=false
VITE_FEATURE_PAYMENTS=false
VITE_FEATURE_HEALTH=false
VITE_FEATURE_TITLES=false
VITE_FEATURE_TRAINING=false
VITE_FEATURE_SHOW_CREATION=false
VITE_FEATURE_RBAC=false
```

**`.env.full`** (for myK9Show Full build):
```bash
VITE_APP_MODE=full
VITE_APP_NAME=myK9Show
VITE_FEATURE_SCORING=true
VITE_FEATURE_OFFLINE=true
VITE_FEATURE_VOICE=false
VITE_FEATURE_TV_DISPLAY=false
VITE_FEATURE_LICENSE_KEY_AUTH=true

VITE_FEATURE_SUPABASE_AUTH=true
VITE_FEATURE_ENTRIES=true
VITE_FEATURE_PAYMENTS=true
VITE_FEATURE_HEALTH=true
VITE_FEATURE_TITLES=true
VITE_FEATURE_TRAINING=true
VITE_FEATURE_SHOW_CREATION=true
VITE_FEATURE_RBAC=true
```

### 6.3 Folder Structure

Organize code by feature to enable clean tree-shaking:

```
src/
├── features/
│   │
│   │  # CORE - Included in ALL builds
│   ├── scoring/
│   │   ├── components/
│   │   │   ├── Scoresheet.tsx
│   │   │   ├── TimerDisplay.tsx
│   │   │   ├── FindsCounter.tsx
│   │   │   └── PlacementDisplay.tsx
│   │   ├── services/
│   │   │   ├── scoringEngine.ts
│   │   │   └── placementCalculator.ts
│   │   ├── stores/
│   │   │   └── scoringStore.ts
│   │   └── index.ts
│   │
│   ├── offline/
│   │   ├── services/
│   │   │   ├── ReplicationManager.ts
│   │   │   ├── SyncEngine.ts
│   │   │   └── ConflictResolver.ts
│   │   ├── stores/
│   │   │   └── offlineQueueStore.ts
│   │   └── index.ts
│   │
│   ├── classes/
│   │   ├── components/
│   │   ├── services/
│   │   └── index.ts
│   │
│   │  # LITE ONLY
│   ├── voice/
│   │   ├── services/
│   │   │   └── voiceAnnouncementService.ts
│   │   └── index.ts
│   │
│   ├── tv-display/
│   │   ├── pages/
│   │   │   └── TVRunOrder.tsx
│   │   └── index.ts
│   │
│   │  # FULL ONLY
│   ├── entries/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── index.ts
│   │
│   ├── payments/
│   │   ├── components/
│   │   ├── services/
│   │   │   └── stripeService.ts
│   │   └── index.ts
│   │
│   ├── health/
│   │   ├── components/
│   │   ├── services/
│   │   └── index.ts
│   │
│   ├── titles/
│   │   ├── components/
│   │   ├── services/
│   │   └── index.ts
│   │
│   ├── training/
│   │   ├── components/
│   │   └── index.ts
│   │
│   └── show-management/
│       ├── components/
│       ├── pages/
│       └── index.ts
│
├── shared/                    # Truly shared (both builds)
│   ├── components/
│   │   └── ui/               # Design system components
│   ├── hooks/
│   ├── utils/
│   └── types/
│
├── App.tsx                   # Conditional route loading
├── routes/
│   ├── liteRoutes.tsx        # Routes for lite build
│   ├── fullRoutes.tsx        # Routes for full build
│   └── index.tsx             # Conditional export
│
└── main.tsx
```

### 6.4 Conditional Loading Pattern

**App.tsx**:
```tsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

// Core routes - always loaded
const ClassList = lazy(() => import('./features/classes/pages/ClassList'));
const Scoresheet = lazy(() => import('./features/scoring/pages/Scoresheet'));
const RunOrder = lazy(() => import('./features/classes/pages/RunOrder'));

// Lite-only routes
const TVDisplay = import.meta.env.VITE_FEATURE_TV_DISPLAY === 'true'
  ? lazy(() => import('./features/tv-display/pages/TVRunOrder'))
  : null;

// Full-only routes
const EntryManagement = import.meta.env.VITE_FEATURE_ENTRIES === 'true'
  ? lazy(() => import('./features/entries/pages/EntryManagement'))
  : null;

const HealthRecords = import.meta.env.VITE_FEATURE_HEALTH === 'true'
  ? lazy(() => import('./features/health/pages/HealthRecords'))
  : null;

const Checkout = import.meta.env.VITE_FEATURE_PAYMENTS === 'true'
  ? lazy(() => import('./features/payments/pages/Checkout'))
  : null;

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Core routes - both builds */}
        <Route path="/classes" element={<ClassList />} />
        <Route path="/scoring/:id" element={<Scoresheet />} />
        <Route path="/run-order/:classId" element={<RunOrder />} />

        {/* Lite-only routes */}
        {TVDisplay && <Route path="/tv" element={<TVDisplay />} />}

        {/* Full-only routes */}
        {EntryManagement && <Route path="/entries" element={<EntryManagement />} />}
        {HealthRecords && <Route path="/dogs/:id/health" element={<HealthRecords />} />}
        {Checkout && <Route path="/checkout" element={<Checkout />} />}
      </Routes>
    </Suspense>
  );
}
```

### 6.5 Build Scripts

**package.json**:
```json
{
  "scripts": {
    "dev": "vite --mode full",
    "dev:lite": "vite --mode lite",
    "dev:full": "vite --mode full",

    "build": "npm run build:full",
    "build:lite": "vite build --mode lite",
    "build:full": "vite build --mode full",

    "preview:lite": "vite preview --mode lite",
    "preview:full": "vite preview --mode full",

    "typecheck": "tsc --noEmit",
    "typecheck:lite": "tsc --noEmit --project tsconfig.lite.json",
    "typecheck:full": "tsc --noEmit --project tsconfig.full.json"
  }
}
```

### 6.6 Vite Configuration

**vite.config.ts**:
```typescript
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isLite = mode === 'lite';

  return {
    plugins: [react()],

    define: {
      // Make feature flags available at build time
      'import.meta.env.VITE_APP_MODE': JSON.stringify(env.VITE_APP_MODE),
    },

    build: {
      rollupOptions: {
        output: {
          // Different output directories per build
          dir: isLite ? 'dist/lite' : 'dist/full',

          manualChunks: (id) => {
            // Vendor chunking
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'react-vendor';
              if (id.includes('supabase')) return 'supabase-vendor';
              if (id.includes('zustand')) return 'state-vendor';
              if (id.includes('radix')) return 'ui-vendor';
              return 'vendor';
            }

            // Feature chunking
            if (id.includes('/features/scoring/')) return 'scoring';
            if (id.includes('/features/offline/')) return 'offline';
            if (id.includes('/features/entries/')) return 'entries';
            if (id.includes('/features/payments/')) return 'payments';
            if (id.includes('/features/health/')) return 'health';
          },
        },
      },

      // Smaller chunk warning for lite build
      chunkSizeWarningLimit: isLite ? 300 : 500,
    },
  };
});
```

### 6.7 Feature Matrix

| Feature | Lite Build | Full Build | Implementation |
|---------|:----------:|:----------:|----------------|
| **Scoring/Scoresheets** | ✅ | ✅ | `features/scoring/` |
| **Offline/Replication** | ✅ | ✅ | `features/offline/` |
| **Class Management** | ✅ | ✅ | `features/classes/` |
| **Run Order** | ✅ | ✅ | `features/classes/` |
| **Push Notifications** | ✅ | ✅ | `features/notifications/` |
| **Voice Announcements** | ✅ | ❌ | `features/voice/` |
| **TV Display** | ✅ | ❌ | `features/tv-display/` |
| **License Key Auth** | ✅ | ✅ | `features/auth/license/` |
| **Supabase Auth** | ❌ | ✅ | `features/auth/supabase/` |
| **Entry Management** | ❌ | ✅ | `features/entries/` |
| **Payment Processing** | ❌ | ✅ | `features/payments/` |
| **Dog Health Records** | ❌ | ✅ | `features/health/` |
| **Title Tracking** | ❌ | ✅ | `features/titles/` |
| **Training Journal** | ❌ | ✅ | `features/training/` |
| **Show Creation** | ❌ | ✅ | `features/show-management/` |
| **RBAC Permissions** | ❌ | ✅ | `features/rbac/` |

### 6.8 Benefits of Build Variants

| Benefit | Description |
|---------|-------------|
| **Single source of truth** | Fix a bug once, it's fixed in both apps |
| **Smaller lite bundle** | Tree-shaking removes unused features (~800KB vs ~2.5MB) |
| **Shared types** | No drift between data models |
| **Easier testing** | Test core logic once |
| **Independent deploys** | Deploy lite and full on different schedules |
| **Simpler CI/CD** | One repo, two build pipelines |

### 6.9 Trade-offs

| Trade-off | Mitigation |
|-----------|------------|
| More complex build setup | One-time setup cost |
| Conditional code can be messy | Feature folders isolate complexity |
| Must test both variants | CI runs both builds |
| Larger repo | Offset by not maintaining two repos |

---

## 7. Deployment Strategy

### 7.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Deployment Overview                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │  myK9Q Lite     │    │   myK9Show      │                     │
│  │                 │    │                 │                     │
│  │  Vercel/Netlify │    │  Vercel/Netlify │                     │
│  │  scoring.myk9.com│    │  app.myk9.com   │                     │
│  └────────┬────────┘    └────────┬────────┘                     │
│           │                      │                               │
│           └──────────┬───────────┘                               │
│                      │                                           │
│           ┌──────────▼──────────┐                               │
│           │    @myk9/shared     │                               │
│           │                     │                               │
│           │  npm package        │                               │
│           │  (private registry) │                               │
│           └──────────┬──────────┘                               │
│                      │                                           │
│           ┌──────────▼──────────┐                               │
│           │     Supabase        │                               │
│           │                     │                               │
│           │  myK9Show-Working   │                               │
│           │  us-east-2          │                               │
│           └─────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Environment Configuration

**myK9Q (.env)**:
```bash
VITE_SUPABASE_URL=https://eergfbehjghvfqvzkhsu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_APP_MODE=lite
```

**myK9Show (.env)**:
```bash
VITE_SUPABASE_URL=https://eergfbehjghvfqvzkhsu.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_STRIPE_PUBLIC_KEY=pk_...
VITE_APP_MODE=full
```

### 7.3 Build Variants

**Lite Build** (myK9Q):
```bash
# vite.config.ts
export default defineConfig({
  define: {
    'import.meta.env.VITE_FEATURE_ENTRIES': false,
    'import.meta.env.VITE_FEATURE_PAYMENTS': false,
    'import.meta.env.VITE_FEATURE_HEALTH': false,
    'import.meta.env.VITE_FEATURE_TITLES': false,
  },
  build: {
    rollupOptions: {
      // Tree-shake excluded features
    }
  }
});
```

---

## 8. Migration Plan

### 8.1 Timeline

```
┌─────────────────────────────────────────────────────────────────┐
│                      Migration Timeline                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: myK9Q Production Launch                                │
│  ─────────────────────────────────                               │
│  Week 0      │ Launch myK9Q on myK9Q-React-Dev                  │
│              │ No changes needed                                 │
│              │                                                   │
│  Phase 2: Database Preparation                                   │
│  ─────────────────────────────                                   │
│  Week 1-2    │ Add myK9Q tables to myK9Show-Working             │
│              │ Create compatibility views                        │
│              │ Set up RLS policies                               │
│              │                                                   │
│  Phase 3: Code Updates                                           │
│  ─────────────────────                                           │
│  Week 2-3    │ Update myK9Q to use unified database             │
│              │ Test all functionality                            │
│              │                                                   │
│  Phase 4: Cutover                                                │
│  ─────────────                                                   │
│  Week 3-4    │ Final data sync                                  │
│              │ Switch myK9Q production                           │
│              │ Monitor and validate                              │
│              │                                                   │
│  Phase 5: Shared Library                                         │
│  ─────────────────────                                           │
│  Week 5-8    │ Extract shared components                        │
│              │ Create @myk9/shared package                       │
│              │ Refactor both apps to use shared lib              │
│              │                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Database Migration Steps

**Step 1: Add myK9Q Tables**
```sql
-- Run in myK9Show-Working

-- Class requirements
CREATE TABLE class_requirements (
  id BIGSERIAL PRIMARY KEY,
  organization TEXT NOT NULL,
  element TEXT NOT NULL,
  level TEXT NOT NULL,
  -- ... (all columns from myK9Q schema)
);

-- Result visibility tables
CREATE TABLE show_result_visibility_defaults ( ... );
CREATE TABLE trial_result_visibility_overrides ( ... );
CREATE TABLE class_result_visibility_overrides ( ... );

-- Nationals tables
CREATE TABLE nationals_rankings ( ... );
CREATE TABLE nationals_scores ( ... );
CREATE TABLE nationals_advancement ( ... );

-- ... etc for all myK9Q-specific tables
```

**Step 2: Enhance Existing Tables**
```sql
-- Add license_key to show table
ALTER TABLE show ADD COLUMN license_key VARCHAR UNIQUE;

-- Add scoring columns to entry table
ALTER TABLE entry
ADD COLUMN result_status TEXT DEFAULT 'pending',
ADD COLUMN search_time_seconds NUMERIC DEFAULT 0,
ADD COLUMN area1_time_seconds NUMERIC DEFAULT 0,
-- ... (all scoring columns from myK9Q)
;
```

**Step 3: Create Compatibility Views**
```sql
-- myK9Q uses plural names
CREATE VIEW shows AS SELECT
  id::bigint as id,  -- myK9Q expects bigint
  license_key,
  name as show_name,
  -- ... map columns
FROM show;

CREATE VIEW entries AS SELECT * FROM entry;
CREATE VIEW classes AS SELECT * FROM class;
CREATE VIEW trials AS SELECT * FROM trial;
```

### 8.3 Code Migration Steps

**myK9Q Updates Required**:

| File/Area | Change | Effort |
|-----------|--------|--------|
| `.env` | Update Supabase URL and key | 5 min |
| `src/lib/supabase.ts` | No change needed | - |
| `src/services/replication/*` | Update table names if not using views | 2-4 hrs |
| `src/types/database.ts` | Regenerate from new schema | 30 min |
| All queries | Test and fix any column name differences | 4-8 hrs |

---

## 9. Technical Decisions

### 9.1 Decision Log

| # | Decision | Options Considered | Choice | Rationale |
|---|----------|-------------------|--------|-----------|
| 1 | Target database | myK9Q-React-Dev vs myK9Show-Working | **myK9Show-Working** | Has auth, RBAC, payments, exhibitor data |
| 2 | ID strategy | All UUIDs vs Mixed | **Mixed** | Less refactoring, myK9Q scoring tables keep bigint |
| 3 | Entry/Result design | Separate vs Merged | **Merged** | More efficient for scoring (1 write vs 2) |
| 4 | Auth coexistence | Migrate all to Supabase Auth vs Dual | **Dual** | License key works well for judges |
| 5 | Migration timing | Before vs After myK9Q launch | **After** | No blockers for production |
| 6 | Shared code approach | Separate repos vs npm package vs **build variants** | **Build variants** | Single source of truth, simpler maintenance, tree-shaking for lite build |
| 7 | Code merge direction | myK9Show → myK9Q vs myK9Q → myK9Show | **myK9Q → myK9Show** | myK9Show has richer foundation; port myK9Q's scoring/offline features into it |

### 9.2 Open Questions

| Question | Status | Notes |
|----------|--------|-------|
| Monorepo vs separate repos? | Open | Could use Turborepo or Nx |
| Which npm registry for shared? | Open | npm private, GitHub Packages, or Verdaccio |
| React version alignment? | Open | myK9Q on 19, myK9Show on 18 |
| Dexie vs custom IndexedDB? | Open | Could standardize on one approach |

---

## Appendices

### A. Supabase Project Details

**Production Database: myK9Show-Working**
- Project ID: `eergfbehjghvfqvzkhsu`
- Region: `us-east-2`
- PostgreSQL: 15.8.1
- URL: `https://eergfbehjghvfqvzkhsu.supabase.co`

**Legacy (Archive after migration)**
- myK9Q-React-Dev: `yyzgjyiqgmjzyhzkqdfx`
- myK9Q-206: `ggreahsjqzombkvagxle`
- myK9Show-Databutton: `geveziesnuhwoeysimcf`

### B. Table Counts by Database

**myK9Q-React-Dev**: ~30 tables
- Core: shows, trials, classes, entries
- Scoring: class_requirements, nationals_*, result_visibility_*
- Notifications: announcements, push_*
- Rules: rules, rulebooks, rule_*
- Performance: performance_*

**myK9Show-Working**: ~50 tables
- Core: show, trial, class, entry, result
- Users: user, role, permission, user_role
- Dogs: dog, dog_registration, health_*, achievement
- Payments: stripe_*
- Templates: *_template
- Sync: sync_*, offline_scoring
- Notifications: notification_*

### C. Key File Paths

**myK9Q**:
- Replication: `src/services/replication/ReplicationManager.ts`
- Scoring: `src/pages/scoresheets/`
- Types: `src/types/database.ts`
- Config: `src/config/featureFlags.ts`

**myK9Show**:
- Database: `src/services/database/schema.ts`
- Sync: `src/services/sync/`
- RBAC: `src/services/rbac/`
- Types: `src/types/`

### D. Glossary

| Term | Definition |
|------|------------|
| **License Key** | Unique identifier for a show, used for quick auth in myK9Q |
| **Entry** | A dog's registration to compete in a class |
| **Class** | A specific competition within a trial (e.g., "Novice Buried") |
| **Trial** | A day or session of competition within a show |
| **Show** | The overall event, may span multiple days/trials |
| **RLS** | Row-Level Security - Supabase feature for data isolation |
| **Replication** | Syncing data between IndexedDB and Supabase |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Nov 2025 | Claude | Initial architecture document |

