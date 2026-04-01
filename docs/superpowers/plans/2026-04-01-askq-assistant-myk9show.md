# AskQ Assistant for myK9Show — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the AskQ AI assistant from myK9Q to myK9Show with auth-scoped queries, streaming SSE responses, tiered rate limiting, and user feedback.

**Architecture:** New `ask-myk9show` edge function with shared tool logic extracted to `supabase/functions/_shared/askq/`. Frontend is a slide-over panel triggered from the app header, built with existing `SlideOverPanel` component. User's dogs resolved via `auth.uid()` → `people.auth_user_id` → `dogs.owner_id` chain.

**Tech Stack:** Supabase Edge Functions (Deno), Anthropic SDK (Claude Haiku 3.5), React, Zustand, Tailwind CSS, Lucide React, Vitest

**Spec:** `docs/superpowers/specs/2026-04-01-askq-assistant-myk9show-design.md`

---

## File Structure

### New Files

| File                                                       | Responsibility                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| `supabase/migrations/105_askq_myk9show.sql`                | DB migration: add columns to chatbot tables, create user_guide table |
| `supabase/functions/_shared/askq/types.ts`                 | Shared TypeScript types for AskQ                                     |
| `supabase/functions/_shared/askq/toolDefinitions.ts`       | 6 tool definitions (5 existing + user guide stub)                    |
| `supabase/functions/_shared/askq/toolExecutor.ts`          | Tool execution against Supabase                                      |
| `supabase/functions/_shared/askq/ruleLookup.ts`            | Full-text rules search + date parsing                                |
| `supabase/functions/_shared/askq/promptBuilder.ts`         | System prompt + Claude API call                                      |
| `supabase/functions/_shared/askq/responseFormatter.ts`     | Source collection + response building                                |
| `supabase/functions/ask-myk9show/index.ts`                 | Edge function: auth, rate limit, streaming, user-scoped queries      |
| `apps/myk9show/src/store/useAskQPanelStore.ts`             | Zustand store for panel open/close                                   |
| `apps/myk9show/src/components/askq/askq-config.ts`         | Example queries, rate limit constants                                |
| `apps/myk9show/src/services/askqService.ts`                | SSE stream fetch, feedback submission                                |
| `apps/myk9show/src/hooks/useAskQ.ts`                       | Core hook: stream reader, token accumulation, state management       |
| `apps/myk9show/src/components/askq/AskQExampleQueries.tsx` | Grouped example query chips                                          |
| `apps/myk9show/src/components/askq/AskQInput.tsx`          | Text input + send button                                             |
| `apps/myk9show/src/components/askq/AskQAnswer.tsx`         | Streaming answer + tool badges                                       |
| `apps/myk9show/src/components/askq/AskQSources.tsx`        | Expandable source cards                                              |
| `apps/myk9show/src/components/askq/AskQFeedback.tsx`       | Thumbs up/down + report                                              |
| `apps/myk9show/src/components/askq/AskQPanel.tsx`          | Composition: SlideOverPanel wrapper                                  |

### Modified Files

| File                                                       | Change                                              |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `apps/myk9q/supabase/functions/ask-myk9q/index.ts`         | Import from `_shared/askq/` instead of local files  |
| `apps/myk9q/supabase/functions/ask-myk9q/promptBuilder.ts` | Kept as myK9Q-specific wrapper, delegates to shared |
| `apps/myk9show/src/components/layout/AppHeader.tsx`        | Add AskQ icon button + profile dropdown item        |
| `apps/myk9show/src/components/layout/UnifiedAppLayout.tsx` | Render AskQPanel at layout level                    |

### Test Files

| File                                                                 | Tests                                              |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| `apps/myk9show/src/test/store/useAskQPanelStore.test.ts`             | Panel open/close state                             |
| `apps/myk9show/src/test/services/askqService.test.ts`                | SSE parsing, feedback submission                   |
| `apps/myk9show/src/test/hooks/useAskQ.test.ts`                       | Stream handling, rate limit tracking, error states |
| `apps/myk9show/src/test/components/askq/AskQExampleQueries.test.tsx` | Chip rendering, click handling                     |
| `apps/myk9show/src/test/components/askq/AskQInput.test.tsx`          | Submit, disabled states                            |
| `apps/myk9show/src/test/components/askq/AskQAnswer.test.tsx`         | Streaming text, tool badges                        |
| `apps/myk9show/src/test/components/askq/AskQSources.test.tsx`        | Expand/collapse, source types                      |
| `apps/myk9show/src/test/components/askq/AskQFeedback.test.tsx`       | Rating, report flow                                |
| `apps/myk9show/src/test/components/askq/AskQPanel.test.tsx`          | Panel composition, open/close                      |
| `apps/myk9show/src/test/components/layout/AppHeader-askq.test.tsx`   | AskQ button + dropdown item                        |

---

## Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/105_askq_myk9show.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 105_askq_myk9show.sql
-- Add user tracking columns to chatbot tables and create user_guide table

-- 1. Add columns to chatbot_query_log
ALTER TABLE chatbot_query_log
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS app_source TEXT NOT NULL DEFAULT 'myk9q',
  ADD COLUMN IF NOT EXISTS response_time_ms INTEGER;

-- Index for rate limiting queries (user + date)
CREATE INDEX IF NOT EXISTS idx_chatbot_query_log_user_daily
  ON chatbot_query_log (user_id, created_at)
  WHERE user_id IS NOT NULL;

-- 2. Add columns to chatbot_feedback (create if not exists — myK9Q uses rules_feedback)
CREATE TABLE IF NOT EXISTS chatbot_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_log_id UUID REFERENCES chatbot_query_log(id) ON DELETE CASCADE,
  question TEXT,
  ai_response TEXT,
  tools_used TEXT[],
  show_id BIGINT,
  license_key TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rating SMALLINT CHECK (rating IN (-1, 1)),
  report_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for chatbot_feedback
ALTER TABLE chatbot_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage chatbot_feedback"
  ON chatbot_feedback FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can insert chatbot_feedback"
  ON chatbot_feedback FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 3. Create user_guide table (empty, ready for content)
CREATE TABLE IF NOT EXISTS user_guide (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  search_vector tsvector,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_user_guide_search
  ON user_guide USING gin(search_vector);

-- Auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION update_user_guide_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.content, ''));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_guide_search_vector
  BEFORE INSERT OR UPDATE ON user_guide
  FOR EACH ROW
  EXECUTE FUNCTION update_user_guide_search_vector();

-- RLS: public read
ALTER TABLE user_guide ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read user_guide"
  ON user_guide FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Service role can manage user_guide"
  ON user_guide FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && supabase db push --dry-run` (or review SQL manually).
Expected: No errors. Three new objects: columns on `chatbot_query_log`, `chatbot_feedback` table, `user_guide` table.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/105_askq_myk9show.sql
git commit -m "feat: add database migration for AskQ myK9Show support

Add user_id, app_source, response_time_ms to chatbot_query_log.
Create chatbot_feedback table with user attribution and ratings.
Create empty user_guide table with full-text search for future content."
```

---

## Task 2: Extract Shared AskQ Modules

Extract the 6 shared modules from `apps/myk9q/supabase/functions/ask-myk9q/` into `supabase/functions/_shared/askq/`. These are mostly copies with minor adjustments to make them reusable.

**Files:**

- Create: `supabase/functions/_shared/askq/types.ts`
- Create: `supabase/functions/_shared/askq/toolDefinitions.ts`
- Create: `supabase/functions/_shared/askq/toolExecutor.ts`
- Create: `supabase/functions/_shared/askq/ruleLookup.ts`
- Create: `supabase/functions/_shared/askq/promptBuilder.ts`
- Create: `supabase/functions/_shared/askq/responseFormatter.ts`

- [ ] **Step 1: Create `supabase/functions/_shared/askq/types.ts`**

Copy from `apps/myk9q/supabase/functions/ask-myk9q/types.ts` (94 lines). Add `UserContext` and `AskQShowRequest` types for myK9Show:

```typescript
// After existing types, add:

export interface UserContext {
  userId: string;
  displayName: string | null;
  dogs: Array<{ id: string; name: string; callName: string | null; breed: string }>;
  showId: string | null;
  showName: string | null;
}

export interface AskQShowRequest {
  message: string;
  showId?: string;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  resetsAt: string; // ISO date string
}

export interface StreamEvent {
  event: 'tools_used' | 'sources' | 'token' | 'meta' | 'done' | 'error';
  data: unknown;
}
```

