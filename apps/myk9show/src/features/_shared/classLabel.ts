/**
 * One answer to "what uniquely names a class to an exhibitor?", shared by the
 * public show premium and the registration wizard.
 *
 * A show can run two classes that share an element AND a level. The seeded
 * Heartland Saturday trial runs both "Interior Advanced" and "Interior Advanced
 * Preliminary", neither with a section. Any label built from element + level +
 * section alone renders those identically, which cost the exhibitor twice:
 *
 *   - the premium listed one Interior Advanced class where the show offers two
 *     (MYK9-487, fixed in 4259a1eb9)
 *   - the wizard offered two adjacent chips both reading "Advanced", so
 *     choosing "the Advanced one" is a coin flip at $30 a class (MYK9-489)
 *
 * Both surfaces now derive the distinguishing words from the class NAME, here,
 * rather than each inventing a rule. They are the two screens the same person
 * reads minutes apart when deciding what to enter; separate rules would drift.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clean(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The words in a class's NAME that its element, level and section do not
 * already account for — "Preliminary" for "Interior Advanced Preliminary"
 * under element Interior, level Advanced.
 *
 * Returns '' when the name merely restates what the caller already renders,
 * which is the common case: "Interior Novice B" adds nothing to element
 * Interior + level Novice + section B. That emptiness is load-bearing. It is
 * what keeps split levels merged as "Novice A, B" on the premium instead of
 * splitting into two entries, and what keeps ordinary chips reading "Novice B"
 * rather than doubling their own words back at the reader.
 *
 * Each token is removed once and on a word boundary, so a level that appears
 * twice in a name keeps its second occurrence, and "Novice" does not match
 * inside a hypothetical "Novices".
 *
 * The boundary is applied per END, not blindly on both: `\b` asserts a
 * word/non-word transition, so anchoring a token that starts or ends with
 * punctuation would never match. An element genuinely named "C.A.T." ends in a
 * dot, and `\bC\.A\.T\.\b` cannot match "C.A.T. Open Trial" — the token would
 * survive into the label and re-create the ambiguity this rule exists to
 * remove. Element and level are free text from the database, so punctuation is
 * a real input, not a hypothetical one.
 */
export function classNameExtra(
  name: string | null | undefined,
  element: string | null | undefined,
  level: string | null | undefined,
  section: string | null | undefined
): string {
  const cleanedName = clean(name);
  if (!cleanedName) return '';

  let rest = cleanedName;
  for (const token of [clean(element), clean(level), clean(section)]) {
    if (!token) continue;
    const lead = /^\w/.test(token) ? '\\b' : '';
    const trail = /\w$/.test(token) ? '\\b' : '';
    rest = rest.replace(new RegExp(`${lead}${escapeRegExp(token)}${trail}`, 'i'), ' ');
  }

  return rest.replace(/\s+/g, ' ').trim();
}
