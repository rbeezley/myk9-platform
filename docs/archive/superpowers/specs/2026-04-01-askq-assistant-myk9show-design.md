# AskQ Assistant for myK9Show — Design Spec

**Date:** 2026-04-01
**Status:** Approved
**Origin:** Port from myK9Q AskQ implementation

## Overview

Port the AskQ AI assistant from myK9Q to myK9Show. The assistant answers rule questions via full-text search, show data queries scoped to the authenticated user's dogs, and (future) user guide questions. Uses Claude Haiku 3.5 with tool-use pattern and streaming responses.

## Goals

1. Give all authenticated myK9Show users an AI assistant for rules, show data, and app help
2. Leverage authentication to auto-scope "my dog" queries to the user's registered dogs
3. Stream responses for responsive UX
4. Track usage with user-attributed analytics and feedback
5. Control costs with tiered rate limiting (10/day free, 50/day premium)
6. Design for three capabilities but ship two (user guide activates when content exists)

## Non-Goals

- Multi-turn conversation (single-question Q&A only; history can be added later)
- Full FAQ management system with database tables and offline cache
- Admin dashboard for analytics (table is queryable directly for now)
- Subscription/billing changes (uses existing `useSubscriptionGate` infrastructure)

## Architecture

### Backend: Shared Module + Per-App Edge Functions

Extract shared logic from `ask-myk9q` into `supabase/functions/_shared/askq/`:

| Shared module file     | Purpose                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `toolDefinitions.ts`   | 6 tool definitions: `search_rules`, `get_class_summary`, `get_entry_results`, `get_trial_overview`, `search_entries`, `search_user_guide` (stub) |
| `toolExecutor.ts`      | Executes tools against Supabase, date resolution, class lookup                                                                                   |
| `ruleLookup.ts`        | Full-text search on `rules` table                                                                                                                |
| `responseFormatter.ts` | Collects sources, builds structured response                                                                                                     |
| `promptBuilder.ts`     | System prompt with tool selection guidance                                                                                                       |
| `types.ts`             | Shared TypeScript types                                                                                                                          |

Each app gets a thin wrapper edge function:

- **`ask-myk9q/index.ts`** — License-key auth, no rate limiting, no streaming. Imports from `_shared/askq/`. Backwards-compatible with existing myK9Q frontend.
- **`ask-myk9show/index.ts`** — Supabase auth token, rate limiting, streaming SSE responses, user-scoped dog resolution. Imports from `_shared/askq/`. CORS allows `myk9-platform-myk9show.vercel.app` and `localhost:5173`.

### Streaming Response Format

The `ask-myk9show` edge function returns a `ReadableStream` using Server-Sent Events:

```
event: tools_used
data: ["search_rules", "get_entry_results"]

event: sources
data: {rules: [...], entries: [...]}

event: token
data: "Buddy"

event: token
data: " had a"

event: token
data: " great day"

event: meta
data: {remaining: 7, responseTimeMs: 2300}

event: done
data: {}
```

- `tools_used` and `sources` arrive before text tokens so the UI can render badges and prepare source cards while the answer streams in.
- `token` events stream the answer text progressively.
- `meta` arrives at the end with rate limit info and timing.
- `done` signals stream completion.

The edge function uses `client.messages.stream()` from the Anthropic SDK. Tool calls are processed as they complete (tools require database queries, so they run before streaming begins). The final text response is streamed token by token.

### Auth-Scoped Show Data Queries

When a myK9Show user submits a query:

1. Extract `user_id` from Supabase auth token.
2. Query `dogs` table where `owner_id = user_id` to get the user's dogs (names, IDs, breeds).
3. Inject dog info into the system prompt preamble:
   ```
   The user is [name]. Their dogs: Buddy (ID: abc), Rex (ID: def).
   Current show: [show name] (if show_id provided).
   When the user says "my dog" without specifying, ask which dog if they have multiple.
   ```
4. Tool queries for `get_entry_results` and `search_entries` can filter by the user's dog IDs when the query references "my dog."
5. If `show_id` is provided, show-scoped queries resolve without the user specifying which show. The frontend determines `show_id` from the current route — if the URL matches `/shows/:showId/*` or `/secretary/shows/:showId/*`, extract and pass it. Otherwise, `show_id` is null and the user must specify.
6. Fallback: queries about other dogs by name use `search_entries` the same way myK9Q does.

### Rate Limiting

Enforced server-side in the edge function:

1. `SELECT count(*) FROM chatbot_query_log WHERE user_id = $1 AND created_at >= current_date`
2. Check user's subscription tier from profiles/subscriptions.
3. Free tier: 10 queries/day. Premium tier: 50 queries/day.
4. If limit exceeded, return HTTP 429 with `{remaining: 0, limit, resetsAt}`.
5. Otherwise, proceed and include `{remaining}` in the `meta` SSE event.

### User Guide Tool (Stub)

`search_user_guide` is defined in tool definitions but returns a placeholder response: "The user guide is not yet available. Try asking about rules or your show data instead."

When user guide content is added to the `user_guide` table, the tool activates with full-text search — no edge function changes needed. The system prompt already includes "App Help" as a capability category.

## Database Changes

### Modify `chatbot_query_log`

Add columns:

- `user_id` (UUID, nullable, FK to `auth.users`) — null for myK9Q queries
- `app_source` (TEXT, NOT NULL, DEFAULT 'myk9q') — 'myk9q' or 'myk9show'
- `response_time_ms` (INTEGER) — query-to-response duration
- Index on `(user_id, created_at)` for rate limit queries

### Modify `chatbot_feedback`

Add columns:

- `user_id` (UUID, nullable, FK to `auth.users`)
- `rating` (SMALLINT) — +1 (thumbs up) or -1 (thumbs down)

### New table: `user_guide`

Created empty, ready for content when the user guide is written.

| Column          | Type        | Notes                                      |
| --------------- | ----------- | ------------------------------------------ |
| `id`            | UUID        | PK, default gen_random_uuid()              |
| `section`       | TEXT        | e.g., "Getting Started", "Secretary Guide" |
| `title`         | TEXT        | e.g., "How to add a new trial"             |
| `content`       | TEXT        | Answer/explanation text                    |
| `keywords`      | TEXT[]      | For search boosting                        |
| `search_vector` | tsvector    | Generated from title + content             |
| `created_at`    | TIMESTAMPTZ | Default now()                              |
| `updated_at`    | TIMESTAMPTZ | Default now()                              |

- Full-text search index on `search_vector`.
- RLS: public read (guide content is not sensitive).
- Trigger to auto-update `search_vector` on insert/update.

## Frontend

### New Files

| File                                     | Purpose                                                                                      |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| `components/askq/AskQPanel.tsx`          | Slide-over panel — open/close, renders child components                                      |
| `components/askq/AskQInput.tsx`          | Text input + send button, handles submit, disabled when rate limited                         |
| `components/askq/AskQAnswer.tsx`         | Streams answer text with blinking cursor, renders tool badges                                |
| `components/askq/AskQSources.tsx`        | Expandable source cards by type (rules, entries, classes, trials)                            |
| `components/askq/AskQFeedback.tsx`       | Thumbs up/down + report issue, appears after stream completes                                |
| `components/askq/AskQExampleQueries.tsx` | Curated example chips grouped by Rules / Show Data / App Help                                |
| `components/askq/askq-config.ts`         | Example queries array, rate limit constants                                                  |
| `hooks/useAskQ.ts`                       | Core hook — SSE stream reader, accumulates tokens, manages state                             |
| `store/useAskQPanelStore.ts`             | Zustand store for panel open/close state (shared between header button and profile dropdown) |
| `services/askqService.ts`                | `fetch()` with SSE stream, rate limit check, feedback submission                             |

### Integration Points

- **`AppHeader.tsx`** — Add AskQ icon button (Lucide `MessageSquare` or similar) between theme toggle and profile avatar. Uses `useAskQPanelStore` to toggle.
- **Profile dropdown** — Add "AskQ Assistant" menu item. Uses same `useAskQPanelStore`.
- **`AskQPanel`** rendered at app layout level so it overlays any page.

### UI Behavior

**Empty state:** Panel shows example query chips grouped under "Rules", "Show Data", and "App Help" (dimmed/coming soon) headings. Input bar at bottom with placeholder text.

**Loading state:** After submitting a query, user's question appears as a right-aligned bubble. Below it, a skeleton/pulse indicator appears until the first token arrives. Tool badges appear when `tools_used` event arrives. Answer text streams in progressively with a blinking cursor.

**Answer state:** Streaming cursor disappears on `done` event. Expandable sources card appears below the answer. Feedback row (thumbs up/down + report) appears. Input bar placeholder changes to "Ask another question..."

**Rate limit state:** Counter in panel header shows "X of Y remaining". When limit reached, input is disabled. Message: "Daily limit reached. Resets at midnight." Free-tier users see an "Upgrade for more" link.

**Error state:** Network errors or edge function failures show an inline error message with a "Try again" button. Does not consume a rate limit query.

### Icons

All icons use Lucide React (already in the project). No emojis anywhere in the UI.

## Testing

### Edge Function

- Unit tests for shared modules (tool executor, rule lookup, prompt builder, response formatter)
- Integration test for rate limiting logic
- Integration test for user-scoped dog resolution
- Test SSE stream format

### Frontend

- `AskQPanel`: open/close behavior, renders child components
- `AskQInput`: submit handler, disabled when rate limited, disabled while streaming
- `AskQAnswer`: renders streamed text progressively, shows tool badges, blinking cursor during stream
- `AskQSources`: expand/collapse, renders correct source types
- `AskQFeedback`: thumbs up/down calls service, report issue flow
- `AskQExampleQueries`: clicking a chip populates and submits the query
- `useAskQ`: SSE stream parsing, token accumulation, error handling, rate limit tracking
- `askqService`: edge function invocation, feedback submission

## Deployment

1. Extract shared modules to `supabase/functions/_shared/askq/`
2. Refactor `ask-myk9q` to import from shared modules (backwards-compatible)
3. Create `ask-myk9show` edge function
4. Run database migration (add columns + create `user_guide` table)
5. Deploy edge functions: `supabase functions deploy ask-myk9show --no-verify-jwt` and redeploy `ask-myk9q`
6. Deploy frontend via normal Vercel pipeline

## Open Questions

None — all decisions resolved during brainstorming.