- [ ] **Step 2: Create `supabase/functions/_shared/askq/toolDefinitions.ts`**

Copy from `apps/myk9q/supabase/functions/ask-myk9q/toolDefinitions.ts` (136 lines). Add the `search_user_guide` tool definition:

```typescript
// After the search_entries tool (line 134), add:
{
  name: 'search_user_guide',
  description: 'Search the myK9Show user guide for how-to instructions and app help. Use when users ask how to do something in the app, or need help with features.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Search query for the user guide',
      },
    },
    required: ['query'],
  },
},
```

- [ ] **Step 3: Create `supabase/functions/_shared/askq/ruleLookup.ts`**

Copy from `apps/myk9q/supabase/functions/ask-myk9q/ruleLookup.ts` (125 lines). No changes needed — rule search and date parsing are already generic.

- [ ] **Step 4: Create `supabase/functions/_shared/askq/toolExecutor.ts`**

Copy from `apps/myk9q/supabase/functions/ask-myk9q/toolExecutor.ts` (421 lines). Add the `search_user_guide` handler and accept optional `UserContext`:

```typescript
// Add at the end, before executeTool():

async function executeSearchUserGuide(
  supabaseClient: SupabaseClient,
  input: { query: string }
): Promise<{ data: unknown[]; error?: string }> {
  try {
    const { data, error } = await supabaseClient
      .from('user_guide')
      .select('id, section, title, content')
      .textSearch('search_vector', input.query, { type: 'websearch' })
      .limit(5);

    if (error) {
      return { data: [], error: error.message };
    }

    if (!data || data.length === 0) {
      return {
        data: [],
        error:
          'The user guide is not yet available. Try asking about rules or your show data instead.',
      };
    }

    return { data };
  } catch (err) {
    return { data: [], error: `User guide search failed: ${err.message}` };
  }
}

// In executeTool(), add case:
//   case 'search_user_guide':
//     return executeSearchUserGuide(supabaseClient, toolInput);
```

Modify `executeTool()` to also accept an optional `userContext: UserContext | null` parameter. When provided and the user has dogs, inject dog IDs into entry queries. Specifically, in `executeGetEntryResults` and `executeSearchEntries`, if `userContext?.dogs` is provided and the query mentions the user's dog names, add `.in('dog_id', userContext.dogs.map(d => d.id))` filter.

- [ ] **Step 5: Create `supabase/functions/_shared/askq/promptBuilder.ts`**

Copy `callClaude()` function from `apps/myk9q/supabase/functions/ask-myk9q/promptBuilder.ts` (lines 152-183). Make the system prompt a parameter instead of hardcoded — each app provides its own prompt. Export the function signature:

```typescript
import type { ClaudeMessage, ToolDefinition } from './types.ts';

const MODEL = 'claude-3-5-haiku-20241022';
const MAX_TOKENS = 1024;

export async function callClaude(
  messages: ClaudeMessage[],
  apiKey: string,
  tools: ToolDefinition[],
  systemPrompt: string
): Promise<{
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  stop_reason: string;
}> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools,
      messages,
      system: systemPrompt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  return response.json();
}
```

Also export a streaming variant for myK9Show:

```typescript
export async function callClaudeStreaming(
  messages: ClaudeMessage[],
  apiKey: string,
  tools: ToolDefinition[],
  systemPrompt: string
): Promise<Response> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      tools,
      messages,
      system: systemPrompt,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  return response;
}
```

- [ ] **Step 6: Create `supabase/functions/_shared/askq/responseFormatter.ts`**

Copy from `apps/myk9q/supabase/functions/ask-myk9q/responseFormatter.ts` (49 lines). Add `search_user_guide` to the source mapping:

```typescript
// In collectSource(), add case:
case 'search_user_guide':
  if (result.data?.length > 0) {
    sources.guide = result.data;
  }
  break;
```

- [ ] **Step 7: Verify directory structure**

Run: `ls supabase/functions/_shared/askq/`
Expected: 6 files: `types.ts`, `toolDefinitions.ts`, `toolExecutor.ts`, `ruleLookup.ts`, `promptBuilder.ts`, `responseFormatter.ts`

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/_shared/askq/
git commit -m "feat: extract shared AskQ modules from ask-myk9q

Move types, tool definitions, tool executor, rule lookup, prompt builder,
and response formatter to _shared/askq/ for reuse across both apps.
Add search_user_guide tool stub and UserContext type for myK9Show."
```

---

## Task 3: Refactor ask-myk9q to Use Shared Modules

Update `apps/myk9q/supabase/functions/ask-myk9q/index.ts` to import from `_shared/askq/` instead of local files. Keep the myK9Q-specific system prompt in `promptBuilder.ts`.

**Files:**

- Modify: `apps/myk9q/supabase/functions/ask-myk9q/index.ts`
- Modify: `apps/myk9q/supabase/functions/ask-myk9q/promptBuilder.ts`
- Delete (contents moved to shared): `apps/myk9q/supabase/functions/ask-myk9q/types.ts`, `toolDefinitions.ts`, `toolExecutor.ts`, `ruleLookup.ts`, `responseFormatter.ts`

- [ ] **Step 1: Update imports in `index.ts`**

Replace local imports with shared module imports. The import path from `apps/myk9q/supabase/functions/ask-myk9q/` to `supabase/functions/_shared/askq/` needs to use the Supabase shared import convention. In Deno edge functions, shared modules are imported via relative path from the function directory.

Since `ask-myk9q` lives at `apps/myk9q/supabase/functions/ask-myk9q/`, but the shared modules are at `supabase/functions/_shared/askq/`, the import path depends on deployment structure. The shared modules need to be accessible from both function locations.

**Decision:** Since myK9Q functions are in `apps/myk9q/supabase/functions/` and myK9Show functions will use the root `supabase/functions/`, copy the shared modules to **both** locations or use a symlink. The cleanest approach: keep shared modules at root `supabase/functions/_shared/askq/` and update `ask-myk9q` to import from there. This requires moving `ask-myk9q` to the root `supabase/functions/` directory (same as other edge functions like `admin-delete-user`).

Update `apps/myk9q/supabase/functions/ask-myk9q/index.ts` imports:

```typescript
// Replace:
import type { ChatRequest, ChatResponse, ClaudeContentBlock } from './types.ts';
import { TOOLS } from './toolDefinitions.ts';
import { executeTool } from './toolExecutor.ts';
import { collectSource, buildChatResponse } from './responseFormatter.ts';
import { callClaude } from './promptBuilder.ts';

// With:
import type { ChatRequest, ChatResponse, ClaudeContentBlock } from '../../_shared/askq/types.ts';
import { TOOLS } from '../../_shared/askq/toolDefinitions.ts';
import { executeTool } from '../../_shared/askq/toolExecutor.ts';
import { collectSource, buildChatResponse } from '../../_shared/askq/responseFormatter.ts';
import { callClaude } from '../../_shared/askq/promptBuilder.ts';
```

Wait — the `ask-myk9q` function is deployed from `apps/myk9q/supabase/`. The root `supabase/` is a separate Supabase project. Check whether both apps use the same Supabase project ref (`sojmvhhwsjxmfistvzbe`). Per CLAUDE.md: "Unified Supabase project (myk9-platform) for both apps." So all edge functions deploy from the **root** `supabase/functions/`. The `ask-myk9q` function at `apps/myk9q/supabase/functions/` may be a legacy location or a copy.

**Verify first**, then adjust imports accordingly. If `ask-myk9q` is deployed from root, move it there. If from `apps/myk9q/`, symlink or copy shared modules.

- [ ] **Step 2: Keep myK9Q system prompt in local `promptBuilder.ts`**

Strip `promptBuilder.ts` to just export the myK9Q-specific `SYSTEM_PROMPT` constant. The `callClaude()` function now comes from shared:

```typescript
// apps/myk9q/supabase/functions/ask-myk9q/promptBuilder.ts
// Keep only the SYSTEM_PROMPT constant (lines 6-150 from original)
export const MYK9Q_SYSTEM_PROMPT = `You are AskQ, an AI assistant...`; // existing 150-line prompt
```

Update `index.ts` to pass the prompt to `callClaude()`:

```typescript
import { MYK9Q_SYSTEM_PROMPT } from './promptBuilder.ts';
// ...
const result = await callClaude(messages, anthropicKey, TOOLS, MYK9Q_SYSTEM_PROMPT);
```

- [ ] **Step 3: Delete redundant local files**

Remove `types.ts`, `toolDefinitions.ts`, `toolExecutor.ts`, `ruleLookup.ts`, `responseFormatter.ts` from the `ask-myk9q` directory since they are now in `_shared/askq/`.

- [ ] **Step 4: Test that ask-myk9q still works**

Deploy and test manually:

```bash
supabase functions deploy ask-myk9q --no-verify-jwt
```

Test with curl:

```bash
curl -X POST https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/ask-myk9q \
  -H "Content-Type: application/json" \
  -d '{"message": "What are the time limits?", "licenseKey": "test"}'
