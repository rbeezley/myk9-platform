// @deno-types="npm:@types/node"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://myk9q.com",
  "https://www.myk9q.com",
  "https://app.myk9q.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
];

/**
 * Get CORS headers with dynamic origin checking
 */
function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  // Check if the request origin is in our allowed list
  const origin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
    ? requestOrigin
    : ALLOWED_ORIGINS[0]; // Default to production

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

interface SearchRequest {
  query: string;
  limit?: number;
  level?: string;
  element?: string;
  organizationCode?: string;  // 'AKC', 'UKC', etc.
  sportCode?: string;          // 'scent-work', 'nosework', etc.
}

interface Rule {
  id: string;
  section: string;
  title: string;
  content: string;
  categories: {
    level?: string;
    element?: string;
  };
  keywords: string[];
  measurements: Record<string, any>;
}

interface QueryAnalysis {
  searchTerms: string;
  filters: {
    level?: string;
    element?: string;
  };
  intent: string;
}

/**
 * Use Claude Haiku to analyze the natural language query
 */
async function analyzeQuery(query: string, anthropicKey: string): Promise<QueryAnalysis> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are analyzing a query about AKC Scent Work rules. Extract:
1. Search terms: The SPECIFIC TOPIC being asked about (e.g., "area size", "time limit", "number of hides", "leash requirements")
2. Level filter: Extract if mentioned (Novice, Advanced, Excellent, or Master)
3. Element filter: Extract if mentioned (Container, Interior, Exterior, or Buried)
4. Intent: What the user wants to know

Query: "${query}"

Respond ONLY with valid JSON (no markdown):
{
  "searchTerms": "specific keywords for the topic",
  "filters": {
    "level": null,
    "element": null
  },
  "intent": "brief description"
}

Rules:
- searchTerms should be the SPECIFIC TOPIC, not generic phrases like "AKC rules"
- Extract level/element and set to the exact name (e.g., "Advanced", "Exterior")
- If not mentioned, leave as null
- Use exact capitalization: Novice, Advanced, Excellent, Master, Container, Interior, Exterior, Buried

Examples:
- "what is the area size for exterior advanced?" → searchTerms: "area size"
- "how many hides in master buried?" → searchTerms: "hides"
- "time limit for novice" → searchTerms: "time limit"`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("Anthropic API error:", errorBody);
    throw new Error(`Claude API error: ${response.statusText} - ${errorBody}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  console.log("Claude response:", content);

  // Extract JSON from response (Claude may wrap it in markdown)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse Claude response");
  }

  const parsed = JSON.parse(jsonMatch[0]);
  console.log("Parsed analysis:", JSON.stringify(parsed, null, 2));
  return parsed;
}

/**
 * Extract a concise answer from the found rules using Claude
 */
async function extractAnswer(
  query: string,
  rules: Rule[],
  anthropicKey: string
): Promise<string> {
  if (rules.length === 0) {
    return "No relevant rules found to answer this question.";
  }

  // Prepare rule context for Claude (MEASUREMENTS FIRST, then content)
  const ruleContext = rules.map((rule, idx) => {
    let context = `Rule ${idx + 1}: ${rule.title}`;

    // Add measurements FIRST if present - this is the authoritative source
    if (rule.measurements && Object.keys(rule.measurements).length > 0) {
      context += "\n\n**AUTHORITATIVE MEASUREMENTS (use ONLY these for numerical answers):**";
      Object.entries(rule.measurements).forEach(([key, value]) => {
        const labels: Record<string, string> = {
          min_area_sq_ft: 'Min Area',
          max_area_sq_ft: 'Max Area',
          time_limit_minutes: 'Time Limit',
          min_height_inches: 'Min Height',
          max_height_inches: 'Max Height',
          min_hides: 'Min Hides',
          max_hides: 'Max Hides',
          hides_known: 'Hides Known to Handler',
          num_containers: 'Containers',
          max_leash_length_feet: 'Max Leash',
          warning_seconds: 'Warning Time',
        };
        const units: Record<string, string> = {
          min_area_sq_ft: ' sq ft',
          max_area_sq_ft: ' sq ft',
          time_limit_minutes: ' minutes',
          min_height_inches: ' inches',
          max_height_inches: ' inches',
          max_leash_length_feet: ' feet',
          warning_seconds: ' seconds',
        };
        const label = labels[key] || key;
        const unit = units[key] || '';
        context += `\n- ${label}: ${value}${unit}`;
      });
    }

    // Add content AFTER measurements (warning: may contain confusing numbers)
    context += `\n\nFull rule text (descriptive only - do NOT extract numbers from here):\n${rule.content}`;

    return context;
  }).join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `You are an AKC Scent Work rules expert. Answer this question concisely based on the provided rules.

Question: "${query}"

Rules:
${ruleContext}

CRITICAL INSTRUCTIONS - READ CAREFULLY:

1. For ANY question asking for numbers or measurements (area size, time limit, number of hides, etc.):
   - ONLY use values from the "AUTHORITATIVE MEASUREMENTS" section
   - NEVER extract numbers from the "Full rule text" section
   - If measurements section shows "Min Hides: 1, Max Hides: 4", the answer is "1-4 hides"

2. Common mistake to AVOID:
   - ❌ WRONG: Reading "Eight of these boxes..." from descriptive text and saying "8 hides"
   - ✅ CORRECT: Reading "Min Hides: 1, Max Hides: 4" from measurements and saying "1-4 hides"

3. The descriptive text often mentions container counts (boxes, vessels) which are NOT the same as hide counts:
   - "16 tote boxes" = containers that HOLD hides, not the number of hides
   - "8 boxes with sand, 8 with water" = container composition, not hide count
   - ALWAYS use the measurements section for the actual hide count

4. If measurements show a range (min/max), include that AND note if "unknown":
   - Example: "1-4 hides, with the exact number unknown to the handler"

5. Provide a DIRECT, SPECIFIC answer (1-3 sentences max)

Examples of correct answers:
- "The time limit for Container Novice is 2 minutes."
- "Exterior Advanced has a search area between 400 and 1200 square feet."
- "Master Buried has 1-4 hides, with the exact number unknown to the handler."

Answer:`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error("Failed to extract answer from Claude");
    return "Found relevant rules but couldn't extract a specific answer.";
  }

  const data = await response.json();
  return data.content[0].text.trim();
}

