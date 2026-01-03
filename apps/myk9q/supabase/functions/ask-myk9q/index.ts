// @deno-types="npm:@types/node"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================================
// CONFIGURATION
// =============================================================================

const ALLOWED_ORIGINS = [
  "https://myk9q.com",
  "https://www.myk9q.com",
  "https://app.myk9q.com",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
];

const CLAUDE_MODEL = "claude-3-5-haiku-20241022";
const MAX_TOKENS = 1024;

// =============================================================================
// TYPES
// =============================================================================

interface ChatRequest {
  message: string;
  licenseKey: string;
  organizationCode?: string;
  sportCode?: string;
}

interface ChatResponse {
  answer: string;
  toolsUsed: string[];
  sources?: {
    rules?: Rule[];
    classes?: ClassSummary[];
    entries?: EntryResult[];
    trials?: TrialSummary[];
  };
}

interface Rule {
  id: string;
  section: string;
  title: string;
  content: string;
  categories: { level?: string; element?: string };
  keywords: string[];
  measurements: Record<string, unknown>;
}

interface ClassSummary {
  class_id: number;
  element: string;
  level: string;
  section: string | null;
  judge_name: string | null;
  class_status: string;
  total_entries: number;
  scored_entries: number;
  checked_in_count: number;
  qualified_count: number;
  nq_count: number;
  trial_date: string;
  trial_name: string;
  briefing_time: string | null;
  start_time: string | null;
}

interface EntryResult {
  armband_number: string;
  call_name: string;
  handler: string;
  entry_status: string;
  result_status: string | null;
  time: number | null;
  faults: number | null;
  placement: number | null;
  is_scored: boolean;
  element: string;
  level: string;
}

interface TrialSummary {
  trial_id: string;
  trial_number: number;
  trial_date: string;
  trial_name: string;
  competition_type: string;
  show_name: string;
}

// Claude tool definitions
interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

// =============================================================================
// CORS HANDLING
// =============================================================================

function getCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin =
    requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-license-key",
  };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const TOOLS: ToolDefinition[] = [
  {
    name: "search_rules",
    description:
      "Search the rulebook for regulations, requirements, time limits, area sizes, hide counts, or procedures. Use for ANY question about rules or regulations.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for finding rules",
        },
        level: {
          type: "string",
          enum: ["Novice", "Advanced", "Excellent", "Master"],
          description: "Filter by competition level if mentioned",
        },
        element: {
          type: "string",
          enum: ["Container", "Interior", "Exterior", "Buried"],
          description: "Filter by element type if mentioned",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_class_summary",
    description:
      "Get summary of classes including entry counts, status, judges, and scoring progress. Use for questions about class schedules, how many dogs are entered, which classes are running, judges, etc.",
    input_schema: {
      type: "object",
      properties: {
        trial_date: {
          type: "string",
          description: "Filter by trial date (YYYY-MM-DD format)",
        },
        element: {
          type: "string",
          description: "Filter by element (e.g., Interior, Exterior, Container, Buried)",
        },
        level: {
          type: "string",
          description: "Filter by level (e.g., Novice, Advanced, Excellent, Master)",
        },
        class_status: {
          type: "string",
          enum: ["no-status", "setup", "briefing", "break", "in_progress", "completed"],
          description: "Filter by class status",
        },
      },
      required: [],
    },
  },
  {
    name: "get_entry_results",
    description:
      "Get entry results including placements, times, faults, and qualification status. Use for questions about results, placements, times, scores, who qualified, or specific dog/handler performance.",
    input_schema: {
      type: "object",
      properties: {
        element: {
          type: "string",
          description: "Filter by element (e.g., Interior, Exterior, Handler Discrimination)",
        },
        level: {
          type: "string",
          description: "Filter by level (e.g., Novice, Master)",
        },
        trial_date: {
          type: "string",
          description: "Filter by trial date. Accepts: day of week ('Saturday', 'Sunday'), US format ('9/16/2023', '09/16/2023'), or ISO format ('2023-09-16')",
        },
        armband_number: {
          type: "string",
          description: "Filter by armband number",
        },
        handler_name: {
          type: "string",
          description: "Filter by handler name (partial match)",
        },
        dog_name: {
          type: "string",
          description: "Filter by dog call name (partial match)",
        },
        result_status: {
          type: "string",
          enum: ["qualified", "nq", "absent", "excused"],
          description: "Filter by result status",
        },
        top_n: {
          type: "number",
          description: "Get top N placements (e.g., 3 for top 3)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_trial_overview",
    description:
      "Get overview of trials including dates, names, and competition types. Use for questions about trial schedule, what trials are happening, or general event info.",
    input_schema: {
      type: "object",
      properties: {
        trial_date: {
          type: "string",
          description: "Filter by specific date (YYYY-MM-DD)",
        },
      },
      required: [],
    },
  },
  {
    name: "search_entries",
    description:
      "Search for entries across all classes by dog name or handler name. Use when user asks about a specific dog or handler's entries or performance across multiple classes.",
    input_schema: {
      type: "object",
      properties: {
        dog_name: {
          type: "string",
          description: "Dog call name to search (partial match)",
        },
        handler_name: {
          type: "string",
          description: "Handler name to search (partial match)",
        },
      },
      required: [],
    },
  },
];

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

/**
 * Search rules using PostgreSQL full-text search (ported from search-rules-v2)
 */
async function executeSearchRules(
  params: { query: string; level?: string; element?: string },
  supabase: ReturnType<typeof createClient>,
  organizationCode?: string,
  sportCode?: string
): Promise<{ data: Rule[]; error?: string }> {
  try {
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

    // Filter by organization and sport
    if (organizationCode) {
      query = query.eq("rulebooks.rule_organizations.code", organizationCode);
    }
    if (sportCode) {
      query = query.eq("rulebooks.rule_sports.code", sportCode);
    }

    // Apply level/element filters
    if (params.level) {
      query = query.eq("categories->>level", params.level);
    }
    if (params.element) {
      query = query.eq("categories->>element", params.element);
    }

    // Full-text search
    if (params.query && params.query.trim().length > 0) {
      query = query.textSearch("search_vector", params.query, {
        type: "websearch",
        config: "english",
      });
    }

    query = query.limit(5);

    const { data, error } = await query;

    if (error) {
      console.error("Rules search error:", error);
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err) {
    console.error("Rules search exception:", err);
    return { data: [], error: String(err) };
  }
}

/**
 * Get class summary data
 */
async function executeGetClassSummary(
  params: {
    trial_date?: string;
    element?: string;
    level?: string;
    class_status?: string;
  },
  supabase: ReturnType<typeof createClient>,
  licenseKey: string
): Promise<{ data: ClassSummary[]; error?: string }> {
  try {
    let query = supabase
      .from("view_class_summary")
      .select(`
        class_id,
        element,
        level,
        section,
        judge_name,
        class_status,
        total_entries,
        scored_entries,
        checked_in_count,
        qualified_count,
        nq_count,
        trial_date,
        trial_name,
        briefing_time,
        start_time
      `)
      .eq("license_key", licenseKey);

    if (params.trial_date) {
      query = query.eq("trial_date", params.trial_date);
    }
    if (params.element) {
      query = query.ilike("element", `%${params.element}%`);
    }
    if (params.level) {
      query = query.ilike("level", `%${params.level}%`);
    }
    if (params.class_status) {
      query = query.eq("class_status", params.class_status);
    }

    query = query.order("trial_date").order("class_order").limit(50);

    const { data, error } = await query;

    if (error) {
      console.error("Class summary error:", error);
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err) {
    console.error("Class summary exception:", err);
    return { data: [], error: String(err) };
  }
}

/**
 * Parse various date formats and convert to ISO format (YYYY-MM-DD)
 * Supports:
 * - Day of week: "Saturday", "Sunday", "Sat", "Sun"
 * - US format: "9/16/2023", "09/16/2023", "9-16-2023"
 * - ISO format: "2023-09-16" (passed through)
 */
async function parseAndResolveDate(
  dateInput: string,
  supabase: ReturnType<typeof createClient>,
  licenseKey: string
): Promise<string | null> {
  const input = dateInput.trim();

  // Already ISO format (YYYY-MM-DD)
  if (input.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return input;
  }

  // US format: M/D/YYYY or MM/DD/YYYY (with / or - separator)
  const usDateMatch = input.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (usDateMatch) {
    const month = usDateMatch[1].padStart(2, "0");
    const day = usDateMatch[2].padStart(2, "0");
    const year = usDateMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Try day of week
  const dayLower = input.toLowerCase();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const shortDayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  // Check if it's a day name
  const isDayName = dayNames.some(d => d.startsWith(dayLower)) ||
                    shortDayNames.some(d => dayLower.startsWith(d));

  if (isDayName) {
    // Get all trial dates for this show
    const { data: trials } = await supabase
      .from("trials")
      .select("trial_date, shows!inner(license_key)")
      .eq("shows.license_key", licenseKey);

    if (!trials || trials.length === 0) return null;

    // Find the trial date that matches the day of week
    for (const trial of trials) {
      const date = new Date(trial.trial_date + "T12:00:00Z"); // Use noon to avoid timezone issues
      const trialDayName = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
      const trialShortDay = date.toLocaleDateString("en-US", { weekday: "short" }).toLowerCase();

      if (trialDayName.startsWith(dayLower) || trialShortDay.startsWith(dayLower) || dayLower.startsWith(trialShortDay)) {
        return trial.trial_date;
      }
    }
  }

  return null;
}

/**
 * Get entry results
 *
 * Uses a two-step approach for element/level/date filtering:
 * 1. Query classes table to get matching class IDs
 * 2. Filter entries by those class IDs
 *
 * This is necessary because Supabase PostgREST join filtering doesn't
 * actually filter the base table - it only filters the joined data.
 */
async function executeGetEntryResults(
  params: {
    element?: string;
    level?: string;
    trial_date?: string;
    armband_number?: string;
    handler_name?: string;
    dog_name?: string;
    result_status?: string;
    top_n?: number;
  },
  supabase: ReturnType<typeof createClient>,
  licenseKey: string
): Promise<{ data: EntryResult[]; error?: string }> {
  try {
    // Parse and resolve date (handles US format, day of week, and ISO format)
    let resolvedDate: string | undefined = undefined;
    if (params.trial_date) {
      const parsed = await parseAndResolveDate(params.trial_date, supabase, licenseKey);
      if (parsed) {
        console.log(`Resolved "${params.trial_date}" to ISO date: ${parsed}`);
        resolvedDate = parsed;
      } else {
        console.log(`Could not resolve date: ${params.trial_date}`);
      }
    }

    // Step 1: If element, level, or date filter provided, first find matching class IDs
    let classIds: number[] | null = null;

    if (params.element || params.level || resolvedDate) {
      // Get the show_id first to filter classes
      const { data: showData } = await supabase
        .from("shows")
        .select("id")
        .eq("license_key", licenseKey)
        .single();

      if (showData) {
        let classQuery = supabase
          .from("classes")
          .select("id, element, level, trials!inner(show_id, trial_date)")
          .eq("trials.show_id", showData.id);

        if (params.element) {
          classQuery = classQuery.ilike("element", `%${params.element}%`);
        }
        if (params.level) {
          classQuery = classQuery.ilike("level", `%${params.level}%`);
        }
        if (resolvedDate) {
          classQuery = classQuery.eq("trials.trial_date", resolvedDate);
        }

        const { data: classData, error: classError } = await classQuery;

        if (classError) {
          console.error("Class lookup error:", classError);
          return { data: [], error: classError.message };
        }

        if (!classData || classData.length === 0) {
          // No matching classes found
          console.log(`No classes found for element=${params.element}, level=${params.level}, date=${resolvedDate}`);
          return { data: [] };
        }

        classIds = classData.map((c: { id: number }) => c.id);
        console.log(`Found ${classIds.length} matching classes for element=${params.element}, level=${params.level}, date=${resolvedDate}: [${classIds.join(", ")}]`);
      }
    }

    // Step 2: Query entries with class_id filter if we have matching classes
    let query = supabase
      .from("view_entry_with_results")
      .select(`
        armband_number,
        dog_call_name,
        handler_name,
        entry_status,
        result_status,
        search_time_seconds,
        total_faults,
        final_placement,
        is_scored,
        class_id
      `)
      .eq("license_key", licenseKey);

    // Apply class_id filter if we found matching classes
    if (classIds !== null) {
      query = query.in("class_id", classIds);
    }

    if (params.armband_number) {
      query = query.eq("armband_number", params.armband_number);
    }
    if (params.handler_name) {
      query = query.ilike("handler_name", `%${params.handler_name}%`);
    }
    if (params.dog_name) {
      query = query.ilike("dog_call_name", `%${params.dog_name}%`);
    }
    if (params.result_status) {
      query = query.eq("result_status", params.result_status);
    }
    if (params.top_n) {
      query = query.not("final_placement", "is", null).lte("final_placement", params.top_n);
    }

    // Order by placement (nulls last), then by time
    query = query
      .order("final_placement", { ascending: true, nullsFirst: false })
      .order("search_time_seconds", { ascending: true, nullsFirst: false })
      .limit(30);

    const { data, error } = await query;

    if (error) {
      console.error("Entry results error:", error);
      return { data: [], error: error.message };
    }

    // Step 3: Get class details for the returned entries
    const entryClassIds = [...new Set((data || []).map((e: { class_id: number }) => e.class_id))];
    let classMap: Map<number, { element: string; level: string }> = new Map();

    if (entryClassIds.length > 0) {
      const { data: classDetails } = await supabase
        .from("classes")
        .select("id, element, level")
        .in("id", entryClassIds);

      if (classDetails) {
        classDetails.forEach((c: { id: number; element: string; level: string }) => {
          classMap.set(c.id, { element: c.element, level: c.level });
        });
      }
    }

    // Transform data to match expected interface
    const transformed = (data || []).map((row: Record<string, unknown>) => {
      const classInfo = classMap.get(row.class_id as number);
      return {
        armband_number: row.armband_number,
        call_name: row.dog_call_name,
        handler: row.handler_name,
        entry_status: row.entry_status,
        result_status: row.result_status,
        time: row.search_time_seconds ? Number(row.search_time_seconds) : null,
        faults: row.total_faults,
        placement: row.final_placement,
        is_scored: row.is_scored,
        element: classInfo?.element || null,
        level: classInfo?.level || null,
      };
    });

    return { data: transformed };
  } catch (err) {
    console.error("Entry results exception:", err);
    return { data: [], error: String(err) };
  }
}

/**
 * Get trial overview
 */
async function executeGetTrialOverview(
  params: { trial_date?: string },
  supabase: ReturnType<typeof createClient>,
  licenseKey: string
): Promise<{ data: TrialSummary[]; error?: string }> {
  try {
    let query = supabase
      .from("view_trial_summary_normalized")
      .select(`
        trial_id,
        trial_number,
        trial_date,
        trial_name,
        competition_type,
        show_name
      `)
      .eq("license_key", licenseKey);

    if (params.trial_date) {
      query = query.eq("trial_date", params.trial_date);
    }

    query = query.order("trial_date").order("trial_number").limit(20);

    const { data, error } = await query;

    if (error) {
      console.error("Trial overview error:", error);
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err) {
    console.error("Trial overview exception:", err);
    return { data: [], error: String(err) };
  }
}

/**
 * Search entries by dog or handler name across all classes
 *
 * Fetches entries matching the search criteria and enriches with class details.
 */
async function executeSearchEntries(
  params: { dog_name?: string; handler_name?: string },
  supabase: ReturnType<typeof createClient>,
  licenseKey: string
): Promise<{ data: EntryResult[]; error?: string }> {
  try {
    if (!params.dog_name && !params.handler_name) {
      return { data: [], error: "Must provide dog_name or handler_name" };
    }

    // Query entries
    let query = supabase
      .from("view_entry_with_results")
      .select(`
        armband_number,
        dog_call_name,
        handler_name,
        entry_status,
        result_status,
        search_time_seconds,
        total_faults,
        final_placement,
        is_scored,
        class_id
      `)
      .eq("license_key", licenseKey);

    if (params.dog_name) {
      query = query.ilike("dog_call_name", `%${params.dog_name}%`);
    }
    if (params.handler_name) {
      query = query.ilike("handler_name", `%${params.handler_name}%`);
    }

    query = query
      .order("final_placement", { ascending: true, nullsFirst: false })
      .order("search_time_seconds", { ascending: true, nullsFirst: false })
      .limit(30);

    const { data, error } = await query;

    if (error) {
      console.error("Search entries error:", error);
      return { data: [], error: error.message };
    }

    // Get class details for the returned entries
    const entryClassIds = [...new Set((data || []).map((e: { class_id: number }) => e.class_id))];
    let classMap: Map<number, { element: string; level: string }> = new Map();

    if (entryClassIds.length > 0) {
      const { data: classDetails } = await supabase
        .from("classes")
        .select("id, element, level")
        .in("id", entryClassIds);

      if (classDetails) {
        classDetails.forEach((c: { id: number; element: string; level: string }) => {
          classMap.set(c.id, { element: c.element, level: c.level });
        });
      }
    }

    // Transform data to match expected interface
    const transformed = (data || []).map((row: Record<string, unknown>) => {
      const classInfo = classMap.get(row.class_id as number);
      return {
        armband_number: row.armband_number,
        call_name: row.dog_call_name,
        handler: row.handler_name,
        entry_status: row.entry_status,
        result_status: row.result_status,
        time: row.search_time_seconds ? Number(row.search_time_seconds) : null,
        faults: row.total_faults,
        placement: row.final_placement,
        is_scored: row.is_scored,
        element: classInfo?.element || null,
        level: classInfo?.level || null,
      };
    });

    return { data: transformed };
  } catch (err) {
    console.error("Search entries exception:", err);
    return { data: [], error: String(err) };
  }
}

// =============================================================================
// TOOL EXECUTION DISPATCHER
// =============================================================================

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  licenseKey: string,
  organizationCode?: string,
  sportCode?: string
): Promise<{ result: unknown; error?: string }> {
  console.log(`Executing tool: ${toolName}`, JSON.stringify(toolInput));

  switch (toolName) {
    case "search_rules":
      return executeSearchRules(
        toolInput as { query: string; level?: string; element?: string },
        supabase,
        organizationCode,
        sportCode
      ).then((r) => ({ result: r.data, error: r.error }));

    case "get_class_summary":
      return executeGetClassSummary(
        toolInput as {
          trial_date?: string;
          element?: string;
          level?: string;
          class_status?: string;
        },
        supabase,
        licenseKey
      ).then((r) => ({ result: r.data, error: r.error }));

    case "get_entry_results":
      return executeGetEntryResults(
        toolInput as {
          element?: string;
          level?: string;
          trial_date?: string;
          armband_number?: string;
          handler_name?: string;
          dog_name?: string;
          result_status?: string;
          top_n?: number;
        },
        supabase,
        licenseKey
      ).then((r) => ({ result: r.data, error: r.error }));

    case "get_trial_overview":
      return executeGetTrialOverview(
        toolInput as { trial_date?: string },
        supabase,
        licenseKey
      ).then((r) => ({ result: r.data, error: r.error }));

    case "search_entries":
      return executeSearchEntries(
        toolInput as { dog_name?: string; handler_name?: string },
        supabase,
        licenseKey
      ).then((r) => ({ result: r.data, error: r.error }));

    default:
      return { result: null, error: `Unknown tool: ${toolName}` };
  }
}

// =============================================================================
// CLAUDE API INTEGRATION
// =============================================================================

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

async function callClaude(
  messages: ClaudeMessage[],
  anthropicKey: string,
  tools: ToolDefinition[]
): Promise<{
  content: ClaudeContentBlock[];
  stop_reason: string;
}> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      tools,
      messages,
      system: `You are AskQ, a helpful AI assistant for the myK9Q dog show management app. You answer TWO types of questions:
1. HOW-TO QUESTIONS about using the app (answered from your knowledge below)
2. SHOW DATA QUESTIONS about classes, results, rules, etc. (answered using tools)

=== APP HELP CONTENT ===

## App Basics

**How do I log in?** Enter your 5-character passcode. The first letter indicates your role: a=Admin, j=Judge, s=Steward, e=Exhibitor.

**How do I install the app?** iPhone: Share → Add to Home Screen. Android: Menu → Install App.

**Does the app work offline?** Yes. After login, all data syncs to your device. Scores sync automatically when you reconnect.

## User Roles

**What can exhibitors do?** Check in their dogs, view classes and results, favorite dogs, receive notifications.

**What can stewards do?** Everything exhibitors can do, plus: change run order, call dogs to gate.

**What can judges do?** Everything stewards can do, plus: score entries, access scoresheets, manage class status.

**What can admins do?** Everything judges can do, plus: configure result visibility, manage self check-in settings, view audit logs.

## Finding Dogs & Classes

**How do I find my dog?** Tap the filter icon on Home, then search by dog name, breed, or handler name.

**How do I see my dog's classes?** Tap your dog's armband number from Home to see all their entries.

**How do I favorite a dog?** Tap the heart icon on any dog card. View favorites in the "Favorites" tab.

## Check-In

**How do I check in?** Go to Entry List → tap your dog's status → select "Checked In".

**What do entry status colors mean?**
- Gray = No status (not checked in)
- Teal = Checked in (ready to compete)
- Orange = Come to Gate (steward calling you)
- Purple = At Gate (waiting at ring entrance)
- Blue = In Ring (actively competing)
- Amber = Conflict (overlapping classes)
- Red = Pulled (withdrawn)
- Green = Completed (scored)

**What do class status colors mean?**
- Gray = No status
- Brown = Setup
- Orange = Briefing
- Purple = Break
- Teal = Start Time set
- Blue = In Progress
- Green = Completed

**What is a conflict?** Your dog is in multiple overlapping classes. Check with the steward.

## Scoring (Judges)

**How do I score a dog?** Entry List → tap scoresheet icon → enter score/time → Submit Score → Confirm.

**Can I score offline?** Yes. Scores save locally and sync when you reconnect. Don't log out until synced.

**How do I change run order?** Entry List → actions menu (⋮) → Set Run Order → choose preset (Armband Low to High, Armband High to Low, Random Shuffle, or Manual Drag and Drop).

**How do I mark in ring?** Tap status → select "In Ring". This moves the dog to top of list.

## Results & Statistics

**How do I see scores?** Tap your dog from Home → Dog Details shows all scores.

**How do I see placements?** Menu → The Podium → view podium (1st, 2nd, 3rd).

**How do I see statistics?** Menu → Statistics → filter by trial, element, level, or breed.

**Where are fastest times?** Statistics page → scroll to "Fastest Times" table.

## Notifications

**What notifications are available?** Podium placements, "Up Soon" when dog ahead finishes, "Come to Gate" when called.

**How do I enable notifications?** Settings → Notifications → Enable → Allow browser permission.

## Printing (Judges/Admins)

**How do I print reports?** Entry List → three-dot menu → Check-in Sheet, Results Sheet, or Scoresheet Report.

## Steward Tasks

**How do I call a dog?** Change status to "Come to Gate" - exhibitor gets a notification.

**How do I handle scratched dog?** Change status to "Pulled".

## Admin Tasks

**Where are admin settings?** Menu → Results Control (admin only).

**What can I configure?** Result visibility (when scores show), self check-in (on/off per class), live results toggle.

**Where is the audit log?** Results Control → menu (⋮) → Audit Log.

## Troubleshooting

**App seems stuck?** Pull down to refresh. If still stuck, close and reopen.

**Scores not showing?** Check if online (Wi-Fi icon). Pull to refresh after reconnecting.

**Can't find my dog?** Check you're in correct show. Tap filter icon to search. Check "All Dogs" not just Favorites.

**Notifications not working?** Check Settings → Notifications. Make sure you installed app to home screen (iPhone).

**Can't log out?** You have pending scores. Wait for sync to complete.

## Glossary

- **Armband**: Your dog's number for this show
- **Check-in**: Confirming your dog is present
- **Run Order**: Sequence dogs compete in
- **Q/Qualifying**: Dog passed
- **NQ**: Did not qualify
- **Element**: Competition type (Scent Work, Rally, etc.)
- **Level**: Difficulty (Novice, Open, Excellent, Masters)

=== END APP HELP ===

DECISION LOGIC:
- For "how do I", "how to", "where is", "what does", "can I" questions about USING THE APP → Answer directly from the help content above
- For questions about THIS SHOW's data (classes, entries, results, schedules, specific dogs) → Use tools
- For questions about RULES, regulations, time limits, area sizes → Use search_rules tool

TOOL USAGE:
1. search_rules - For rules, time limits, area sizes, regulations
2. get_class_summary - For class schedules, entry counts, class status
3. get_entry_results - For results, placements, scores
4. get_trial_overview - For trial schedule
5. search_entries - For specific dogs or handlers

RESPONSE STYLE:
- Be concise and direct (1-3 sentences for simple questions)
- Include specific numbers and data from the tools
- If data shows no results, say so clearly
- Don't make up information not in the tool results
- ONLY discuss results returned by the tools - do NOT mention or speculate about results from other dates, classes, or data not in the tool response

For numerical data from rules (time limits, area sizes, hide counts), ALWAYS use the "measurements" field from the rules data, not numbers mentioned in the descriptive text.`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Claude API error:", errorText);
    throw new Error(`Claude API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
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

    // Parse request
    const {
      message,
      licenseKey,
      organizationCode,
      sportCode,
    }: ChatRequest = await req.json();

    // Validate required fields
    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!licenseKey) {
      return new Response(
        JSON.stringify({ error: "License key is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Initialize conversation with user message
    const messages: ClaudeMessage[] = [{ role: "user", content: message }];

    const toolsUsed: string[] = [];
    const sources: ChatResponse["sources"] = {};

    // Call Claude with tools
    console.log("Calling Claude with message:", message);
    let response = await callClaude(messages, anthropicKey, TOOLS);
    console.log("Claude response:", JSON.stringify(response, null, 2));

    // Process tool calls in a loop (Claude may call multiple tools)
    while (response.stop_reason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block) => block.type === "tool_use"
      );

      // Add assistant's response (with tool calls) to messages
      messages.push({ role: "assistant", content: response.content });

      // Execute each tool and collect results
      const toolResults: ClaudeContentBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        if (toolUse.type !== "tool_use" || !toolUse.name || !toolUse.id) {
          continue;
        }

        toolsUsed.push(toolUse.name);

        const { result, error } = await executeTool(
          toolUse.name,
          toolUse.input || {},
          supabase,
          licenseKey,
          organizationCode,
          sportCode
        );

        // Store sources for response
        if (!error && result) {
          switch (toolUse.name) {
            case "search_rules":
              sources.rules = result as Rule[];
              break;
            case "get_class_summary":
              sources.classes = result as ClassSummary[];
              break;
            case "get_entry_results":
            case "search_entries":
              sources.entries = result as EntryResult[];
              break;
            case "get_trial_overview":
              sources.trials = result as TrialSummary[];
              break;
          }
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: error
            ? JSON.stringify({ error })
            : JSON.stringify(result),
        });
      }

      // Add tool results to messages
      messages.push({ role: "user", content: toolResults });

      // Call Claude again with tool results
      console.log("Calling Claude with tool results...");
      response = await callClaude(messages, anthropicKey, TOOLS);
      console.log("Claude response:", JSON.stringify(response, null, 2));
    }

    // Extract final text answer
    const textBlock = response.content.find((block) => block.type === "text");
    const answer = textBlock?.text || "I couldn't generate a response.";

    // Log query for analytics (fire-and-forget)
    supabase
      .from("chatbot_query_log")
      .insert({
        query: message,
        tools_used: toolsUsed,
        license_key: licenseKey,
        organization_code: organizationCode || null,
        sport_code: sportCode || null,
      })
      .then(() => console.log("Query logged"))
      .catch((err: Error) => console.log("Query log skipped:", err.message));

    // Return response
    const chatResponse: ChatResponse = {
      answer,
      toolsUsed: [...new Set(toolsUsed)], // Dedupe
      sources:
        Object.keys(sources).length > 0 ? sources : undefined,
    };

    return new Response(JSON.stringify(chatResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in ask-myk9q function:", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