```

Expected: Same response format as before.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9q/supabase/functions/ask-myk9q/ supabase/functions/_shared/askq/
git commit -m "refactor: update ask-myk9q to use shared AskQ modules

Import types, tools, executor, rule lookup, and response formatter from
_shared/askq/. Keep myK9Q-specific system prompt locally. Backwards-compatible."
```

---

## Task 4: Create ask-myk9show Edge Function

The main new backend piece. Handles Supabase auth, rate limiting, user-scoped dog resolution, tool orchestration, and SSE streaming.

**Files:**

- Create: `supabase/functions/ask-myk9show/index.ts`

- [ ] **Step 1: Write the edge function**

```typescript
// supabase/functions/ask-myk9show/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  AskQShowRequest,
  ChatResponse,
  ClaudeContentBlock,
  UserContext,
  RateLimitInfo,
} from '../_shared/askq/types.ts';
import { TOOLS } from '../_shared/askq/toolDefinitions.ts';
import { executeTool } from '../_shared/askq/toolExecutor.ts';
import { collectSource } from '../_shared/askq/responseFormatter.ts';
import { callClaude, callClaudeStreaming } from '../_shared/askq/promptBuilder.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*', // Tighten in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const RATE_LIMITS = { free: 10, premium: 50 };

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const startTime = Date.now();

  try {
    // 1. Auth: extract user from Supabase token
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 2. Parse request
    const { message, showId } = (await req.json()) as AskQShowRequest;
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // 3. Rate limiting
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { count: todayCount } = await serviceClient
      .from('chatbot_query_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', new Date().toISOString().split('T')[0]);

    // Check subscription tier
    const { data: personData } = await serviceClient
      .from('people')
      .select('id, first_name, last_name, subscription_tier')
      .eq('auth_user_id', user.id)
      .single();

    const tier = personData?.subscription_tier === 'premium' ? 'premium' : 'free';
    const limit = RATE_LIMITS[tier];
    const used = todayCount ?? 0;

    if (used >= limit) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return new Response(
        JSON.stringify({
          error: 'Daily limit reached',
          remaining: 0,
          limit,
          resetsAt: tomorrow.toISOString(),
        }),
        { status: 429, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Resolve user context (dogs, show)
    const personId = personData?.id;
    const displayName = personData
      ? [personData.first_name, personData.last_name].filter(Boolean).join(' ')
      : null;

    let dogs: UserContext['dogs'] = [];
    if (personId) {
      const { data: dogData } = await serviceClient
        .from('dogs')
        .select('id, name, call_name, breed')
        .eq('owner_id', personId)
        .is('deleted_at', null);
      dogs = (dogData ?? []).map(d => ({
        id: d.id,
        name: d.name,
        callName: d.call_name,
        breed: d.breed,
      }));
    }

    let showName: string | null = null;
    if (showId) {
      const { data: showData } = await serviceClient
        .from('shows')
        .select('show_name')
        .eq('id', showId)
        .single();
      showName = showData?.show_name ?? null;
    }

    const userContext: UserContext = {
      userId: user.id,
      displayName,
      dogs,
      showId: showId ?? null,
      showName,
    };

    // 5. Build system prompt with user context
    const systemPrompt = buildMyK9ShowPrompt(userContext);

    // 6. Tool-calling loop (non-streaming — tools need DB access)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    const messages = [{ role: 'user' as const, content: message }];
    const toolsUsed: string[] = [];
    const sources: ChatResponse['sources'] = {};

    let result = await callClaude(messages, anthropicKey, TOOLS, systemPrompt);

    while (result.stop_reason === 'tool_use') {
      const assistantContent = result.content;
      messages.push({ role: 'assistant' as const, content: assistantContent });

      const toolResults: ClaudeContentBlock[] = [];
      for (const block of assistantContent) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name!);
          const toolResult = await executeTool(
            serviceClient,
            block.name!,
            block.input!,
            userContext
          );
          collectSource(block.name!, toolResult, sources);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id!,
            content: JSON.stringify(toolResult),
          });
        }
      }
      messages.push({ role: 'user' as const, content: toolResults });
      result = await callClaude(messages, anthropicKey, TOOLS, systemPrompt);
    }

    // 7. Stream the final text response via SSE
    const responseTimeMs = Date.now() - startTime;
    const remaining = limit - used - 1;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        // Send tools and sources first
        if (toolsUsed.length > 0) {
          send('tools_used', [...new Set(toolsUsed)]);
        }
        const hasAnySources = Object.values(sources).some(s => s && s.length > 0);
        if (hasAnySources) {
          send('sources', sources);
        }

        // Stream text tokens
        const textBlock = result.content.find(b => b.type === 'text');
        const fullText = textBlock?.text ?? '';
        // Send in small chunks for smooth streaming feel
        const CHUNK_SIZE = 4;
        for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
          send('token', fullText.slice(i, i + CHUNK_SIZE));
        }

        // Send metadata (includes queryLogId for feedback)
        send('meta', { remaining, limit, responseTimeMs, queryLogId: logRow?.id ?? null });
        send('done', {});

        controller.close();
      },
    });

    // 8. Log query and get ID for feedback
    const { data: logRow } = await serviceClient
      .from('chatbot_query_log')
      .insert({
        query: message,
        tools_used: [...new Set(toolsUsed)],
        user_id: user.id,
        app_source: 'myk9show',
        response_time_ms: responseTimeMs,
      })
      .select('id')
      .single();

    return new Response(stream, {
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('ask-myk9show error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});

function buildMyK9ShowPrompt(ctx: UserContext): string {
  let userPreamble = '';
  if (ctx.displayName) {
    userPreamble += `The user is ${ctx.displayName}. `;
  }
  if (ctx.dogs.length > 0) {
    const dogList = ctx.dogs
      .map(d => `${d.callName || d.name} (registered: ${d.name}, breed: ${d.breed})`)
      .join(', ');
    userPreamble += `Their dogs: ${dogList}. `;
    if (ctx.dogs.length > 1) {
      userPreamble += `When the user says "my dog" without specifying which one, ask them to clarify. `;
    }
  }
  if (ctx.showId && ctx.showName) {
    userPreamble += `The user is currently viewing show: "${ctx.showName}" (ID: ${ctx.showId}). Use this show context for queries unless they specify otherwise. `;
  }

  return `You are AskQ, an AI assistant for the myK9Show dog show management platform.

${userPreamble}

You help users with three types of questions:
1. RULES QUESTIONS — Use search_rules to look up official competition rules and regulations.
2. SHOW DATA QUESTIONS — Use get_class_summary, get_entry_results, get_trial_overview, or search_entries to query live show data.
3. APP HELP QUESTIONS — Use search_user_guide to find how-to instructions (when available).

DECISION LOGIC:
- If the question is about rules, regulations, requirements, or time limits → use search_rules
- If the question is about results, entries, classes, trials, or schedules → use show data tools
- If the question is about how to use the app → use search_user_guide
- If the question is general app help and search_user_guide returns no results, give a brief helpful answer based on your knowledge

TOOL USAGE:
- Always use tools when data is needed. Never guess or make up show data.
- For rules questions, rely on the "measurements" JSON field for numerical data, NOT descriptive text.
- When the user asks about "my dog" or "my results", use their dog information provided above.

RESPONSE STYLE:
- Be concise and direct. Lead with the answer.
- Format data clearly with bullet points or short lists.
- If no data is found, say so clearly and suggest what the user could try instead.
- Do not speculate about data that wasn't returned by tools.`;
}
```

- [ ] **Step 2: Test the edge function locally**

```bash
supabase functions serve ask-myk9show --env-file supabase/.env.local
```

Test with curl using a valid auth token:

```bash
curl -X POST http://localhost:54321/functions/v1/ask-myk9show \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <valid-jwt>" \
  -d '{"message": "What are the time limits for Excellent?"}'
