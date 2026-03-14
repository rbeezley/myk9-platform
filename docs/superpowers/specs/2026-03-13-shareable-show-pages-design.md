# Shareable Show Pages with OG Metadata

**Date:** 2026-03-13
**Status:** Draft

## Problem

Show page URLs shared on social media display no preview — no title, no image, no description. Crawlers see only the generic SPA `index.html` because the app renders client-side. Every shared link is a missed discovery opportunity. Secretaries have no share button — they must copy the URL manually.

## Solution

Four components turn shared show links into compelling previews:

1. **Vercel Edge Function** detects crawlers and returns HTML with show-specific OG tags
2. **Dynamic OG image generation** renders a branded card per show via `@vercel/og`
3. **Public show page** displays show details, day-by-day schedule summary, and a Register CTA — no auth required
4. **Share button** uses the Web Share API with a clipboard fallback

## Architecture

### Request Flow

```
Browser request → /shows/:id
  ├── Crawler (detected by User-Agent)
  │   → Edge Function fetches show from Supabase
  │   → Returns minimal HTML with OG meta tags + meta-refresh redirect
  │
  └── Regular browser
      → Passes through to SPA index.html (unchanged)
```

### Component Diagram

```
Vercel
├── api/og-show.ts                  # Edge Function: crawler detection + OG HTML
├── api/og-show-image.tsx           # Edge Function: OG image generation (@vercel/og)

SPA (apps/myk9show)
├── pages/ShowDetailsPage.tsx       # Updated: public show page layout
├── components/shows/ShareButton.tsx # New: share button component
└── utils/share.ts                  # New: extracted share utility
```

## 1. Edge Function — Crawler Detection and OG Tag Injection

### Vite SPA on Vercel: Why Edge Functions, Not Middleware

Vercel Edge Middleware (`middleware.ts` with `export const config = { matcher }`) is a **Next.js convention**. For a Vite SPA deployed as a static site, middleware does not work the same way.

Instead, we use **Vercel Edge Functions** via the `api/` directory, combined with `vercel.json` rewrites to route `/shows/:id` requests through the function. The function detects crawlers and returns OG HTML; for regular browsers, it returns a redirect or serves the SPA HTML directly.

**File:** `apps/myk9show/api/og-show.ts` (Vercel Edge Function)

### Routing via vercel.json

```json
{
  "rewrites": [
    { "source": "/shows/:id", "destination": "/api/og-show?id=:id" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The `/shows/:id` rewrite must come **before** the catch-all SPA rewrite. The Edge Function handles both crawlers and browsers:

- **Crawler:** Returns OG HTML response
- **Browser:** Returns the SPA `index.html` content (read from the static build output) so the React app boots and renders the show page client-side. The URL does not change — the user sees `/shows/:id`.

### Crawler List

```
facebookexternalhit, Twitterbot, LinkedInBot, Slackbot-LinkExpanding,
Discordbot, WhatsApp, Applebot, Googlebot, bingbot, Pinterestbot,
TelegramBot, redditbot, Embedly, Quora Link Preview, Showyoubot
```

This list covers all major platforms that generate link previews.

### OG Tags

For a crawler request, the function returns a minimal HTML document with these meta tags:

| Tag                   | Value                                                        | Example                                                                       |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `og:title`            | `{name} — {formatted date range}`                            | "Rocky Mountain Classic — June 14–15, 2026"                                   |
| `og:description`      | `{org} Dog Show in {location} · {clubName} · {entry status}` | "AKC Dog Show in Denver, CO · Rocky Mountain Dog Club · Entries close May 28" |
| `og:image`            | `{baseUrl}/api/og-show-image?id={id}`                        | Dynamically generated image                                                   |
| `og:image:width`      | `1200`                                                       |                                                                               |
| `og:image:height`     | `630`                                                        |                                                                               |
| `og:url`              | `{baseUrl}/shows/{id}`                                       | Uses `VERCEL_URL` or `VITE_PUBLIC_URL` env var                                |
| `og:type`             | `event`                                                      |                                                                               |
| `twitter:card`        | `summary_large_image`                                        |                                                                               |
| `twitter:title`       | Same as `og:title`                                           |                                                                               |
| `twitter:description` | Same as `og:description`                                     |                                                                               |
| `twitter:image`       | Same as `og:image`                                           |                                                                               |

**Base URL:** Read from `VITE_PUBLIC_URL` environment variable (set per Vercel environment). Falls back to `https://${process.env.VERCEL_URL}` in preview deployments. Never hardcoded.

