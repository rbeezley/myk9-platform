import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function parseAndResolveDate(
  dateInput: string,
  supabase: ReturnType<typeof createClient>,
  licenseKey: string,
  showId?: string
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
    // Get all trial dates for this show — use show_id if available, fall back to license_key
    let trialsQuery = supabase.from('trials').select('trial_date, show_id');
    if (showId) {
      trialsQuery = trialsQuery.eq('show_id', showId);
    } else if (licenseKey) {
      trialsQuery = supabase
        .from('trials')
        .select('trial_date, shows!inner(license_key)')
        .eq('shows.license_key', licenseKey);
    } else {
      return null;
    }
    const { data: trials } = await trialsQuery;

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
