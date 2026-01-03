# Search Rules Edge Function

AI-powered natural language search for AKC Scent Work rules using Claude Haiku.

## Features

- **Natural Language Understanding**: Uses Claude Haiku to analyze queries
- **Smart Filtering**: Automatically extracts level and element filters from queries
- **PostgreSQL Full-Text Search**: Fast, indexed search with relevance ranking
- **Cost-Effective**: ~$0.00014 per query using Claude Haiku

## API

### Endpoint
```
POST https://your-project.supabase.co/functions/v1/search-rules
```

### Request Body
```json
{
  "query": "what is the area size for exterior advanced?",
  "limit": 5,          // optional, default: 5
  "level": "Advanced",  // optional override: Novice|Advanced|Excellent|Master
  "element": "Exterior" // optional override: Container|Interior|Exterior|Buried
}
```

### Response
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
  "results": [
    {
      "id": "uuid",
      "section": "Chapter 7, Section 6",
      "title": "Exterior Advanced Requirements",
      "content": "The search area must be at least 400 and no more than 600 square feet...",
      "categories": {
        "level": "Advanced",
        "element": "Exterior"
      },
      "keywords": ["advanced", "exterior", "area", "size"],
      "measurements": {
        "min_area_sq_ft": 400,
        "max_area_sq_ft": 600
      }
    }
  ],
  "count": 1
}
```

## Environment Variables

Required in Supabase project settings:

- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude Haiku
- `SUPABASE_URL` - Auto-provided by Supabase
- `SUPABASE_SERVICE_ROLE_KEY` - Auto-provided by Supabase

## Deployment

### 1. Install Supabase CLI
```bash
npm install -g supabase
```

### 2. Login to Supabase
```bash
supabase login
```

### 3. Link your project
```bash
supabase link --project-ref your-project-ref
```

### 4. Set environment variables
```bash
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-key
```

### 5. Deploy the function
```bash
supabase functions deploy search-rules
```

## Local Testing

### 1. Start local Supabase
```bash
supabase start
```

### 2. Create .env file in supabase/functions/search-rules/
```
ANTHROPIC_API_KEY=your-key-here
```

### 3. Serve function locally
```bash
supabase functions serve search-rules --env-file supabase/functions/search-rules/.env
```

### 4. Test with curl
```bash
curl -X POST http://localhost:54321/functions/v1/search-rules \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "what is the area size for exterior advanced?"}'
```

## Example Queries

- "what is the area size for exterior advanced?"
- "how many hides in master buried?"
- "time limit for novice container"
- "can I use a retractable leash?"
- "what are the requirements for interior excellent?"

## Cost Analysis

- **Claude Haiku**: ~$0.00014 per query (input: ~100 tokens, output: ~50 tokens)
- **PostgreSQL Search**: Free (included in Supabase)
- **Estimated Annual Cost**: ~$2-3 for 15,000 queries

## Performance

- **Average Response Time**: 200-400ms
- **AI Analysis**: ~100ms
- **Database Search**: ~50-100ms
- **Network Overhead**: ~50-200ms