/**
 * Search rules using PostgreSQL full-text search with filters
 */
async function searchRules(
  supabase: any,
  analysis: QueryAnalysis,
  organizationCode?: string,
  sportCode?: string,
  limit: number = 5
): Promise<Rule[]> {
  // Build query with rulebook filtering
  let query = supabase
    .from("rules")
    .select(`
      id,
      section,
      title,
      content,
      categories,
      keywords,
      measurements,
      rulebooks!inner(
        id,
        active,
        rule_organizations!inner(code),
        rule_sports!inner(code)
      )
    `);

  // Filter by active rulebook
  query = query.eq("rulebooks.active", true);

  // Filter by organization code if provided
  if (organizationCode) {
    query = query.eq("rulebooks.rule_organizations.code", organizationCode);
  }

  // Filter by sport code if provided
  if (sportCode) {
    query = query.eq("rulebooks.rule_sports.code", sportCode);
  }

  // Apply level filter if specified (use ->> for text comparison)
  if (analysis.filters.level) {
    query = query.eq("categories->>level", analysis.filters.level);
  }

  // Apply element filter if specified (use ->> for text comparison)
  if (analysis.filters.element) {
    query = query.eq("categories->>element", analysis.filters.element);
  }

  // Perform full-text search using PostgreSQL's websearch syntax
  if (analysis.searchTerms && analysis.searchTerms.trim().length > 0) {
    query = query.textSearch("search_vector", analysis.searchTerms, {
      type: "websearch",
      config: "english",
    });
  }

  // Limit results
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Database error: ${error.message}`);
  }

  // If no results with search terms, try again with just filters
  if ((!data || data.length === 0) && analysis.searchTerms && (analysis.filters.level || analysis.filters.element)) {
    console.log("No results with search terms, retrying with filters only");
    let fallbackQuery = supabase
      .from("rules")
      .select(`
        id,
        section,
        title,
        content,
        categories,
        keywords,
        measurements,
        rulebooks!inner(
          id,
          active,
          rule_organizations!inner(code),
          rule_sports!inner(code)
        )
      `);

    fallbackQuery = fallbackQuery.eq("rulebooks.active", true);

    if (organizationCode) {
      fallbackQuery = fallbackQuery.eq("rulebooks.rule_organizations.code", organizationCode);
    }
    if (sportCode) {
      fallbackQuery = fallbackQuery.eq("rulebooks.rule_sports.code", sportCode);
    }
    if (analysis.filters.level) {
      fallbackQuery = fallbackQuery.eq("categories->>level", analysis.filters.level);
    }
    if (analysis.filters.element) {
      fallbackQuery = fallbackQuery.eq("categories->>element", analysis.filters.element);
    }

    fallbackQuery = fallbackQuery.limit(limit);
    const fallbackResult = await fallbackQuery;

    if (!fallbackResult.error) {
      return fallbackResult.data || [];
    }
  }

  return data || [];
}

/**
 * Main Edge Function handler
 */
serve(async (req) => {
  // Get CORS headers based on request origin
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { query, limit = 5, level, element, organizationCode, sportCode }: SearchRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Query is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Analyze query with Claude Haiku
    console.log("Analyzing query:", query, organizationCode ? `(${organizationCode}/${sportCode})` : '');
    const analysis = await analyzeQuery(query, anthropicKey);
    console.log("Query analysis:", JSON.stringify(analysis, null, 2));

    // Override filters if explicitly provided
    if (level) analysis.filters.level = level;
    if (element) analysis.filters.element = element;

    // Search rules in database
    console.log("Searching rules with filters:", analysis.filters, organizationCode ? `org=${organizationCode}` : '', sportCode ? `sport=${sportCode}` : '');
    const rules = await searchRules(supabase, analysis, organizationCode, sportCode, limit);
    console.log(`Found ${rules.length} rules`);

    // Extract specific answer from the found rules
    console.log("Extracting answer from rules...");
    const answer = await extractAnswer(query, rules, anthropicKey);
    console.log("Extracted answer:", answer);

    // Log query for anonymous usage analytics (fire-and-forget, non-blocking)
    supabase
      .from("rules_query_log")
      .insert({
        query,
        results_count: rules.length,
        answer_generated: rules.length > 0,
        organization_code: organizationCode || null,
        sport_code: sportCode || null,
      })
      .then(() => console.log("Query logged"))
      .catch((err: Error) => console.error("Failed to log query:", err.message));

    // Return results
    return new Response(
      JSON.stringify({
        query,
        analysis,
        answer,
        results: rules,
        count: rules.length,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in search-rules function:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
