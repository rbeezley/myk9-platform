import type { JudgeKey } from '@/features/judge-supplies/types';
import type { ShowOfficials } from '@/hooks/queries/useShowOfficials';
import type { LunchCandidate } from './lunchOrders';
import type { VolunteerOnDay } from './useLunchOrders';

interface DayAssignments {
  trialId: string;
  judges: readonly JudgeKey[];
  officials: ShowOfficials | undefined;
  volunteers: readonly VolunteerOnDay[];
}

/** Everyone already assigned to one show day: its judges, the show's officials and its volunteers. */
export function collectLunchCandidates({
  trialId,
  judges,
  officials,
  volunteers,
}: DayAssignments): LunchCandidate[] {
  const candidates: LunchCandidate[] = judges.map(judge => ({
    personId: judge.person_id,
    name: judge.judge_name,
    role: 'judge',
  }));

  const official = (list: ShowOfficials['stewards'], role: LunchCandidate['role']) =>
    list.map(person => ({
      personId: person.personId,
      name: `${person.firstName} ${person.lastName}`.trim(),
      role,
    }));
  if (officials) {
    candidates.push(
      ...official(officials.secretaries, 'secretary'),
      ...official(officials.stewards, 'steward'),
      ...official(officials.chairmen, 'club_member')
    );
  }

  for (const volunteer of volunteers) {
    // A show-wide duty (no day) covers every day; a day duty only its own.
    if (volunteer.trialId !== null && volunteer.trialId !== trialId) continue;
    candidates.push({ personId: volunteer.personId, name: volunteer.name, role: 'volunteer' });
  }

  return candidates;
}
