import type { PremiumTrialFacts } from '../../premiumFacts';

type JudgeFact = PremiumTrialFacts['judges'][number];

/**
 * "Jane Smith, Springfield, IL", or the name alone for a judge with no city (MYK9-2067), then
 * " (ASCA-approved judge, Region 4)" when the premium carries an affiliation (MYK9-2292; the facts
 * hold one only on an ASCA premium).
 */
export function judgeHeading(judge: JudgeFact): string {
  const named = judge.residence ? `${judge.name}, ${judge.residence}` : judge.name;
  return judge.affiliation ? `${named} (${judge.affiliation})` : named;
}

/** The judge's classes as one line, or null when they have none (a judge on every class). */
export function judgeClassesLine(judge: JudgeFact): string | null {
  return judge.classes.length > 0 ? judge.classes.join(', ') : null;
}

/** The heading with the classes on a second line, for the bodies that give a judge a row. */
export function judgeBlockText(judge: JudgeFact): string {
  const classes = judgeClassesLine(judge);
  return classes ? `${judgeHeading(judge)}\n${classes}` : judgeHeading(judge);
}
