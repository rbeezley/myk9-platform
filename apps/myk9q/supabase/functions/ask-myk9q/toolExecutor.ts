import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ClassSummary, EntryResult, TrialSummary } from "./types.ts";
import { executeSearchRules, parseAndResolveDate } from "./ruleLookup.ts";

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

export async function executeTool(
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
