# Analytics Section Usage Tracking — Design Spec

**Date:** 2026-03-30
**Goal:** Track which future-premium analytics sections users view, so we can validate the free/premium gating line before enforcing it.

---

## Decisions

- **Storage:** Dedicated `analytics_events` Supabase table (structured, queryable)
- **Trigger:** IntersectionObserver (scroll-into-view at 50% threshold)
- **Dedup:** One event per section per page session (module-level `Set`, reset on navigation)
- **Scope:** Only the lifetime analytics page (`/analytics`) — show-scoped tabs stay free and untracked

---

## Database

### Table: `analytics_events` (migration 096)

| Column         | Type                     | Notes                              |
| -------------- | ------------------------ | ---------------------------------- |
| `id`           | `uuid` PK                | `gen_random_uuid()`                |
| `user_id`      | `uuid` FK → `auth.users` | NOT NULL                           |
| `event_type`   | `text` NOT NULL          | e.g. `'section_view'`              |
| `section_name` | `text` NOT NULL          | e.g. `'qualification_trend_chart'` |
| `page`         | `text` NOT NULL          | e.g. `'analytics'`                 |
| `metadata`     | `jsonb`                  | Optional context (filters, etc.)   |
| `created_at`   | `timestamptz`            | `DEFAULT now()`                    |

### RLS Policies

- **INSERT:** Authenticated users, `user_id = auth.uid()` only
- **SELECT:** `site_admin` role only (via `user_roles` join)
- **No UPDATE/DELETE** — append-only log

### Index

- `(section_name, created_at)` — supports the primary query: section popularity over time

---

## Hook: `useTrackSectionView`

**File:** `apps/myk9show/src/hooks/useTrackSectionView.ts`

### API

```typescript
const ref = useTrackSectionView('qualification_trend_chart', 'analytics');
// Usage: <div ref={ref}>...</div>
```

**Parameters:**

- `sectionName: string` — which section (use `TRACKED_SECTIONS` constants)
- `page: string` — which page context

**Returns:** `React.RefObject<HTMLDivElement>` to attach to the section wrapper

### Internals

1. Creates `IntersectionObserver` with `{ threshold: 0.5 }`
2. Module-level `Set<string>` keyed by `${page}:${sectionName}`
3. On first intersection for a given key:
   - Insert row into `analytics_events` (fire-and-forget, no await)
   - Add key to Set
   - Disconnect observer for that element
4. Set resets when `location.pathname` changes (via React Router `useLocation`)
5. No-op for unauthenticated users (check `useAuth()`)
6. Errors logged via `logger.debug()` — non-critical telemetry

### Exported Constants

```typescript
export const TRACKED_SECTIONS = {
  QUALIFICATION_TREND: 'qualification_trend_chart',
  DOG_BREAKDOWN: 'dog_breakdown_cards',
  FASTEST_TIMES: 'fastest_times_table',
  LIFETIME_PAGE: 'lifetime_analytics_page',
} as const;
```

---

## Wiring

### 4 tracking points in `AnalyticsPage.tsx`

| Ref attached to                 | `sectionName`               | `page`        |
| ------------------------------- | --------------------------- | ------------- |
| Outer page container            | `lifetime_analytics_page`   | `'analytics'` |
| QualificationTrendChart wrapper | `qualification_trend_chart` | `'analytics'` |
| DogBreakdownCards wrapper       | `dog_breakdown_cards`       | `'analytics'` |
| FastestTimesTable wrapper       | `fastest_times_table`       | `'analytics'` |

Each gets a thin `<div ref={ref}>` wrapper. No changes to component internals.

### Not tracked

Show-scoped tabs (`MyShowStatsTab`, `ShowStatsSubTab`, `JudgeStatsSubTab`) render the same visualization components but are designated "keep free" — no tracking needed.

---

## Testing

### `useTrackSectionView.test.ts`

- Mock `IntersectionObserver` — trigger callback with `isIntersecting: true`, `intersectionRatio: 0.5`
- Verify Supabase insert fires once on first intersection
- Verify dedup: second intersection for same section = no insert
- Verify no-op for unauthenticated users (null user_id)
- Verify Set resets on pathname change

### No changes to existing component tests

The ref is passive — existing analytics component tests are unaffected.

---

## Example Query (for admin use)

```sql
-- Section popularity over the last 30 days
SELECT section_name, COUNT(*) as views, COUNT(DISTINCT user_id) as unique_users
FROM analytics_events
WHERE event_type = 'section_view'
  AND created_at > now() - interval '30 days'
GROUP BY section_name
ORDER BY views DESC;
```
