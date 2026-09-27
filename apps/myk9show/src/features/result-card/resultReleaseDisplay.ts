/**
 * MYK9-263's rule, in one place: placement is withheld until the class is
 * released, and an unreleased result is labelled preliminary.
 *
 * `MyShowClassRow` had this check inline and correct. `PastResultsSection`
 * (dog Career → Past Results) and the show page's "My run schedule" restated
 * it themselves — one dropped the release check entirely, the other omitted
 * it — and each surface drifted from the rule in its own way (MYK9-805). All
 * three now read from this one gate.
 *
 * @module features/result-card/resultReleaseDisplay
 */

export interface ResultReleaseDisplayInput {
  resultsReleasedAt: string | null | undefined;
  resultStatus: string | null | undefined;
  finalPlacement: number | null | undefined;
}

export interface ResultReleaseDisplay {
  /** Whether the class has been released. */
  isReleased: boolean;
  /** The placement to render, or `undefined` when withheld, absent, or the un-ranked 0 default. */
  placement: number | undefined;
  /** True while the class is unreleased — surfaces label the result "preliminary". */
  isPreliminary: boolean;
}

export function deriveResultReleaseDisplay({
  resultsReleasedAt,
  resultStatus,
  finalPlacement,
}: ResultReleaseDisplayInput): ResultReleaseDisplay {
  const isReleased = !!resultsReleasedAt;
  const placement =
    isReleased && resultStatus === 'qualified' && finalPlacement != null && finalPlacement >= 1
      ? finalPlacement
      : undefined;

  return { isReleased, placement, isPreliminary: !isReleased };
}
