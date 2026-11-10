import { useEffect, useRef } from 'react';
import { parseWizardDateTime } from '@/utils/wizardTrialDates';

/**
 * "Heartland Scent Work Club October 2026": the club and the month the show starts. Null
 * until both are known. The wizard stores the start as the picked local day's instant
 * (`date.toISOString()`), so the month is read back the way the date field shows it, in
 * local time; reading the UTC text would name the wrong month for a show on the 1st.
 */
export function suggestShowName(clubName: string | undefined, startDate: string): string | null {
  const club = clubName?.trim();
  const start = parseWizardDateTime(startDate);
  if (!club || !start) return null;
  return `${club} ${start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
}

interface SuggestedShowNameArgs {
  /** False while a clone is loading: its name is on the way. */
  enabled: boolean;
  /** Changes when the draft is replaced wholesale (start fresh, clone): a new show begins. */
  draftGeneration: number;
  clubName: string | undefined;
  startDate: string;
  name: string;
  setName: (name: string) => void;
}

/**
 * Fills the show name for a new show once the club and dates are known (owner decision,
 * MYK9-1799), and keeps it in step if she then changes either.
 *
 * It only ever writes over a name it wrote itself. Any other value in the field is hers:
 * a name she typed, a resumed draft, a cloned show, or a field she emptied on purpose to
 * type her own. From then on this hook stays out of the way for the rest of the visit.
 */
export function useSuggestedShowName({
  enabled,
  draftGeneration,
  clubName,
  startDate,
  name,
  setName,
}: SuggestedShowNameArgs): void {
  const lastWritten = useRef<string | null>(null);
  const hers = useRef(false);
  const generation = useRef(draftGeneration);

  useEffect(() => {
    if (generation.current !== draftGeneration) {
      generation.current = draftGeneration;
      lastWritten.current = null;
      hers.current = false;
    }
    const untouchedBlank = lastWritten.current === null && name === '';
    if (name !== lastWritten.current && !untouchedBlank) hers.current = true;
    if (hers.current || !enabled) return;

    const suggestion = suggestShowName(clubName, startDate);
    if (!suggestion || suggestion === name) return;
    lastWritten.current = suggestion;
    setName(suggestion);
  }, [enabled, draftGeneration, clubName, startDate, name, setName]);
}
