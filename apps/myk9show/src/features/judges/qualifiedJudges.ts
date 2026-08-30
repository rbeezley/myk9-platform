/**
 * Which judges a show may pick from.
 *
 * Extracted because two surfaces had drifted apart. `ShowEditForm`'s Judges tab required
 * an active qualification **for the show's organization**; `ClassManagementPage` required
 * only that the qualification be active, with no organization test at all — so on an AKC
 * show its per-class judge dropdown offered UKC- and ASCA-only judges, who cannot
 * lawfully judge it and would then appear on the show's judge roster and its registry
 * paperwork.
 *
 * The roster is not a separate list: `showMappers` derives `show.assignedJudges` from
 * every `judge_assignments` row for the show, so assigning a judge to a class is what
 * puts them on the show. That is why an over-broad picker here is not a cosmetic
 * problem — it is the write path into the roster.
 */
import type { User } from '@/types/user-types';

export interface QualifiedJudgeOption {
  id: string;
  name: string;
}

/**
 * A person's qualification as the judge queries return it.
 *
 * Every optional property spells out `| undefined` because the app compiles with
 * `exactOptionalPropertyTypes`, under which `foo?: string` means "absent or string" and
 * rejects a source whose property is explicitly `string | undefined` — which is what
 * `User` provides.
 */
interface JudgeQualificationLike {
  status?: string | null | undefined;
  organization?: string | null | undefined;
}

interface JudgeLike {
  id: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  judgeQualifications?: readonly JudgeQualificationLike[] | null | undefined;
}

export function judgeDisplayName(judge: JudgeLike): string {
  return `${judge.firstName ?? ''} ${judge.lastName ?? ''}`.trim() || 'Unknown Judge';
}

/** Does this person hold an ACTIVE qualification for `organization`? */
export function isQualifiedForOrganization(
  judge: JudgeLike,
  organization: string | null | undefined
): boolean {
  if (!organization) return false;
  return Boolean(
    judge.judgeQualifications?.some(
      qualification =>
        qualification.status === 'Active' && qualification.organization === organization
    )
  );
}

/**
 * Judges selectable for a show, sorted by name.
 *
 * Returns EMPTY when the organization is unknown rather than falling back to everyone.
 * The permissive reading is the bug this module exists to remove: an unfiltered list is
 * indistinguishable from a correct one on screen, and the mistake it invites — assigning
 * a judge not qualified for the registry — is only visible later, on the paperwork.
 *
 * That case needs no guard of its own: `isQualifiedForOrganization` already rejects a
 * falsy organization, so the filter yields nothing. An early return here would restate
 * the rule in a second place and could not be shown to do anything — a mutation that
 * deleted it left every test green.
 */
export function selectQualifiedJudges(
  judges: readonly JudgeLike[] | null | undefined,
  organization: string | null | undefined
): QualifiedJudgeOption[] {
  return (judges ?? [])
    .filter(judge => isQualifiedForOrganization(judge, organization))
    .map(judge => ({ id: judge.id, name: judgeDisplayName(judge) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Narrowing helper so callers can pass the app's `User` shape directly. */
export type QualifiableJudge = User & {
  judgeQualifications?: readonly JudgeQualificationLike[] | null;
};
