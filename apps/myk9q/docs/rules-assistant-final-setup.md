# Rules Assistant - Final Setup Steps

## ✅ What's Deployed

The `search-rules` Edge Function has been successfully deployed to your Supabase project!

- **Function ID**: 27ae203e-e556-4ff4-b394-0b5cf06543d0
- **Status**: ACTIVE
- **Version**: 1
- **URL**: `https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/search-rules`

## 🔑 Step 1: Set Your Anthropic API Key

The Edge Function needs your Anthropic API key to work. You have two options:

### Option A: Via Supabase Dashboard (Easiest)

1. Visit: https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx/settings/functions
2. Click on the **Edge Functions** section
3. Find **Secrets** or **Environment Variables**
4. Add a new secret:
   - Name: `ANTHROPIC_API_KEY`
   - Value: Your API key from https://console.anthropic.com/settings/keys (starts with `sk-ant-`)
5. Click **Save**

### Option B: Via Supabase CLI

If you have the Supabase CLI working and logged in:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-actual-key-here --project-ref yyzgjyiqgmjzyhzkqdfx
```

## ✅ Step 2: Get Your Anthropic API Key

If you don't have an Anthropic API key yet:

1. Visit: https://console.anthropic.com/settings/keys
2. Sign up or log in
3. Click **Create Key**
4. Copy the key (starts with `sk-ant-`)
5. Save it in `.env.local` for local testing:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```

**Cost**: ~$0.00014 per query (~$2-3/year for typical usage)

## 🧪 Step 3: Test the Edge Function

Once you've set the ANTHROPIC_API_KEY secret, test with curl:

```bash
curl -X POST https://yyzgjyiqgmjzyhzkqdfx.supabase.co/functions/v1/search-rules \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5emdqeWlxZ21qenloemtxZGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMjYzMzIsImV4cCI6MjA3MDYwMjMzMn0.vXgwI9HyBMiH-t6WP13unRgFVc9rg3khDRNdhIedWqs" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"what is the area size for exterior advanced?\"}"
```

**Expected response:**
```json
{
  "query": "what is the area size for exterior advanced?",
  "analysis": {
    "searchTerms": "area size",
    "filters": {
      "level": "Advanced",
      "element": "Exterior"
    },
    "intent": "User wants to know the search area size requirements"
  },
  "results": [{
    "id": "...",
    "section": "Chapter 7, Section 6",
    "title": "Exterior Advanced Requirements",
    "content": "...",
    "measurements": {
      "min_area_sq_ft": 400,
      "max_area_sq_ft": 600
    }
  }],
  "count": 1
}
```

### Test Queries to Try

1. "what is the area size for exterior advanced?"
2. "how many hides in master buried?"
3. "time limit for novice container"
4. "can I use a retractable leash?"
5. "what are the requirements for interior excellent?"

## 🔍 Monitoring

### View Edge Function Logs

**Via Dashboard:**
1. Go to: https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx/logs/edge-functions
2. Select `search-rules` function
3. View real-time logs

**Via CLI:**
```bash
supabase functions logs search-rules --project-ref yyzgjyiqgmjzyhzkqdfx
```

### Check Anthropic Usage

Monitor your API usage and costs at:
https://console.anthropic.com/settings/usage

## ❌ Troubleshooting

### Error: "ANTHROPIC_API_KEY not configured"
- Make sure you set the secret in Supabase (Step 1)
- Wait 30 seconds after setting the secret for it to propagate
- Try invoking the function again

### Error: "Query is required"
- Make sure your request body includes a `query` field
- Example: `{"query": "your search query here"}`

### Error: "Claude API error"
- Check your Anthropic API key is valid
- Verify you have credits/billing set up in Anthropic Console
- Check for rate limiting (wait and retry)

### No Results Returned
- The query might not match any rules
- Try simpler queries: "container novice", "area size", "time limit"
- Check database has rules: https://supabase.com/dashboard/project/yyzgjyiqgmjzyhzkqdfx/editor (should see 16 rules)

## 🎉 What's Next?

Once the Edge Function is working, proceed to **Phase 4: Frontend Implementation**

You'll build:
1. **Service Layer** - `src/services/rulesService.ts` (API client for the Edge Function)
2. **UI Components** - RulesAssistant slide-out panel with search interface
3. **Offline Support** - IndexedDB fallback for when users are offline
4. **Integration** - Add to hamburger menu with keyboard shortcut

See the [Full Deployment Guide](./rules-assistant-deployment-guide.md) for complete details.

## 📊 Summary

- ✅ Database: 16 AKC rules loaded with full-text search
- ✅ Edge Function: Deployed and active
- ⏳ Secret: Need to set ANTHROPIC_API_KEY (you do this)
- ⏳ Testing: Test after setting secret
- ⏳ Frontend: Next phase to build the UI
