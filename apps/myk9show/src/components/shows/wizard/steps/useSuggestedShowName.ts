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
  /**
   * The name this hook last wrote and she has not touched since, kept where the draft lives so
   * it outlives a remount of the step. Null once the name is hers. Not persisted: a draft
   * resumed from disk is hers.
   */
  suggestedName: string | null;
  setSuggestedName: (name: string | null) => void;
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
  suggestedName,
  setSuggestedName,
}: SuggestedShowNameArgs): void {
  // Back on this step after a look at Trials the refs are new, but the record is not: a name
  // is ours only if we wrote it. Equality with the suggestion proves nothing, since she may
  // have typed exactly that.
  const ownedName = () => (name !== '' && name === suggestedName ? name : null);
  const lastWritten = useRef<string | null>(ownedName());
  /** The name our last write replaced, until a render shows the write has landed. */
  const replaced = useRef<string | null>(null);
  const hers = useRef(false);
  const generation = useRef(draftGeneration);

  useEffect(() => {
    if (generation.current !== draftGeneration) {
      generation.current = draftGeneration;
      // A generation bump that keeps the draft (a clone begun, then cancelled) keeps its record.
      lastWritten.current = ownedName();
      replaced.current = null;
      hers.current = false;
    }
    // An effect re-run that still sees the name we just replaced has not caught up with the
    // write (React re-runs effects with the same props in development). It is not her edit.
    if (replaced.current !== null) {
      if (name === replaced.current) return;
      replaced.current = null;
    }

    const suggestion = suggestShowName(clubName, startDate);
    const untouchedBlank = lastWritten.current === null && name === '';
    if (name !== lastWritten.current && !untouchedBlank && !hers.current) {
      hers.current = true;
      if (suggestedName !== null) setSuggestedName(null);
    }
    if (hers.current || !enabled || !suggestion || suggestion === name) return;

    replaced.current = name;
    lastWritten.current = suggestion;
    setSuggestedName(suggestion);
    setName(suggestion);
  }, [
    enabled,
    draftGeneration,
    clubName,
    startDate,
    name,
    setName,
    suggestedName,
    setSuggestedName,
  ]);
}
