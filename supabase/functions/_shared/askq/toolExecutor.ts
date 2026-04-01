import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { ClassSummary, EntryResult, TrialSummary, UserContext } from './types.ts';
import { executeSearchRules, parseAndResolveDate } from './ruleLookup.ts';

type SupabaseClient = ReturnType<typeof createClient>;

// myK9Q scopes by license_key, myK9Show scopes by show_id
interface ShowScope {
  licenseKey?: string;
  showId?: string;
}

// Apply the appropriate show scope filter to a query
function applyShowScope(query: ReturnType<SupabaseClient['from']>, scope: ShowScope) {
  if (scope.showId) {
    return query.eq('show_id', scope.showId);
  }
  if (scope.licenseKey) {
    return query.eq('license_key', scope.licenseKey);
  }
  return query;
}

async function executeGetClassSummary(
  params: {
    trial_date?: string;
    element?: string;
    level?: string;
    class_status?: string;
  },
  supabase: SupabaseClient,
  scope: ShowScope
): Promise<{ data: ClassSummary[]; error?: string }> {
  try {
    let query = supabase.from('view_class_summary').select(
      `
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
      `
    );

    query = applyShowScope(query, scope);

    if (params.trial_date) {
      query = query.eq('trial_date', params.trial_date);
    }
    if (params.element) {
      query = query.ilike('element', `%${params.element}%`);
    }
    if (params.level) {
      query = query.ilike('level', `%${params.level}%`);
    }
    if (params.class_status) {
      query = query.eq('class_status', params.class_status);
    }

    query = query.order('trial_date').order('class_order').limit(50);

    const { data, error } = await query;

    if (error) {
      console.error('Class summary error:', error);
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err) {
    console.error('Class summary exception:', err);
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
  supabase: SupabaseClient,
  scope: ShowScope
): Promise<{ data: EntryResult[]; error?: string }> {
  try {
    let resolvedDate: string | undefined = undefined;
    if (params.trial_date) {
      const parsed = await parseAndResolveDate(
        params.trial_date,
        supabase,
        scope.licenseKey ?? '',
        scope.showId
      );
      if (parsed) {
        resolvedDate = parsed;
      }
    }

    // Step 1: If element, level, or date filter provided, find matching class IDs
    let classIds: number[] | null = null;

    if (params.element || params.level || resolvedDate) {
      // Resolve show_id for class filtering
      let showIdForClasses = scope.showId;
      if (!showIdForClasses && scope.licenseKey) {
        const { data: showData } = await supabase
          .from('shows')
          .select('id')
          .eq('license_key', scope.licenseKey)
          .single();
        showIdForClasses = showData?.id;
      }

      if (showIdForClasses) {
        let classQuery = supabase
          .from('classes')
          .select('id, element, level, trials!inner(show_id, trial_date)')
          .eq('trials.show_id', showIdForClasses);

        if (params.element) {
          classQuery = classQuery.ilike('element', `%${params.element}%`);
        }
        if (params.level) {
          classQuery = classQuery.ilike('level', `%${params.level}%`);
        }
        if (resolvedDate) {
          classQuery = classQuery.eq('trials.trial_date', resolvedDate);
        }

        const { data: classData, error: classError } = await classQuery;

        if (classError) {
          console.error('Class lookup error:', classError);
          return { data: [], error: classError.message };
        }

        if (!classData || classData.length === 0) {
          return { data: [] };
        }

        classIds = classData.map((c: { id: number }) => c.id);
      }
    }

    // Step 2: Query entries
    let query = supabase.from('view_entry_with_results').select(
      `
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
      `
    );

    query = applyShowScope(query, scope);

    if (classIds !== null) {
      query = query.in('class_id', classIds);
    }
    if (params.armband_number) {
      query = query.eq('armband_number', params.armband_number);
    }
    if (params.handler_name) {
      query = query.ilike('handler_name', `%${params.handler_name}%`);
    }
    if (params.dog_name) {
      query = query.ilike('dog_call_name', `%${params.dog_name}%`);
    }
    if (params.result_status) {
      query = query.eq('result_status', params.result_status);
    }
    if (params.top_n && params.top_n > 0) {
      query = query.not('final_placement', 'is', null).lte('final_placement', params.top_n);
    }

    query = query
      .order('final_placement', { ascending: true, nullsFirst: false })
      .order('search_time_seconds', { ascending: true, nullsFirst: false })
      .limit(30);

    const { data, error } = await query;

    if (error) {
      console.error('Entry results error:', error);
      return { data: [], error: error.message };
    }

    // Step 3: Get class details for the returned entries
    const entryClassIds = [...new Set((data || []).map((e: { class_id: number }) => e.class_id))];
    const classMap: Map<number, { element: string; level: string }> = new Map();

    if (entryClassIds.length > 0) {
      const { data: classDetails } = await supabase
        .from('classes')
        .select('id, element, level')
        .in('id', entryClassIds);

      if (classDetails) {
        classDetails.forEach((c: { id: number; element: string; level: string }) => {
          classMap.set(c.id, { element: c.element, level: c.level });
        });
      }
    }

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
    console.error('Entry results exception:', err);
    return { data: [], error: String(err) };
  }
}

async function executeGetTrialOverview(
  params: { trial_date?: string },
  supabase: SupabaseClient,
  scope: ShowScope
): Promise<{ data: TrialSummary[]; error?: string }> {
  try {
    let query = supabase.from('view_trial_summary_normalized').select(
      `
        trial_id,
        trial_number,
        trial_date,
        trial_name,
        competition_type,
        show_name
      `
    );

    query = applyShowScope(query, scope);

    if (params.trial_date) {
      query = query.eq('trial_date', params.trial_date);
    }

    query = query.order('trial_date').order('trial_number').limit(20);

    const { data, error } = await query;

    if (error) {
      console.error('Trial overview error:', error);
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err) {
    console.error('Trial overview exception:', err);
    return { data: [], error: String(err) };
  }
}

async function executeSearchEntries(
  params: { dog_name?: string; handler_name?: string },
  supabase: SupabaseClient,
  scope: ShowScope
): Promise<{ data: EntryResult[]; error?: string }> {
  try {
    if (!params.dog_name && !params.handler_name) {
      return { data: [], error: 'Must provide dog_name or handler_name' };
    }

    let query = supabase.from('view_entry_with_results').select(
      `
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
      `
    );

    query = applyShowScope(query, scope);

    if (params.dog_name) {
      query = query.ilike('dog_call_name', `%${params.dog_name}%`);
    }
    if (params.handler_name) {
      query = query.ilike('handler_name', `%${params.handler_name}%`);
    }

    query = query
      .order('final_placement', { ascending: true, nullsFirst: false })
      .order('search_time_seconds', { ascending: true, nullsFirst: false })
      .limit(30);

    const { data, error } = await query;

    if (error) {
      console.error('Search entries error:', error);
      return { data: [], error: error.message };
    }

    const entryClassIds = [...new Set((data || []).map((e: { class_id: number }) => e.class_id))];
    const classMap: Map<number, { element: string; level: string }> = new Map();

    if (entryClassIds.length > 0) {
      const { data: classDetails } = await supabase
        .from('classes')
        .select('id, element, level')
        .in('id', entryClassIds);

      if (classDetails) {
        classDetails.forEach((c: { id: number; element: string; level: string }) => {
          classMap.set(c.id, { element: c.element, level: c.level });
        });
      }
    }

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
    console.error('Search entries exception:', err);
    return { data: [], error: String(err) };
  }
}

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
    if (error) return { data: [], error: error.message };
    if (!data || data.length === 0) {
      return {
        data: [],
        error:
          'The user guide is not yet available. Try asking about rules or your show data instead.',
      };
    }
    return { data };
  } catch (err) {
    return { data: [], error: `User guide search failed: ${(err as Error).message}` };
  }
}

export async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  supabase: SupabaseClient,
  licenseKey: string,
  organizationCode?: string,
  sportCode?: string,
  userContext?: UserContext | null
): Promise<{ result: unknown; error?: string }> {
  // Build scope: prefer showId (myK9Show) over licenseKey (myK9Q)
  const scope: ShowScope = {};
  if (userContext?.showId) {
    scope.showId = userContext.showId;
  }
  if (licenseKey) {
    scope.licenseKey = licenseKey;
  }

  switch (toolName) {
    case 'search_rules':
      return executeSearchRules(
        toolInput as { query: string; level?: string; element?: string },
        supabase,
        organizationCode,
        sportCode
      ).then(r => ({ result: r.data, error: r.error }));

    case 'get_class_summary':
      return executeGetClassSummary(
        toolInput as {
          trial_date?: string;
          element?: string;
          level?: string;
          class_status?: string;
        },
        supabase,
        scope
      ).then(r => ({ result: r.data, error: r.error }));

    case 'get_entry_results':
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
        scope
      ).then(r => ({ result: r.data, error: r.error }));

    case 'get_trial_overview':
      return executeGetTrialOverview(toolInput as { trial_date?: string }, supabase, scope).then(
        r => ({ result: r.data, error: r.error })
      );

    case 'search_entries':
      return executeSearchEntries(
        toolInput as { dog_name?: string; handler_name?: string },
        supabase,
        scope
      ).then(r => ({ result: r.data, error: r.error }));

    case 'search_user_guide':
      return executeSearchUserGuide(supabase, toolInput as { query: string }).then(r => ({
        result: r.data,
        error: r.error,
      }));

    default:
      return { result: null, error: `Unknown tool: ${toolName}` };
  }
}
