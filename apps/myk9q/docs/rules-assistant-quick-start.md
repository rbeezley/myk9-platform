# Rules Assistant Quick Start Guide

## Current Status

✅ **Phase 1 & 2: Complete**
- Database schema created and migrated
- 16 AKC Scent Work rules loaded into production database
- Full-text search working

✅ **Phase 3: Code Complete**
- Edge Function created: `supabase/functions/search-rules/index.ts`
- Documentation and test scripts ready
- **Ready to deploy!**

## Deploy in 3 Steps

### Step 1: Get Your Anthropic API Key

1. Visit: https://console.anthropic.com/settings/keys
2. Sign up or log in to your Anthropic account
3. Click "Create Key"
4. Copy the API key (starts with `sk-ant-`)
5. Open `.env.local` and replace:
   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```
   with your actual key:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```

**Cost**: ~$0.00014 per query (~$2-3/year for typical usage)

### Step 2: Run the Deployment Script

Open Command Prompt in the project root and run:

```bash
cd d:\AI-Projects\myK9Q-React-new
scripts\deploy-rules-assistant.bat
```

The script will:
1. Check your ANTHROPIC_API_KEY is set
2. Set it as a Supabase secret
3. Deploy the Edge Function
4. Show you how to test it

### Step 3: Test the Deployment

Run the test script:

```bash
deno run --allow-net --allow-env supabase/functions/search-rules/test.ts
```

Expected output:
```
✅ Success (250ms)

📊 Analysis:
   Search Terms: "area size"
   Level Filter: Advanced
   Element Filter: Exterior
   Intent: User wants to know the search area size requirements

📚 Results (1):
   1. Exterior Advanced Requirements
      Section: Chapter 7, Section 6
      Level: Advanced
      Element: Exterior
      Measurements: {"min_area_sq_ft":400,"max_area_sq_ft":600}
```

## Troubleshooting

### "Supabase CLI not logged in"

Run:
```bash
supabase login
```

### "Project not linked"

Run:
```bash
supabase link --project-ref yyzgjyiqgmjzyhzkqdfx
```

### "Config parsing failed"

Your Supabase CLI may be outdated. The CLI was refactored to not support npm installation.
Install via:
- **Windows (Scoop)**: `scoop install supabase`
- **Windows (Chocolatey)**: `choco install supabase`
- **Manual**: Download from https://github.com/supabase/cli/releases

### "ANTHROPIC_API_KEY not configured"

Make sure you:
1. Added the key to `.env.local`
2. Ran the deployment script (not manual deploy)
3. The key starts with `sk-ant-`

## What's Next?

After successful deployment, move to **Phase 4: Frontend Implementation**

You'll build:
1. **Service Layer** - `src/services/rulesService.ts` (API client)
2. **UI Components** - RulesAssistant slide-out panel
3. **Offline Support** - IndexedDB fallback search
4. **Integration** - Add to hamburger menu with keyboard shortcut

See [Full Deployment Guide](./rules-assistant-deployment-guide.md) for more details.

## Need Help?

- View Edge Function logs: `supabase functions logs search-rules --tail`
- Check database: Supabase dashboard → Database → Table Editor → rules
- Review [Implementation Plan](./akc-rules-assistant-implementation-plan.md)
