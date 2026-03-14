# Shareable Show Pages with OG Metadata

**Date:** 2026-03-13
**Status:** Draft

## Problem

Show page URLs shared on social media display no preview — no title, no image, no description. Crawlers see only the generic SPA `index.html` because the app renders client-side. Every shared link is a missed discovery opportunity. Secretaries have no share button — they must copy the URL manually.

## Solution

Four components turn shared show links into compelling previews:

1. **Vercel Edge Middleware** detects crawlers and returns HTML with show-specific OG tags
2. **Dynamic OG image generation** renders a branded card per show via `@vercel/og`
3. **Public show page** displays show details, day-by-day schedule summary, and a Register CTA — no auth required
4. **Share button** uses the Web Share API with a clipboard fallback

## Architecture

### Request Flow

```
Browser request → /shows/:id
  ├── Crawler (detected by User-Agent)
  │   → Edge Middleware fetches show from Supabase
  │   → Returns minimal HTML with OG meta tags + meta-refresh redirect
  │
  └── Regular browser
      → Passes through to SPA index.html (unchanged)
```

### Component Diagram

```
Vercel Edge
├── middleware.ts                    # Crawler detection + OG HTML response
└── api/og/show/[id].tsx           # OG image generation (@vercel/og)

SPA (apps/myk9show)
├── pages/ShowDetailsPage.tsx       # Updated: public show page layout
├── components/shows/ShareButton.tsx # New: share button component
└── utils/share.ts                  # New: extracted share utility
```

## 1. Edge Middleware — Crawler Detection and OG Tag Injection

**File:** `apps/myk9show/middleware.ts` (Vercel convention — project root)

The middleware intercepts requests matching `/shows/:id`. It checks the `User-Agent` header against known crawlers. Non-crawler requests pass through unchanged.

### Crawler List

```
facebookexternalhit, Twitterbot, LinkedInBot, Slackbot-LinkExpanding,
Discordbot, WhatsApp, Applebot, Googlebot, bingbot, Pinterestbot,
TelegramBot, redditbot, Embedly, Quora Link Preview, Showyoubot
```

This list covers all major platforms that generate link previews. The same list is used by next-seo and similar libraries.

### OG Tags

For a crawler request, the middleware returns a minimal HTML document with these meta tags:

| Tag                   | Value                                                        | Example                                                                       |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `og:title`            | `{name} — {formatted date range}`                            | "Rocky Mountain Classic — June 14–15, 2026"                                   |
| `og:description`      | `{org} Dog Show in {location} · {clubName} · {entry status}` | "AKC Dog Show in Denver, CO · Rocky Mountain Dog Club · Entries close May 28" |
| `og:image`            | `/api/og/show/{id}`                                          | Dynamically generated image                                                   |
| `og:url`              | Canonical show URL                                           | `https://myk9show.com/shows/{id}`                                             |
| `og:type`             | `event`                                                      |                                                                               |
| `twitter:card`        | `summary_large_image`                                        |                                                                               |
| `twitter:title`       | Same as `og:title`                                           |                                                                               |
| `twitter:description` | Same as `og:description`                                     |                                                                               |

The entry status line adapts to the show's state:

- `accepting_entries` → "Entries close {date}"
- `closed` → "Entries closed"
- `completed` → "Show completed"
- `published` → "Entry dates TBA"
- `draft` → Returns 404 (not publicly visible)

The HTML includes a `<meta http-equiv="refresh" content="0;url=...">` redirect so that any crawler that renders the page will navigate to the SPA.

### Supabase Query

A single lightweight query fetches only the fields needed for OG tags:

```sql
SELECT s.id, s.name, s.start_date, s.end_date, s.location, s.status,
       s.entry_open_date, s.entry_close_date,
       c.name AS club_name, c.logo_url
FROM shows s
JOIN clubs c ON s.club_id = c.id
WHERE s.id = $1 AND s.status != 'draft'
```

No auth required — this is public show data. The query runs at the edge via the Supabase REST API with the anon key.

### Middleware Matcher

```typescript
export const config = {
  matcher: '/shows/:id*',
};
```

The middleware runs only on `/shows/:id` routes. All other routes pass through untouched.

## 2. Dynamic OG Image Generation

**File:** `apps/myk9show/api/og/show/[id].tsx` (Vercel API route)

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
- **Accent bar:** Left edge, colored with the show's `accentColor`
- **Club logo:** Rendered from `logoUrl` if available; falls back to initials circle
- **Organization:** Uppercase label (e.g., "AKC") above the discipline list
- **Disciplines:** Summarized from trial/class data (e.g., "Scent Work · Obedience · Rally")
- **Entry badge:** Shown only when status is `accepting_entries`
- **Font:** Inter (loaded from Google Fonts — Satori supports remote fonts)

### Caching

```
Cache-Control: public, max-age=86400, s-maxage=86400
```