The entry status line adapts to the show's state:

- `accepting_entries` → "Entries close {date}"
- `closed` → "Entries closed"
- `completed` → "Show completed"
- `in_progress` → "Show in progress"
- `cancelled` → "Show cancelled"
- `published` → "Entry dates TBA"
- `draft` → Returns 404 (not publicly visible)

The HTML includes a `<meta http-equiv="refresh" content="0;url=...">` redirect so that any crawler that renders the page will navigate to the SPA.

### Supabase Query

A single lightweight query fetches the fields needed for OG tags:

```sql
SELECT s.id, s.name, s.organization, s.start_date, s.end_date,
       s.location, s.status, s.entry_open_date, s.entry_close_date,
       s.accent_color,
       COALESCE(s.logo_url, c.logo_url) AS logo_url,
       c.name AS club_name
FROM shows s
JOIN clubs c ON s.club_id = c.id
WHERE s.id = $1 AND s.status != 'draft' AND s.deleted_at IS NULL
```

No auth required — all tables have RLS policies allowing anonymous SELECT (`USING (true)` on shows, clubs, trials, and classes — defined in migration 006).

The query runs via the Supabase REST API with the anon key.

## 2. Dynamic OG Image Generation

**File:** `apps/myk9show/api/og-show-image.tsx` (Vercel Edge Function)

Uses `@vercel/og` (Satori + Resvg) to render a JSX component as a 1200×630 PNG.

### Image Layout

```
┌──────────────────────────────────────────────┐
│  [Club Logo]  Club Name              myK9    │
│                                              │
│  Show Name (large, bold)                     │
│  ─────────────────────                       │
│  📅 Date Range    📍 Location                │
│                                              │
│  [Entry deadline badge]    ORG               │
│                          Discipline list     │
│▌ accent color bar                            │
└──────────────────────────────────────────────┘
```

- **Background:** Light gradient with subtle paw print watermark
- **Accent bar:** Left edge, colored with the show's `accentColor` → organization default → myK9 brand teal (#14b8a6). Organization defaults: AKC=#14b8a6, UKC=#f97316, ASCA=#3b82f6
- **Club logo:** Show-level `logo_url` if set, else club-level `logo_url`, else initials circle
- **Organization:** Uppercase label (e.g., "AKC") above the discipline list
- **Disciplines:** Summarized from `trials.trial_type` (e.g., "Scent Work · Obedience · Rally")
- **Entry badge:** Shown only when status is `accepting_entries`
- **Font:** Inter (loaded from Google Fonts — Satori supports remote fonts)

### Caching

```
Cache-Control: public, max-age=86400, s-maxage=86400
```

The image is cached for 24 hours. Vercel's CDN serves subsequent requests from cache. Fallback/error responses also cache for 1 hour (`s-maxage=3600`) to prevent repeated Supabase hits for invalid IDs.

### Fallback

If the show ID is missing, the query fails, or the show is in draft status, return a generic myK9-branded fallback image (static PNG bundled with the function).

### Data Query

Show data query (same as Section 1), plus a discipline summary query:

```sql
SELECT DISTINCT COALESCE(t.trial_type, cl.competition_type) AS discipline
FROM trials t
JOIN classes cl ON cl.trial_id = t.id
WHERE t.show_id = $1
ORDER BY discipline
```

This produces the compact discipline list (e.g., "Scent Work · Obedience · Rally") using the structured `trial_type` and `competition_type` columns.

## 3. Public Show Page

**File:** `apps/myk9show/src/pages/ShowDetailsPage.tsx` (modified)