```

Expected: SSE stream with `tools_used`, `sources`, `token` events, `meta`, and `done`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/ask-myk9show/
git commit -m "feat: create ask-myk9show edge function

Auth via Supabase JWT, tiered rate limiting (10 free / 50 premium),
user-scoped dog resolution, tool orchestration, SSE streaming response.
Imports shared modules from _shared/askq/."
```

---

## Task 5: Zustand Store for Panel State

**Files:**

- Create: `apps/myk9show/src/store/useAskQPanelStore.ts`
- Create: `apps/myk9show/src/test/store/useAskQPanelStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/store/useAskQPanelStore.test.ts
import { renderHook, act } from '@testing-library/react';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

describe('useAskQPanelStore', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('starts closed', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    expect(result.current.isOpen).toBe(false);
  });

  it('opens the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
  });

  it('closes the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.open());
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('toggles the panel', () => {
    const { result } = renderHook(() => useAskQPanelStore());
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/store/useAskQPanelStore.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the store**

```typescript
// apps/myk9show/src/store/useAskQPanelStore.ts
import { create } from 'zustand';

interface AskQPanelState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useAskQPanelStore = create<AskQPanelState>()(set => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set(state => ({ isOpen: !state.isOpen })),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/store/useAskQPanelStore.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/useAskQPanelStore.ts apps/myk9show/src/test/store/useAskQPanelStore.test.ts
git commit -m "feat: add Zustand store for AskQ panel open/close state"
```

---

## Task 6: AskQ Config and Service

**Files:**

- Create: `apps/myk9show/src/components/askq/askq-config.ts`
- Create: `apps/myk9show/src/services/askqService.ts`
- Create: `apps/myk9show/src/test/services/askqService.test.ts`

- [ ] **Step 1: Write the config file**

```typescript
// apps/myk9show/src/components/askq/askq-config.ts

export interface ExampleQuery {
  text: string;
  category: 'rules' | 'show-data' | 'app-help';
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  { text: 'What are the time limits for Excellent?', category: 'rules' },
  { text: 'Ring size requirements for Novice', category: 'rules' },
  { text: 'How did my dog do today?', category: 'show-data' },
  { text: 'Show me the trial schedule', category: 'show-data' },
  { text: 'What classes are running right now?', category: 'show-data' },
  { text: 'How many dogs qualified in Buried?', category: 'show-data' },
];

export const CATEGORY_LABELS: Record<ExampleQuery['category'], string> = {
  rules: 'Rules',
  'show-data': 'Show Data',
  'app-help': 'App Help',
};

export const RATE_LIMIT_DEFAULTS = {
  free: 10,
  premium: 50,
};
```

- [ ] **Step 2: Write the failing tests for askqService**

```typescript
// apps/myk9show/src/test/services/askqService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseSSEStream, submitFeedback } from '@/services/askqService';

describe('askqService', () => {
  describe('parseSSEStream', () => {
    it('parses tools_used event', async () => {
      const events: Array<{ event: string; data: unknown }> = [];
      const stream = createMockSSEStream([
        'event: tools_used\ndata: ["search_rules"]\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        events.push({ event, data });
      });

      expect(events[0]).toEqual({ event: 'tools_used', data: ['search_rules'] });
    });

    it('accumulates token events', async () => {
      const tokens: string[] = [];
      const stream = createMockSSEStream([
        'event: token\ndata: "Hello"\n\n',
        'event: token\ndata: " world"\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        if (event === 'token') tokens.push(data as string);
      });

      expect(tokens).toEqual(['Hello', ' world']);
    });

    it('parses meta event with rate limit info', async () => {
      let meta: unknown;
      const stream = createMockSSEStream([
        'event: meta\ndata: {"remaining":7,"limit":10,"responseTimeMs":1200}\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        if (event === 'meta') meta = data;
      });

      expect(meta).toEqual({ remaining: 7, limit: 10, responseTimeMs: 1200 });
    });

    it('parses sources event', async () => {
      let sources: unknown;
      const stream = createMockSSEStream([
        'event: sources\ndata: {"rules":[{"title":"Time limits"}]}\n\n',
        'event: done\ndata: {}\n\n',
      ]);

      await parseSSEStream(stream, (event, data) => {
        if (event === 'sources') sources = data;
      });

      expect(sources).toEqual({ rules: [{ title: 'Time limits' }] });
    });
  });

  describe('submitFeedback', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('calls supabase functions.invoke with correct payload', async () => {
      const mockInvoke = vi.fn().mockResolvedValue({ data: { success: true }, error: null });
      vi.mock('@/lib/supabase', () => ({
        supabase: {
          functions: { invoke: mockInvoke },
          from: vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: '123' }, error: null }),
              }),
            }),
          }),
        },
      }));

      // Re-import to get mocked version
      const { submitFeedback: fn } = await import('@/services/askqService');
      await fn({ queryLogId: 'log-1', rating: 1 });
    });
  });
});

// Helper to create a mock ReadableStream from SSE text chunks
function createMockSSEStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/test/services/askqService.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Write the service**

```typescript
// apps/myk9show/src/services/askqService.ts
import { supabase } from '@/lib/supabase';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-myk9show`;

export interface AskQRequest {
  message: string;
  showId?: string;
}

export interface AskQFeedback {
  queryLogId: string;
  rating?: 1 | -1;
  reportText?: string;
}

type SSECallback = (event: string, data: unknown) => void;

/**
 * Send a query to the AskQ edge function and receive an SSE stream.
 * Returns the ReadableStream for the caller to parse.
 */
export async function sendAskQQuery(request: AskQRequest): Promise<ReadableStream<Uint8Array>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(request),
  });

  if (response.status === 429) {
    const data = await response.json();
    throw new RateLimitError(data.remaining, data.limit, data.resetsAt);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  return response.body;
}

/**
 * Parse an SSE stream, calling the callback for each event.
 */
export async function parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: SSECallback
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete SSE messages (separated by double newlines)
      const messages = buffer.split('\n\n');
      buffer = messages.pop() ?? ''; // Keep incomplete message in buffer

      for (const msg of messages) {
        if (!msg.trim()) continue;

        let eventType = 'message';
        let eventData = '';

        for (const line of msg.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7);
          } else if (line.startsWith('data: ')) {
            eventData = line.slice(6);
          }
        }

        if (eventData) {
          try {
            const parsed = JSON.parse(eventData);
            onEvent(eventType, parsed);
          } catch {
            // If not valid JSON, pass as string
            onEvent(eventType, eventData);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Submit feedback (rating or report) for an AskQ response.
 */
export async function submitFeedback(feedback: AskQFeedback): Promise<void> {
  const { error } = await supabase.from('chatbot_feedback').insert({
    query_log_id: feedback.queryLogId,
    rating: feedback.rating,
    report_text: feedback.reportText,
    user_id: (await supabase.auth.getUser()).data.user?.id,
  });

  if (error) {
    throw new Error(`Failed to submit feedback: ${error.message}`);
  }
}

export class RateLimitError extends Error {
  remaining: number;
  limit: number;
  resetsAt: string;

  constructor(remaining: number, limit: number, resetsAt: string) {
    super('Daily limit reached');
    this.name = 'RateLimitError';
    this.remaining = remaining;
    this.limit = limit;
    this.resetsAt = resetsAt;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/services/askqService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/askq/askq-config.ts apps/myk9show/src/services/askqService.ts apps/myk9show/src/test/services/askqService.test.ts
git commit -m "feat: add AskQ config and SSE streaming service

Config with example queries and rate limit constants.
Service with SSE stream parser, query sender, and feedback submission."
```

---

## Task 7: useAskQ Hook

The core hook that manages query state, stream parsing, and rate limit tracking.

**Files:**

- Create: `apps/myk9show/src/hooks/useAskQ.ts`
- Create: `apps/myk9show/src/test/hooks/useAskQ.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/myk9show/src/test/hooks/useAskQ.test.ts
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAskQ } from '@/hooks/useAskQ';
import * as askqService from '@/services/askqService';
import { vi } from 'vitest';

vi.mock('@/services/askqService');

function createMockStream(
  events: Array<{ event: string; data: unknown }>
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const sseText = events
    .map(e => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText));
      controller.close();
    },
  });
}

