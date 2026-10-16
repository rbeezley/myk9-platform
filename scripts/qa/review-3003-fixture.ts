/**
 * The review that #3003's claude-review.sh run mis-certified as "no findings"
 * (MYK9-1209): its first line contains the clean-verdict words but negates
 * them, and its three findings are a JSON array, not `- [P2]` bullets.
 */
export const REVIEW_3003 = `No actionable defects found is not the verdict here, because I found three. I did not run the test suite or the migration. This is a read of the branch diff against merge-base \`48e3616c09\`.

\`\`\`json
[
  {
    "file": "apps/myk9show/src/components/dogs/registrationForm.ts",
    "line": 59,
    "summary": "The Dog Details Add and Edit panels now enforce the strict registration-number regex.",
    "failure_scenario": "An existing registration saved with a space now fails validation."
  },
  {
    "file": "apps/myk9show/src/components/dogs/registrationForm.ts",
    "line": 82,
    "summary": "A stored status that is not one of the four enum values is shown as 'Active'.",
    "failure_scenario": "Editing a registration stored as 'under_review' shows 'Active'."
  },
  {
    "file": "supabase/migrations/20261015030017_myk9_1117_registration_date_on_dog_create.sql",
    "line": 143,
    "summary": "A malformed date aborts the whole atomic dog creation.",
    "failure_scenario": "A non-ISO value raises 22007 inside create_dog_with_registrations."
  }
]
\`\`\`
`;

/** Negated or contrasted forms of the contract sentence: none is clean. */
export const NEGATED_CLEAN_FORMS = [
  'No actionable defects found is not the verdict here.\n',
  "No actionable defects found isn't accurate.\n",
  'No actionable defects found would be the verdict, but I stopped early.\n',
  'No actionable defects found, however the migration was not read.\n',
];

/** Genuinely clean verdicts that mention JSON keys or validation caveats (round 2). */
export const CLEAN_WITH_NOISE = [
  'No actionable defects found. However, I did not run tests.\n',
  'No actionable defects found. Previously I found two defects; both are now fixed.\n',
  'No actionable defects found.\n\nThe schema is:\n\n```json\n{ "file": "string", "summary": "string", "failure_scenario": "string" }\n```\n',
  'No actionable defects found.\n\nThe manifest snippet is:\n\n```json\n{\n  "file": "x.ts",\n  "files": ["a", "b"]\n}\n```\n',
];

/** A clean-looking opening over a fenced array of valid finding objects: findings. */
export const CLEAN_OPENING_WITH_FINDINGS_ARRAY =
  'No actionable defects found.\n\n```json\n[{"file":"a.ts","summary":"s","failure_scenario":"f"},{"file":"b.ts","summary":"s2","failure_scenario":"f2"}]\n```\n';

/** The #3003 opening with no findings block: not clean, not findings. */
export const NEGATED_OPENING_ONLY =
  'No actionable defects found is not the verdict here, because I found three.\n';
