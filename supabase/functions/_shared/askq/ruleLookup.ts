import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { Rule } from './types.ts';

export async function executeSearchRules(
  params: { query: string; level?: string; element?: string },
  supabase: ReturnType<typeof createClient>,
  organizationCode?: string,
  sportCode?: string
): Promise<{ data: Rule[]; error?: string }> {
  try {
    let query = supabase.from('rules').select(`
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
    query = query.eq('rulebooks.active', true);

    // Filter by organization and sport
    if (organizationCode) {
      query = query.eq('rulebooks.rule_organizations.code', organizationCode);
    }
    if (sportCode) {
      query = query.eq('rulebooks.rule_sports.code', sportCode);
    }

    // Apply level/element filters
    if (params.level) {
      query = query.eq('categories->>level', params.level);
    }
    if (params.element) {
      query = query.eq('categories->>element', params.element);
    }

    // Full-text search
    if (params.query && params.query.trim().length > 0) {
      query = query.textSearch('search_vector', params.query, {
        type: 'websearch',
        config: 'english',
      });
    }

    query = query.limit(5);

    const { data, error } = await query;

    if (error) {
      console.error('Rules search error:', error);
      return { data: [], error: error.message };
    }

    return { data: data || [] };
  } catch (err) {
    console.error('Rules search exception:', err);
    return { data: [], error: String(err) };
  }
}

export async function parseAndResolveDate(
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
    const month = usDateMatch[1].padStart(2, '0');
    const day = usDateMatch[2].padStart(2, '0');
    const year = usDateMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Try day of week
  const dayLower = input.toLowerCase();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const shortDayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  // Check if it's a day name
  const isDayName =
    dayNames.some(d => d.startsWith(dayLower)) || shortDayNames.some(d => dayLower.startsWith(d));

  if (isDayName) {
    // Get all trial dates for this show
    const { data: trials } = await supabase
      .from('trials')
      .select('trial_date, shows!inner(license_key)')
      .eq('shows.license_key', licenseKey);

    if (!trials || trials.length === 0) return null;

    // Find the trial date that matches the day of week
    for (const trial of trials) {
      const date = new Date(trial.trial_date + 'T12:00:00Z'); // Use noon to avoid timezone issues
      const trialDayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      const trialShortDay = date.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();

      if (
        trialDayName.startsWith(dayLower) ||
        trialShortDay.startsWith(dayLower) ||
        dayLower.startsWith(trialShortDay)
      ) {
        return trial.trial_date;
      }
    }
  }

  return null;
}