describe('useAskQ', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAskQ());
    expect(result.current.status).toBe('idle');
    expect(result.current.answer).toBe('');
    expect(result.current.toolsUsed).toEqual([]);
    expect(result.current.sources).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('streams an answer from the service', async () => {
    const mockStream = createMockStream([
      { event: 'tools_used', data: ['search_rules'] },
      { event: 'token', data: 'Hello' },
      { event: 'token', data: ' world' },
      { event: 'meta', data: { remaining: 9, limit: 10, responseTimeMs: 500 } },
      { event: 'done', data: {} },
    ]);

    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAskQ());

    await act(async () => {
      await result.current.submitQuery('test question');
    });

    expect(result.current.answer).toBe('Hello world');
    expect(result.current.toolsUsed).toEqual(['search_rules']);
    expect(result.current.remaining).toBe(9);
    expect(result.current.status).toBe('done');
  });

  it('handles rate limit errors', async () => {
    vi.mocked(askqService.sendAskQQuery).mockRejectedValue(
      new askqService.RateLimitError(0, 10, '2026-04-02T00:00:00Z')
    );

    const { result } = renderHook(() => useAskQ());

    await act(async () => {
      await result.current.submitQuery('test');
    });

    expect(result.current.status).toBe('rate-limited');
    expect(result.current.remaining).toBe(0);
  });

  it('handles generic errors', async () => {
    vi.mocked(askqService.sendAskQQuery).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAskQ());

    await act(async () => {
      await result.current.submitQuery('test');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('Network error');
  });

  it('resets state on new query', async () => {
    const mockStream = createMockStream([
      { event: 'token', data: 'First answer' },
      { event: 'meta', data: { remaining: 8, limit: 10, responseTimeMs: 200 } },
      { event: 'done', data: {} },
    ]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream);

    const { result } = renderHook(() => useAskQ());

    await act(async () => {
      await result.current.submitQuery('first');
    });
    expect(result.current.answer).toBe('First answer');

    const mockStream2 = createMockStream([
      { event: 'token', data: 'Second' },
      { event: 'meta', data: { remaining: 7, limit: 10, responseTimeMs: 300 } },
      { event: 'done', data: {} },
    ]);
    vi.mocked(askqService.sendAskQQuery).mockResolvedValue(mockStream2);

    await act(async () => {
      await result.current.submitQuery('second');
    });
    expect(result.current.answer).toBe('Second');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useAskQ.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hook**

```typescript
// apps/myk9show/src/hooks/useAskQ.ts
import { useState, useCallback, useRef } from 'react';
import { sendAskQQuery, parseSSEStream, RateLimitError } from '@/services/askqService';
import type { AskQRequest } from '@/services/askqService';

export type AskQStatus = 'idle' | 'streaming' | 'done' | 'error' | 'rate-limited';

interface AskQState {
  status: AskQStatus;
  query: string;
  answer: string;
  toolsUsed: string[];
  sources: Record<string, unknown[]>;
  remaining: number | null;
  limit: number | null;
  queryLogId: string | null;
  error: string | null;
}

const INITIAL_STATE: AskQState = {
  status: 'idle',
  query: '',
  answer: '',
  toolsUsed: [],
  sources: {},
  remaining: null,
  limit: null,
  queryLogId: null,
  error: null,
};

export function useAskQ() {
  const [state, setState] = useState<AskQState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const submitQuery = useCallback(
    async (message: string, showId?: string) => {
      // Reset state for new query
      setState({
        ...INITIAL_STATE,
        query: message,
        status: 'streaming',
        remaining: state.remaining, // preserve last known remaining count
        limit: state.limit,
      });

      try {
        const request: AskQRequest = { message, showId };
        const stream = await sendAskQQuery(request);

        let answer = '';
        let toolsUsed: string[] = [];
        let sources: Record<string, unknown[]> = {};
        let remaining: number | null = state.remaining;
        let limit: number | null = state.limit;

        await parseSSEStream(stream, (event, data) => {
          switch (event) {
            case 'tools_used':
              toolsUsed = data as string[];
              setState(prev => ({ ...prev, toolsUsed }));
              break;
            case 'sources':
              sources = data as Record<string, unknown[]>;
              setState(prev => ({ ...prev, sources }));
              break;
            case 'token':
              answer += data as string;
              setState(prev => ({ ...prev, answer }));
              break;
            case 'meta': {
              const meta = data as {
                remaining: number;
                limit: number;
                responseTimeMs: number;
                queryLogId: string | null;
              };
              remaining = meta.remaining;
              limit = meta.limit;
              setState(prev => ({ ...prev, remaining, limit, queryLogId: meta.queryLogId }));
              break;
            }
            case 'done':
              setState(prev => ({ ...prev, status: 'done' }));
              break;
          }
        });
      } catch (err) {
        if (err instanceof RateLimitError) {
          setState(prev => ({
            ...prev,
            status: 'rate-limited',
            remaining: err.remaining,
            limit: err.limit,
            error: null,
          }));
        } else {
          setState(prev => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'An unexpected error occurred',
          }));
        }
      }
    },
    [state.remaining, state.limit]
  );

  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    submitQuery,
    reset,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/hooks/useAskQ.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useAskQ.ts apps/myk9show/src/test/hooks/useAskQ.test.ts
git commit -m "feat: add useAskQ hook for SSE stream handling and state management"
```

---

## Task 8: AskQExampleQueries Component

**Files:**

- Create: `apps/myk9show/src/components/askq/AskQExampleQueries.tsx`
- Create: `apps/myk9show/src/test/components/askq/AskQExampleQueries.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/askq/AskQExampleQueries.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { AskQExampleQueries } from '@/components/askq/AskQExampleQueries';

describe('AskQExampleQueries', () => {
  it('renders category headings', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Show Data')).toBeInTheDocument();
    expect(screen.getByText('App Help')).toBeInTheDocument();
  });

  it('renders example query chips', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.getByText('What are the time limits for Excellent?')).toBeInTheDocument();
    expect(screen.getByText('How did my dog do today?')).toBeInTheDocument();
  });

  it('calls onSelectQuery when a chip is clicked', async () => {
    const onSelect = vi.fn();
    const { user } = render(<AskQExampleQueries onSelectQuery={onSelect} />);

    await user.click(screen.getByText('How did my dog do today?'));
    expect(onSelect).toHaveBeenCalledWith('How did my dog do today?');
  });

  it('shows App Help as coming soon', () => {
    render(<AskQExampleQueries onSelectQuery={vi.fn()} />);
    expect(screen.getByText('Coming soon...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQExampleQueries.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
// apps/myk9show/src/components/askq/AskQExampleQueries.tsx
import { EXAMPLE_QUERIES, CATEGORY_LABELS, type ExampleQuery } from './askq-config';

interface AskQExampleQueriesProps {
  onSelectQuery: (query: string) => void;
}

const CATEGORIES: ExampleQuery['category'][] = ['rules', 'show-data', 'app-help'];

export function AskQExampleQueries({ onSelectQuery }: AskQExampleQueriesProps) {
  return (
    <div className="space-y-4">
      {CATEGORIES.map(category => {
        const queries = EXAMPLE_QUERIES.filter(q => q.category === category);
        const isAppHelp = category === 'app-help';

        return (
          <div key={category}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              {CATEGORY_LABELS[category]}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {isAppHelp ? (
                <span className="px-3 py-1.5 rounded-full text-xs bg-muted/50 text-muted-foreground/50">
                  Coming soon...
                </span>
              ) : (
                queries.map(query => (
                  <button
                    key={query.text}
                    onClick={() => onSelectQuery(query.text)}
                    className="px-3 py-1.5 rounded-full text-xs bg-muted hover:bg-muted/80 text-muted-foreground transition-colors cursor-pointer text-left"
                  >
                    {query.text}
                  </button>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQExampleQueries.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/askq/AskQExampleQueries.tsx apps/myk9show/src/test/components/askq/AskQExampleQueries.test.tsx
git commit -m "feat: add AskQExampleQueries component with grouped query chips"
```

---

## Task 9: AskQInput Component

**Files:**

- Create: `apps/myk9show/src/components/askq/AskQInput.tsx`
- Create: `apps/myk9show/src/test/components/askq/AskQInput.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/askq/AskQInput.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { AskQInput } from '@/components/askq/AskQInput';

describe('AskQInput', () => {
  it('renders with placeholder text', () => {
    render(<AskQInput onSubmit={vi.fn()} disabled={false} />);
    expect(screen.getByPlaceholderText('Ask about rules, your results, or the app...')).toBeInTheDocument();
  });

  it('calls onSubmit with trimmed query', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    await user.type(input, '  What is the time limit?  ');
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    expect(onSubmit).toHaveBeenCalledWith('What is the time limit?');
  });

  it('submits on Enter key', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    await user.type(input, 'test query{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('test query');
  });

  it('does not submit empty queries', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    await user.click(screen.getByRole('button', { name: 'Send query' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables input and button when disabled prop is true', () => {
    render(<AskQInput onSubmit={vi.fn()} disabled={true} />);

    expect(screen.getByPlaceholderText('Ask about rules, your results, or the app...')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send query' })).toBeDisabled();
  });

  it('clears input after submit', async () => {
    const onSubmit = vi.fn();
    const { user } = render(<AskQInput onSubmit={onSubmit} disabled={false} />);

    const input = screen.getByPlaceholderText('Ask about rules, your results, or the app...');
    await user.type(input, 'my question');
    await user.click(screen.getByRole('button', { name: 'Send query' }));

    expect(input).toHaveValue('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQInput.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
// apps/myk9show/src/components/askq/AskQInput.tsx
import { useState, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';

interface AskQInputProps {
  onSubmit: (query: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function AskQInput({
  onSubmit,
  disabled,
  placeholder = 'Ask about rules, your results, or the app...',
}: AskQInputProps) {
  const [value, setValue] = useState('');

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex gap-2 p-4 border-t">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1 rounded-lg bg-muted px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="Send query"
        className="w-10 h-10 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQInput.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/askq/AskQInput.tsx apps/myk9show/src/test/components/askq/AskQInput.test.tsx
git commit -m "feat: add AskQInput component with send button and keyboard submit"
```

---

## Task 10: AskQAnswer Component

**Files:**

- Create: `apps/myk9show/src/components/askq/AskQAnswer.tsx`
- Create: `apps/myk9show/src/test/components/askq/AskQAnswer.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/askq/AskQAnswer.test.tsx
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { AskQAnswer } from '@/components/askq/AskQAnswer';

describe('AskQAnswer', () => {
  it('renders the user query bubble', () => {
    render(<AskQAnswer query="How did Buddy do?" answer="" toolsUsed={[]} isStreaming={false} />);
    expect(screen.getByText('How did Buddy do?')).toBeInTheDocument();
  });

  it('renders the answer text', () => {
    render(
      <AskQAnswer
        query="test"
        answer="Buddy qualified in Excellent!"
        toolsUsed={[]}
        isStreaming={false}
      />,
    );
    expect(screen.getByText('Buddy qualified in Excellent!')).toBeInTheDocument();
  });

  it('shows tool badges', () => {
    render(
      <AskQAnswer
        query="test"
        answer="Answer text"
        toolsUsed={['search_rules', 'get_entry_results']}
        isStreaming={false}
      />,
    );
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('shows streaming cursor while streaming', () => {
    const { container } = render(
      <AskQAnswer query="test" answer="Partial ans" toolsUsed={[]} isStreaming={true} />,
    );
    expect(container.querySelector('[data-testid="streaming-cursor"]')).toBeInTheDocument();
  });

  it('hides streaming cursor when done', () => {
    const { container } = render(
      <AskQAnswer query="test" answer="Full answer" toolsUsed={[]} isStreaming={false} />,
    );
    expect(container.querySelector('[data-testid="streaming-cursor"]')).not.toBeInTheDocument();
  });

  it('shows loading skeleton when no answer yet and streaming', () => {
    render(<AskQAnswer query="test" answer="" toolsUsed={[]} isStreaming={true} />);
    expect(screen.getByTestId('answer-skeleton')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQAnswer.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
// apps/myk9show/src/components/askq/AskQAnswer.tsx

const TOOL_LABELS: Record<string, string> = {
  search_rules: 'Rules',
  get_class_summary: 'Classes',
  get_entry_results: 'Results',
  get_trial_overview: 'Trials',
  search_entries: 'Entries',
  search_user_guide: 'Guide',
};

interface AskQAnswerProps {
  query: string;
  answer: string;
  toolsUsed: string[];
  isStreaming: boolean;
}

export function AskQAnswer({ query, answer, toolsUsed, isStreaming }: AskQAnswerProps) {
  return (
    <div className="space-y-3">
      {/* User query bubble */}
      <div className="flex justify-end">
        <div className="bg-primary text-primary-foreground px-3.5 py-2.5 rounded-xl rounded-br-sm text-sm max-w-[85%]">
          {query}
        </div>
      </div>

      {/* AI answer */}
      <div>
        {answer ? (
          <div className="bg-muted/50 px-3.5 py-3 rounded-xl rounded-tl-sm">
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {answer}
              {isStreaming && (
                <span
                  data-testid="streaming-cursor"
                  className="inline-block w-1.5 h-4 bg-foreground/70 ml-0.5 animate-pulse align-text-bottom"
                />
              )}
            </p>

            {/* Tool badges */}
            {toolsUsed.length > 0 && (
              <div className="flex gap-1.5 mt-3">
                {toolsUsed.map(tool => (
                  <span
                    key={tool}
                    className="px-2 py-0.5 rounded-full text-[11px] bg-muted text-muted-foreground"
                  >
                    {TOOL_LABELS[tool] ?? tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : isStreaming ? (
          <div
            data-testid="answer-skeleton"
            className="bg-muted/50 px-3.5 py-3 rounded-xl rounded-tl-sm"
          >
            <div className="space-y-2 animate-pulse">
              <div className="h-3 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQAnswer.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/askq/AskQAnswer.tsx apps/myk9show/src/test/components/askq/AskQAnswer.test.tsx
git commit -m "feat: add AskQAnswer component with streaming cursor and tool badges"
```

---

## Task 11: AskQSources Component

**Files:**

- Create: `apps/myk9show/src/components/askq/AskQSources.tsx`
- Create: `apps/myk9show/src/test/components/askq/AskQSources.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/askq/AskQSources.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { AskQSources } from '@/components/askq/AskQSources';

describe('AskQSources', () => {
  const mockSources = {
    rules: [{ id: '1', title: 'Time Limits', section: '3.1', content: 'Novice: 3 minutes' }],
    entries: [
      { armband: '101', dog_name: 'Buddy', handler_name: 'John', placement: 1, qualification_status: 'Q' },
    ],
  };

  it('renders nothing when sources are empty', () => {
    const { container } = render(<AskQSources sources={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a collapsible card with source count', () => {
    render(<AskQSources sources={mockSources} />);
    expect(screen.getByText(/Sources \(2\)/)).toBeInTheDocument();
  });

  it('expands to show source details on click', async () => {
    const { user } = render(<AskQSources sources={mockSources} />);

    await user.click(screen.getByText(/Sources \(2\)/));

    expect(screen.getByText('Time Limits')).toBeInTheDocument();
    expect(screen.getByText('Buddy')).toBeInTheDocument();
  });

  it('collapses on second click', async () => {
    const { user } = render(<AskQSources sources={mockSources} />);

    await user.click(screen.getByText(/Sources \(2\)/));
    expect(screen.getByText('Time Limits')).toBeInTheDocument();

    await user.click(screen.getByText(/Sources \(2\)/));
    expect(screen.queryByText('Time Limits')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQSources.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
// apps/myk9show/src/components/askq/AskQSources.tsx
import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface AskQSourcesProps {
  sources: Record<string, unknown[]>;
}

const SOURCE_LABELS: Record<string, string> = {
  rules: 'Rules',
  classes: 'Classes',
  entries: 'Entries',
  trials: 'Trials',
  guide: 'Guide',
};

export function AskQSources({ sources }: AskQSourcesProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sourceEntries = Object.entries(sources).filter(([, items]) => items && items.length > 0);
  const totalCount = sourceEntries.reduce((sum, [, items]) => sum + items.length, 0);

  if (totalCount === 0) return null;

  return (
    <div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between bg-muted rounded-lg px-3.5 py-2.5 text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
      >
        <span>Sources ({totalCount})</span>
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-3 pl-1">
          {sourceEntries.map(([type, items]) => (
            <div key={type}>
              <p className="text-xs font-medium text-muted-foreground mb-1">
                {SOURCE_LABELS[type] ?? type}
              </p>
              <div className="space-y-1">
                {(items as Array<Record<string, unknown>>).map((item, i) => (
                  <SourceItem key={i} type={type} item={item} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceItem({ type, item }: { type: string; item: Record<string, unknown> }) {
  switch (type) {
    case 'rules':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p className="font-medium">{item.title as string}</p>
          {item.section && (
            <p className="text-muted-foreground mt-0.5">Section {item.section as string}</p>
          )}
        </div>
      );
    case 'entries':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border flex items-center justify-between">
          <span className="font-medium">{item.dog_name as string}</span>
          <div className="flex items-center gap-2">
            {item.placement && (
              <span className="text-muted-foreground">#{item.placement as number}</span>
            )}
            {item.qualification_status && (
              <span
                className={
                  item.qualification_status === 'Q'
                    ? 'text-green-600 dark:text-green-400 font-medium'
                    : 'text-muted-foreground'
                }
              >
                {item.qualification_status as string}
              </span>
            )}
          </div>
        </div>
      );
    case 'classes':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p className="font-medium">
            {item.element as string} {item.level as string}
          </p>
          <p className="text-muted-foreground">{item.class_status as string}</p>
        </div>
      );
    case 'trials':
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p className="font-medium">{item.trial_name as string}</p>
          <p className="text-muted-foreground">{item.trial_date as string}</p>
        </div>
      );
    default:
      return (
        <div className="text-xs bg-background rounded px-2.5 py-2 border">
          <p>{JSON.stringify(item)}</p>
        </div>
      );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQSources.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/askq/AskQSources.tsx apps/myk9show/src/test/components/askq/AskQSources.test.tsx
git commit -m "feat: add AskQSources component with expandable source cards"
```

---

## Task 12: AskQFeedback Component

**Files:**

- Create: `apps/myk9show/src/components/askq/AskQFeedback.tsx`
- Create: `apps/myk9show/src/test/components/askq/AskQFeedback.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/askq/AskQFeedback.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { AskQFeedback } from '@/components/askq/AskQFeedback';
import * as askqService from '@/services/askqService';

vi.mock('@/services/askqService');

describe('AskQFeedback', () => {
  it('renders thumbs up and down buttons', () => {
    render(<AskQFeedback queryLogId="log-1" />);
    expect(screen.getByLabelText('Helpful')).toBeInTheDocument();
    expect(screen.getByLabelText('Not helpful')).toBeInTheDocument();
  });

  it('calls submitFeedback with rating 1 on thumbs up', async () => {
    vi.mocked(askqService.submitFeedback).mockResolvedValue();
    const { user } = render(<AskQFeedback queryLogId="log-1" />);

    await user.click(screen.getByLabelText('Helpful'));

    expect(askqService.submitFeedback).toHaveBeenCalledWith({
      queryLogId: 'log-1',
      rating: 1,
    });
  });

  it('calls submitFeedback with rating -1 on thumbs down', async () => {
    vi.mocked(askqService.submitFeedback).mockResolvedValue();
    const { user } = render(<AskQFeedback queryLogId="log-1" />);

    await user.click(screen.getByLabelText('Not helpful'));

    expect(askqService.submitFeedback).toHaveBeenCalledWith({
      queryLogId: 'log-1',
      rating: -1,
    });
  });

  it('shows report issue link', () => {
    render(<AskQFeedback queryLogId="log-1" />);
    expect(screen.getByText('Report issue')).toBeInTheDocument();
  });

  it('disables buttons after rating', async () => {
    vi.mocked(askqService.submitFeedback).mockResolvedValue();
    const { user } = render(<AskQFeedback queryLogId="log-1" />);

    await user.click(screen.getByLabelText('Helpful'));

    expect(screen.getByLabelText('Helpful')).toBeDisabled();
    expect(screen.getByLabelText('Not helpful')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQFeedback.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
// apps/myk9show/src/components/askq/AskQFeedback.tsx
import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { submitFeedback } from '@/services/askqService';

interface AskQFeedbackProps {
  queryLogId: string | null;
}

export function AskQFeedback({ queryLogId }: AskQFeedbackProps) {
  const [submitted, setSubmitted] = useState<1 | -1 | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const handleRating = async (rating: 1 | -1) => {
    if (!queryLogId || submitted) return;
    setSubmitted(rating);
    try {
      await submitFeedback({ queryLogId, rating });
    } catch {
      // Silent failure — feedback is non-critical
    }
  };

  const handleReport = async () => {
    if (!queryLogId || !reportText.trim()) return;
    try {
      await submitFeedback({ queryLogId, reportText: reportText.trim() });
      setReportSubmitted(true);
      setShowReport(false);
    } catch {
      // Silent failure
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">Was this helpful?</span>
        <div className="flex gap-1.5">
          <button
            onClick={() => handleRating(1)}
            disabled={submitted !== null}
            aria-label="Helpful"
            className={`p-1.5 rounded-md transition-colors ${
              submitted === 1
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            } disabled:opacity-60`}
          >
            <ThumbsUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleRating(-1)}
            disabled={submitted !== null}
            aria-label="Not helpful"
            className={`p-1.5 rounded-md transition-colors ${
              submitted === -1
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-muted hover:bg-muted/80 text-muted-foreground'
            } disabled:opacity-60`}
          >
            <ThumbsDown className="h-3.5 w-3.5" />
          </button>
        </div>
        {!reportSubmitted && (
          <button
            onClick={() => setShowReport(!showReport)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground ml-auto transition-colors"
          >
            Report issue
          </button>
        )}
      </div>

      {showReport && (
        <div className="flex gap-2">
          <input
            type="text"
            value={reportText}
            onChange={e => setReportText(e.target.value)}
            placeholder="What went wrong?"
            className="flex-1 text-xs rounded-md bg-muted px-2.5 py-1.5 placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            onClick={handleReport}
            disabled={!reportText.trim()}
            className="text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQFeedback.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/askq/AskQFeedback.tsx apps/myk9show/src/test/components/askq/AskQFeedback.test.tsx
git commit -m "feat: add AskQFeedback component with rating and report issue"
```

---

## Task 13: AskQPanel Composition Component

Wraps all child components inside a `SlideOverPanel`. This is the main entry point.

**Files:**

- Create: `apps/myk9show/src/components/askq/AskQPanel.tsx`
- Create: `apps/myk9show/src/test/components/askq/AskQPanel.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/myk9show/src/test/components/askq/AskQPanel.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { AskQPanel } from '@/components/askq/AskQPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import * as askqService from '@/services/askqService';
import { act } from '@testing-library/react';

vi.mock('@/services/askqService');

describe('AskQPanel', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('does not render when panel is closed', () => {
    render(<AskQPanel />);
    expect(screen.queryByText('AskQ Assistant')).not.toBeInTheDocument();
  });

  it('renders when panel is open', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(screen.getByText('AskQ Assistant')).toBeInTheDocument();
  });

  it('shows example queries in empty state', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(screen.getByText('Rules')).toBeInTheDocument();
    expect(screen.getByText('Show Data')).toBeInTheDocument();
  });

  it('shows the input bar', () => {
    act(() => useAskQPanelStore.getState().open());
    render(<AskQPanel />);
    expect(
      screen.getByPlaceholderText('Ask about rules, your results, or the app...'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQPanel.test.tsx`
Expected: FAIL

- [ ] **Step 3: Write the component**

```tsx
// apps/myk9show/src/components/askq/AskQPanel.tsx
import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
import { useAskQ } from '@/hooks/useAskQ';
import { useSubscriptionGate } from '@/hooks/useSubscriptionGate';
import { AskQExampleQueries } from './AskQExampleQueries';
import { AskQInput } from './AskQInput';
import { AskQAnswer } from './AskQAnswer';
import { AskQSources } from './AskQSources';
import { AskQFeedback } from './AskQFeedback';
import { RATE_LIMIT_DEFAULTS } from './askq-config';
import { MessageSquare } from 'lucide-react';

export function AskQPanel() {
  const { isOpen, close } = useAskQPanelStore();
  const { isPremium } = useSubscriptionGate();
  const location = useLocation();
  const askq = useAskQ();

  // Extract showId from route if on a show page
  const showIdMatch = location.pathname.match(/\/(?:secretary\/)?shows\/([^/]+)/);
  const showId = showIdMatch?.[1] ?? undefined;

  const limit = isPremium ? RATE_LIMIT_DEFAULTS.premium : RATE_LIMIT_DEFAULTS.free;
  const remaining = askq.remaining ?? limit;

  const handleSubmit = useCallback(
    (query: string) => {
      askq.submitQuery(query, showId);
    },
    [askq.submitQuery, showId]
  );

  const isInputDisabled = askq.status === 'streaming' || askq.status === 'rate-limited';

  if (!isOpen) return null;

  return (
    <SlideOverPanel
      open={isOpen}
      onClose={close}
      title="AskQ Assistant"
      size="sm"
      headerActions={
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {remaining} of {limit} remaining
        </span>
      }
      footer={
        <AskQInput
          onSubmit={handleSubmit}
          disabled={isInputDisabled}
          placeholder={
            askq.status === 'rate-limited'
              ? 'Daily limit reached. Resets at midnight.'
              : askq.status === 'done'
                ? 'Ask another question...'
                : undefined
          }
        />
      }
    >
      <div className="space-y-4 p-4">
        {/* Show example queries when idle */}
        {askq.status === 'idle' && <AskQExampleQueries onSelectQuery={handleSubmit} />}

        {/* Show answer area when query is active */}
        {askq.query && (
          <>
            <AskQAnswer
              query={askq.query}
              answer={askq.answer}
              toolsUsed={askq.toolsUsed}
              isStreaming={askq.status === 'streaming'}
            />

            {askq.status === 'done' && (
              <>
                <AskQSources sources={askq.sources} />
                <AskQFeedback queryLogId={askq.queryLogId} />
              </>
            )}
          </>
        )}

        {/* Error state */}
        {askq.status === 'error' && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-3.5 py-2.5">
            <p>{askq.error}</p>
            <button
              onClick={() => askq.submitQuery(askq.query, showId)}
              className="mt-2 text-xs underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Rate limited state */}
        {askq.status === 'rate-limited' && (
          <div className="bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm rounded-lg px-3.5 py-2.5">
            <p>Daily limit reached. Resets at midnight.</p>
            {!isPremium && (
              <a href="/subscription" className="mt-1 text-xs underline block">
                Upgrade for more queries
              </a>
            )}
          </div>
        )}
      </div>
    </SlideOverPanel>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/test/components/askq/AskQPanel.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/askq/AskQPanel.tsx apps/myk9show/src/test/components/askq/AskQPanel.test.tsx
git commit -m "feat: add AskQPanel composition component with SlideOverPanel"
```

---

## Task 14: Integrate into AppHeader and Layout

Wire up the AskQ button in the header, add the profile dropdown item, and render the panel at the layout level.

**Files:**

- Modify: `apps/myk9show/src/components/layout/AppHeader.tsx`
- Modify: `apps/myk9show/src/components/layout/UnifiedAppLayout.tsx`
- Create: `apps/myk9show/src/test/components/layout/AppHeader-askq.test.tsx`

- [ ] **Step 1: Write the failing integration test**

```typescript
// apps/myk9show/src/test/components/layout/AppHeader-askq.test.tsx
import { screen } from '@testing-library/react';
import { render, userEvent } from '@/test/utils/testUtils';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';

// Mock the auth context to provide an authenticated user
vi.mock('@/hooks/useAuthContext', () => ({
  useAuthContext: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    hasRole: () => false,
    signOut: vi.fn(),
  }),
}));

describe('AppHeader AskQ integration', () => {
  beforeEach(() => {
    useAskQPanelStore.getState().close();
  });

  it('renders the AskQ button in the header', () => {
    render(<AppHeader />);
    expect(screen.getByLabelText('AskQ Assistant')).toBeInTheDocument();
  });

  it('opens the panel when the AskQ button is clicked', async () => {
    const { user } = render(<AppHeader />);

    await user.click(screen.getByLabelText('AskQ Assistant'));

    expect(useAskQPanelStore.getState().isOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/test/components/layout/AppHeader-askq.test.tsx`
Expected: FAIL — no element with label 'AskQ Assistant'

- [ ] **Step 3: Add AskQ button to AppHeader**

In `apps/myk9show/src/components/layout/AppHeader.tsx`:

Add import at top:

```typescript
import { MessageSquare } from 'lucide-react';
import { useAskQPanelStore } from '@/store/useAskQPanelStore';
```

Inside the component, add store access:

```typescript
const { toggle: toggleAskQ } = useAskQPanelStore();
```

Insert the AskQ button between the Theme Toggle button (line ~230) and the Profile Dropdown (line ~232). After the theme toggle `</Button>`:

```tsx
{
  /* AskQ Assistant */
}
<Button
  variant="ghost"
  size="sm"
  onClick={toggleAskQ}
  className="p-1.5 rounded-lg"
  aria-label="AskQ Assistant"
>
  <MessageSquare className="h-4 w-4" />
</Button>;
```

Add the AskQ item in the profile dropdown, after the Preferences item (line ~309) and before the role-specific section:

```tsx
<DropdownMenuItem onClick={toggleAskQ} className="w-full flex items-center gap-2 cursor-pointer">
  <MessageSquare className="h-4 w-4" />
  AskQ Assistant
</DropdownMenuItem>
```

- [ ] **Step 4: Add AskQPanel to UnifiedAppLayout**

In `apps/myk9show/src/components/layout/UnifiedAppLayout.tsx`:

Add import:

```typescript
import { AskQPanel } from '@/components/askq/AskQPanel';
```

Add `<AskQPanel />` as a sibling to the main content, after the closing tag of the authenticated layout block. Insert it right before the final return's closing fragment:

```tsx
{
  /* AskQ AI Assistant Panel */
}
<AskQPanel />;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/test/components/layout/AppHeader-askq.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Run full typecheck and lint**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck && pnpm lint`
Expected: PASS with no errors

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/layout/AppHeader.tsx apps/myk9show/src/components/layout/UnifiedAppLayout.tsx apps/myk9show/src/test/components/layout/AppHeader-askq.test.tsx
git commit -m "feat: integrate AskQ into AppHeader and UnifiedAppLayout

Add AskQ icon button between theme toggle and profile avatar.
Add AskQ item in profile dropdown menu.
Render AskQPanel at layout level for global access."
```

---

## Task 15: Deploy and End-to-End Verification

**Files:** No new files — deployment and verification only.

- [ ] **Step 1: Push database migration**

Run: `supabase db push`
Expected: Migration 105 applies cleanly.

- [ ] **Step 2: Deploy the new edge function**

Run: `supabase functions deploy ask-myk9show --no-verify-jwt`
Expected: Deployed successfully.

- [ ] **Step 3: Redeploy refactored ask-myk9q**

Run: `supabase functions deploy ask-myk9q --no-verify-jwt`
Expected: Deployed successfully. Existing myK9Q chatbot still works.

- [ ] **Step 4: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass, including the new AskQ tests.

- [ ] **Step 5: Run the dev server and test manually**

Run: `pnpm dev:show`

Test checklist:

1. Click AskQ button in header — panel opens
2. Click AskQ in profile dropdown — panel opens
3. Click a "Rules" example chip — query submits, answer streams in
4. Click a "Show Data" chip — query submits, tools used shown
5. Close panel with X button
6. Submit a query via text input + Enter key
7. Verify rate limit counter decrements
8. Verify thumbs up/down works
9. Verify sources expand/collapse

- [ ] **Step 6: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix: address issues found during manual AskQ testing"
```

---

## Summary

| Task      | Description                              | New Tests    |
| --------- | ---------------------------------------- | ------------ |
| 1         | Database migration                       | —            |
| 2         | Extract shared AskQ modules              | —            |
| 3         | Refactor ask-myk9q to use shared modules | —            |
| 4         | Create ask-myk9show edge function        | —            |
| 5         | Zustand panel store                      | 4            |
| 6         | AskQ config + service                    | 5            |
| 7         | useAskQ hook                             | 5            |
| 8         | AskQExampleQueries component             | 4            |
| 9         | AskQInput component                      | 6            |
| 10        | AskQAnswer component                     | 6            |
| 11        | AskQSources component                    | 4            |
| 12        | AskQFeedback component                   | 5            |
| 13        | AskQPanel composition                    | 4            |
| 14        | AppHeader + Layout integration           | 2            |
| 15        | Deploy + E2E verification                | —            |
| **Total** | **15 tasks**                             | **45 tests** |