The `/shows/:id` route is already public. The page needs layout changes to work as a landing page for visitors arriving from shared links.

### Page Structure

**Hero section**

- Club logo (or initials circle) + club name
- Organization badge (e.g., "AKC") + Share button (grouped, top-right)
- Show name (prominent heading)
- Date range + location
- Status badge ("Accepting Entries", "Entries Closed", etc.)

**Entry CTA bar**

- Pre-entry fee + entry close date
- "Register Now" button (links to `/shows/:id/register`, triggers auth if not signed in)
- Adapts by status: "Register Now" when accepting, "Entries Closed" when closed, hidden when draft

**Schedule summary (by day)**

Groups trials by date, then summarizes classes within each day by discipline. Example:

```
Friday, June 13
  Scent Work — Buried, Container · Novice–Master

Saturday, June 14
  Scent Work — Interior, Exterior · Novice–Master
  Obedience — Novice, Open, Utility
  Rally — Novice–Master

Sunday, June 15
  Scent Work — Handler Disc., Detective · Novice–Master
  Obedience — Novice, Open, Utility
  Rally — Novice–Master
```

### Class Summarization Logic

Uses structured database columns — no free-text name parsing required.

**Data source:**

- **Discipline:** `trials.trial_type` (primary) or `classes.competition_type` (fallback)
- **Element:** `classes.element` (e.g., "Buried", "Container", "Interior")
- **Level:** `classes.level` (e.g., "Novice", "Open", "Master")
- **Date:** `trials.date`

**Grouping algorithm:**

1. Group classes by `trials.date`
2. Within each date, group by discipline (`trials.trial_type` ?? `classes.competition_type`)
3. For each discipline on a given day, collect distinct `element` values and distinct `level` values
4. Display elements as a comma-separated list, levels as a range (e.g., "Novice–Master")
5. If both `trial_type` and `competition_type` are null, group the class under "Other" using its `name` field verbatim

**Query:**

```sql
SELECT t.date AS trial_date,
       COALESCE(t.trial_type, cl.competition_type) AS discipline,
       cl.element,
       cl.level,
       cl.name
FROM trials t
JOIN classes cl ON cl.trial_id = t.id
WHERE t.show_id = $1
ORDER BY t.date, discipline, cl.element, cl.level
```

**Show details grid**

- Chairman, Secretary, Chief Steward
- Entry fees (pre-entry, day-of-show)
- Entry limits (per dog, total)
- Non-owner handler policy

**Footer**

- "Powered by myK9" + link to browse more shows

### No Auth Required

The entire page renders without authentication. The "Register Now" CTA is the only action requiring sign-in, handled by the existing auth redirect flow.

## 4. Share UX

### Share Button Component

**File:** `apps/myk9show/src/components/shows/ShareButton.tsx`

Placed in the show page hero, grouped with the organization badge in the top-right area. Visible to all visitors.

### Share Utility

**File:** `apps/myk9show/src/utils/share.ts`

Extracted from the existing pattern in `LiveResults.tsx` so both callsites use the same logic.

```typescript
interface ShareOptions {
  title: string;
  text: string;
  url: string;
  clipboardText?: string; // If set, copy this instead of url on clipboard fallback
}

async function shareOrCopy(options: ShareOptions): Promise<'shared' | 'copied' | 'cancelled'>;
```

**Behavior:**

1. If `navigator.share` is available → open native share sheet
2. Otherwise → copy `clipboardText` (if provided) or `url` to clipboard

The `clipboardText` option exists because LiveResults needs to copy results text (not a URL) to clipboard. The show page copies the URL.

**Share data for a show:**

- `title`: "{Show Name} — {Date Range}"
- `text`: "{Org} Dog Show in {Location} · {Club Name}"
- `url`: canonical show URL (from `VITE_PUBLIC_URL` env var)

The component shows a toast on successful copy ("Link copied!").

### Migrating LiveResults.tsx

Replace the inline share logic in `LiveResults.tsx` with a call to the shared utility. This removes duplication without changing behavior.

## Files Changed