The image is cached for 24 hours. Vercel's CDN serves subsequent requests from cache.

### Fallback

If the show ID is missing, the query fails, or the show is in draft status, return a generic myK9-branded fallback image (static PNG bundled with the API route).

### Data Query

Same Supabase query as the middleware, plus:

```sql
SELECT DISTINCT
  -- extract discipline names from class names for the discipline summary
  t.date AS trial_date
FROM show_trials t
JOIN classes cl ON cl.trial_id = t.id
WHERE t.show_id = $1
```

The discipline list in the OG image is a compact summary (e.g., "Scent Work · Obedience · Rally") derived from class names. The summarization logic is the same as the public show page (Section 3).

## 3. Public Show Page

**File:** `apps/myk9show/src/pages/ShowDetailsPage.tsx` (modified)

The `/shows/:id` route is already public. The page needs layout changes to work as a landing page for visitors arriving from shared links.

### Page Structure

**Hero section**

- Club logo (or initials circle) + club name
- Organization badge (e.g., "AKC")
- Share button (top-right)
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

Classes are grouped by trial date, then by discipline. For each discipline on a given day, the summary shows:

- **Elements/types** offered (e.g., Buried, Container for Scent Work)
- **Level range** (e.g., Novice–Master)

The discipline and element names are parsed from the class `name` field. The parsing logic should handle common patterns:

- "Novice Standard Agility" → discipline: Agility, element: Standard, level: Novice
- "Open Buried Scent Work" → discipline: Scent Work, element: Buried, level: Open

If parsing fails for a class name, display it verbatim in an "Other" group.

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

Placed in the show page hero, next to the organization badge. Visible to all visitors.

### Share Utility

**File:** `apps/myk9show/src/utils/share.ts`

Extracted from the existing pattern in `LiveResults.tsx` so both callsites use the same logic.

```typescript
interface ShareOptions {
  title: string;
  text: string;
  url: string;
}

async function shareOrCopy(options: ShareOptions): Promise<'shared' | 'copied'>;
```

**Behavior:**

1. If `navigator.share` is available → open native share sheet
2. Otherwise → copy URL to clipboard

**Share data for a show:**

- `title`: "{Show Name} — {Date Range}"
- `text`: "{Org} Dog Show in {Location} · {Club Name}"
- `url`: canonical show URL

The component shows a toast on successful copy ("Link copied!").

### Migrating LiveResults.tsx

Replace the inline share logic in `LiveResults.tsx` with a call to the shared utility. This removes duplication without changing behavior.

## Files Changed

| File                                                     | Change                                                |
| -------------------------------------------------------- | ----------------------------------------------------- |
| `apps/myk9show/middleware.ts`                            | New — Edge Middleware for crawler detection + OG tags |
| `apps/myk9show/api/og/show/[id].tsx`                     | New — OG image generation API route                   |
| `apps/myk9show/src/pages/ShowDetailsPage.tsx`            | Modified — public landing page layout                 |
| `apps/myk9show/src/components/shows/ShareButton.tsx`     | New — share button component                          |
| `apps/myk9show/src/utils/share.ts`                       | New — shared share/copy utility                       |
| `apps/myk9show/src/components/exhibitor/LiveResults.tsx` | Modified — use shared utility                         |
| `apps/myk9show/vercel.json`                              | Modified — may need middleware config adjustments     |
| `apps/myk9show/package.json`                             | Modified — add `@vercel/og` dependency                |

## Dependencies

| Package      | Purpose                         |
| ------------ | ------------------------------- |
| `@vercel/og` | OG image generation at the edge |

## Edge Cases

- **Draft shows:** Middleware returns 404. OG image returns fallback. Public page redirects to `/shows`.
- **Cancelled shows:** Display show with "Cancelled" status badge. No Register CTA.
- **No trials/classes yet:** Schedule section hidden. Show details still visible.
- **No club logo:** Fall back to initials circle (first letters of club name).
- **No accent color:** Default to myK9 brand blue (#2563eb).
- **Class names that don't parse:** Displayed verbatim in an "Other" group.
- **Supabase query failure in middleware:** Fall back to generic OG tags (myK9 branding, no show-specific data) rather than blocking the request.
- **Show with no organization field:** Omit "AKC" / "UKC" badge and OG prefix.

## Testing

- **Middleware:** Unit test crawler detection logic. Test OG HTML output for various show states.
- **OG image:** Visual regression test against snapshot. Test fallback behavior.
- **Public page:** Component tests for schedule summarization logic. Test each show status variant.
- **Share utility:** Unit test `navigator.share` path and clipboard fallback path.
- **Integration:** Verify OG tags with Facebook Sharing Debugger and Twitter Card Validator after deployment.

## Follow-up Work (Out of Scope)

- Refresh the authenticated show detail page to match this design
- Custom domain OG URLs (when myk9show.com domain is configured)
- Analytics on share button usage
- OG image A/B testing
