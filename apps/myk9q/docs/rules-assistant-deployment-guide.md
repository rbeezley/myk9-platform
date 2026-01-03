# Rules Assistant Deployment Guide

Complete guide for deploying the AKC Rules Assistant feature to production.

## ✅ Phase 1 & 2: Complete

**Database Schema & Data Population**
- ✅ Migration applied to production (`20251123_create_rules_assistant_schema.sql`)
- ✅ 16 AKC Scent Work rules loaded into database
- ✅ Full-text search indexes created and working
- ✅ Row Level Security (RLS) policies configured for public read access

## 📝 Phase 3: Edge Function (Current)

### What We Built

**Edge Function**: `supabase/functions/search-rules/index.ts`
- AI-powered natural language query understanding using Claude Haiku
- PostgreSQL full-text search with smart filtering
- Automatic extraction of level/element filters from queries
- Structured responses with measurements and citations

### Deployment Steps

#### 1. Install Supabase CLI (if not already installed)
```bash
npm install -g supabase
```

#### 2. Login to Supabase
```bash
supabase login
```

#### 3. Link your project
```bash
cd d:\AI-Projects\myK9Q-React-new
supabase link --project-ref <your-project-ref>
```

**How to get your project ref:**
- Go to your Supabase dashboard
- Select your project
- Look at the URL: `https://supabase.com/dashboard/project/<project-ref>`
- Or find it in Settings → General → Reference ID

#### 4. Get your Anthropic API Key
1. Go to https://console.anthropic.com/
2. Sign up/login
3. Navigate to API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

#### 5. Set the Anthropic API key as a secret
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

#### 6. Deploy the Edge Function
```bash
supabase functions deploy search-rules
```

**Expected output:**
```
Deploying Function search-rules...
Function URL: https://your-project.supabase.co/functions/v1/search-rules
```

#### 7. Test the deployed function

**Option A: Using curl**
```bash
curl -X POST https://your-project.supabase.co/functions/v1/search-rules \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "what is the area size for exterior advanced?"}'
```

**Option B: Using the test script**
```bash
# Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are in .env.local
deno run --allow-net --allow-env supabase/functions/search-rules/test.ts
```

### Verification

After deployment, verify the function is working:

1. **Check function logs:**
```bash
supabase functions logs search-rules
```

2. **Test with these queries:**
   - "what is the area size for exterior advanced?"
   - "how many hides in master buried?"
   - "time limit for novice container"

3. **Expected response format:**
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
    "id": "uuid",
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

### Cost Monitoring

**Claude Haiku Costs** (as of 2024):
- Input: $0.25 per million tokens
- Output: $1.25 per million tokens
- Average per query: ~$0.00014
- 15,000 queries/year = ~$2-3/year

**Monitor usage:**
1. Anthropic Console: https://console.anthropic.com/settings/usage
2. Track API key usage and costs
3. Set up billing alerts if needed

### Troubleshooting

**Error: "ANTHROPIC_API_KEY not configured"**
- Solution: Run `supabase secrets set ANTHROPIC_API_KEY=your-key`
- Verify: `supabase secrets list`

**Error: "Database error"**
- Check if migration was applied: Look in Supabase dashboard → Database → Tables
- Should see: `rule_organizations`, `rule_sports`, `rulebooks`, `rules`
- Check if rules exist: `SELECT COUNT(*) FROM rules;` (should return 16)

**Error: "Failed to parse Claude response"**
- Check Anthropic API key is valid
- Check API rate limits haven't been exceeded
- View Edge Function logs: `supabase functions logs search-rules`

**No results returned**
- Check full-text search vector is populated:
  ```sql
  SELECT title, search_vector FROM rules LIMIT 1;
  ```
- Search vector should have tsvector data, not null

## 🎨 Phase 4: Frontend (Next Steps)

After successful Edge Function deployment, the next phase is:

### 4.1 Frontend Service Layer
Create `src/services/rulesService.ts`:
- API client for search-rules Edge Function
- Online/offline detection
- IndexedDB caching for offline support
- Background sync when coming online

### 4.2 UI Components
Create `src/components/RulesAssistant/`:
- `RulesAssistant.tsx` - Main slide-out panel (matching Inbox UX)
- `RulesSearchBar.tsx` - Search input with debouncing
- `RulesFilters.tsx` - Level/Element filter chips
- `RulesResults.tsx` - Results list with citations
- `RuleDetailCard.tsx` - Expandable rule card with measurements

### 4.3 Integration
- Add Rules Assistant button to hamburger menu
- Add keyboard shortcut (Ctrl+K or Cmd+K)
- Implement search history
- Add analytics tracking

## 📊 Success Metrics

Track these after deployment:

1. **Usage Metrics**
   - Number of queries per day
   - Average queries per user
   - Most common search terms

2. **Performance Metrics**
   - Average response time (target: <500ms)
   - Error rate (target: <1%)
   - Cache hit rate for offline

3. **User Satisfaction**
   - Query success rate (results found)
   - User feedback/ratings
   - Feature adoption rate

## 🚀 Rollout Strategy

**Phase 3 (Edge Function):**
1. Deploy to production (today)
2. Test with internal users (judges/administrators)
3. Monitor costs and performance for 1 week

**Phase 4 (Frontend - Week 1):**
1. Build service layer
2. Create basic UI components
3. Internal alpha testing

**Phase 5 (Polish & Launch - Week 2):**
1. Add offline support
2. Implement search history
3. Beta release to selected shows
4. Gather feedback

**Phase 6 (Full Launch - Week 3):**
1. Public announcement
2. User documentation
3. Monitor adoption
4. Iterate based on feedback

## 📝 Documentation Links

- [Edge Function README](../supabase/functions/search-rules/README.md)
- [Implementation Plan](./akc-rules-assistant-implementation-plan.md)
- [Database Migration](../supabase/migrations/20251123_create_rules_assistant_schema.sql)
- [Test Script](../supabase/functions/search-rules/test.ts)

## 🆘 Support

**Questions or issues?**
- Check Edge Function logs: `supabase functions logs search-rules --tail`
- Check database: Supabase dashboard → Database → Table Editor
- Review this deployment guide
- Check Supabase docs: https://supabase.com/docs/guides/functions