| File                                                     | Change                                                   |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `apps/myk9show/api/og-show.ts`                           | New — Edge Function for crawler detection + OG tags      |
| `apps/myk9show/api/og-show-image.tsx`                    | New — OG image generation Edge Function                  |
| `apps/myk9show/src/pages/ShowDetailsPage.tsx`            | Modified — public landing page layout                    |
| `apps/myk9show/src/components/shows/ShareButton.tsx`     | New — share button component                             |
| `apps/myk9show/src/utils/share.ts`                       | New — shared share/copy utility                          |
| `apps/myk9show/src/components/exhibitor/LiveResults.tsx` | Modified — use shared utility                            |
| `apps/myk9show/vercel.json`                              | Modified — add `/shows/:id` rewrite before SPA catch-all |
| `apps/myk9show/package.json`                             | Modified — add `@vercel/og` dependency                   |

## Dependencies

| Package      | Purpose                         |
| ------------ | ------------------------------- |
| `@vercel/og` | OG image generation at the edge |

## Edge Cases

- **Draft shows:** Edge Function returns 404. OG image returns fallback. Public page redirects to `/shows`.
- **Cancelled shows:** Display show with "Cancelled" status badge. No Register CTA. OG description: "Show cancelled."
- **In-progress shows:** Display with "In Progress" badge. OG description: "Show in progress."
- **No trials/classes yet:** Schedule section hidden. Show details still visible.
- **No club logo:** Fall back to initials circle (first letters of club name).
- **No accent color:** Fall back to organization default (AKC=#14b8a6, UKC=#f97316, ASCA=#3b82f6), then myK9 brand teal (#14b8a6).
- **Null structured columns:** Classes with null `trial_type`, `competition_type`, `element`, and `level` display verbatim under "Other."
- **Supabase query failure:** Fall back to generic OG tags (myK9 branding, no show-specific data) rather than blocking the request.
- **Show with no organization field:** Omit "AKC" / "UKC" badge and OG prefix.
- **Invalid show ID in OG image:** Return fallback image with 1-hour cache to prevent repeated Supabase queries.

## RLS and Security

All tables touched by the Edge Function queries allow anonymous SELECT via RLS policies (migration 016 superseded the original policies from migration 006):

- `shows` — anonymous SELECT allowed when `status IN ('published', 'accepting_entries', 'closed', 'in_progress', 'completed') AND deleted_at IS NULL`. Draft and soft-deleted shows are hidden by RLS.
- `clubs` — anonymous SELECT allowed unconditionally
- `trials` — anonymous SELECT allowed when parent show satisfies the above condition
- `classes` — anonymous SELECT allowed when `deleted_at IS NULL` and parent trial/show satisfies the above condition

The Edge Function queries include `WHERE s.status != 'draft' AND s.deleted_at IS NULL` as defense-in-depth, though RLS enforces the same restrictions at the database level.

The Edge Functions use the Supabase anon key. No secrets are exposed to the client. The anon key is already public (embedded in the SPA), so using it in Edge Functions does not expand the attack surface.

## Testing

- **Edge Function:** Unit test crawler detection logic. Test OG HTML output for each show status (all 7 states). Test browser pass-through path.
- **OG image:** Visual regression test against snapshot. Test fallback for invalid/draft IDs.
- **Schedule summarization:** Dedicated unit test suite covering:
  - Multi-discipline days (Scent Work + Obedience + Rally on same day)
  - Single-class days
  - Days with no classes (trial exists but no classes — skip the day)
  - Classes with null structured fields (falls back to "Other" group)
  - Mixed structured/unstructured data on same day
  - Level range formatting (single level vs range)
- **Share utility:** Unit test `navigator.share` path and clipboard fallback path.
- **Integration:** Verify OG tags with Facebook Sharing Debugger and Twitter Card Validator after deployment.

## Follow-up Work (Out of Scope)

- Refresh the authenticated show detail page to match this design
- Custom domain OG URLs (when myk9show.com domain is configured)
- Analytics on share button usage
- OG image A/B testing
