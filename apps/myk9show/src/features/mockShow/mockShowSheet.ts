/**
 * The mock show test sheet, as the app shows it.
 *
 * ONE source for the wording: `docs/operations/mock-show-test-sheet.md` is what
 * clubs are told about, and `mockShowSheet.test.ts` fails if this file drifts
 * from it. Edit both together.
 *
 * INTENT: this whole feature (this folder, `MockShowTestPage`, its route and its
 * account-menu item) is temporary. Delete it when the first real show has run.
 */

export interface MockShowTask {
  number: number;
  /** The sheet's bold text without its number and closing period. */
  name: string;
  /** The rest of the sheet's cell. */
  detail: string;
}

export const MOCK_SHOW_RULES: readonly string[] = [
  "Do not type exhibitors' real email addresses. The app sends real emails. Leave the email blank, or use your own.",
  'Pay only with the test card: 4242 4242 4242 4242, any future date, any three digits, any ZIP code.',
];

export const MOCK_SHOW_TASKS: readonly MockShowTask[] = [
  {
    number: 1,
    name: 'Set up the show',
    detail: 'Two trials, with the classes and judges from your past show.',
  },
  { number: 2, name: 'Publish it', detail: 'and open entries.' },
  {
    number: 3,
    name: 'Key in 10 mail-in entries',
    detail:
      'with Add entry. Include one exhibitor and dog who are new, and one cheque that came in the post.',
  },
  {
    number: 4,
    name: 'Enter online as an exhibitor',
    detail:
      'Sign up with a second email address of your own, add a dog, enter two classes, pay by card.',
  },
  {
    number: 5,
    name: 'Enter two dogs for one owner in the same class',
    detail: ', online.',
  },
  {
    number: 6,
    name: 'Change something',
    detail: 'Move one dog to another class. Withdraw one dog and decide its refund.',
  },
  {
    number: 7,
    name: 'Get ready for show day',
    detail: "Print the judge's paperwork and the catalog. Find the access codes for your judges.",
  },
  {
    number: 8,
    name: 'Score one class at Ringside on a phone',
    detail:
      ", using a judge's code. Halfway through, switch the phone to airplane mode, then back.",
  },
  { number: 9, name: 'Correct one score', detail: 'after saving it.' },
  { number: 10, name: 'Score one class on paper', detail: ', then enter those results.' },
  {
    number: 11,
    name: 'Check the results',
    detail: 'Do the placements match what you worked out by hand?',
  },
  {
    number: 12,
    name: 'Finish the show',
    detail: 'Print the results and whatever you would send to AKC.',
  },
];

export const MOCK_SHOW_CLOSING_QUESTIONS: readonly string[] = [
  'Would you run a real show on this? If not, what is the one thing that stops you?',
  "What did you expect to find and couldn't?",
  'Would your judges score on a phone after seeing it? What would they say?',
];

/** What to write down for each task, from the sheet's "For each task" list. */
export const MOCK_SHOW_NOTE_PROMPTS: readonly string[] = [
  "Where you stopped and didn't know what to do next. The screen, and what you were looking for.",
  "Any word or message you didn't understand. Copy it exactly.",
  'Anything that looked wrong: a name, a number, a total, a time, a placement.',
  'Anything you had to do twice.',
  'Where paper would have been quicker, and why.',
];

/** Joins a task's name to its detail the way the sheet reads. */
export function taskSeparator(detail: string): string {
  if (detail.startsWith(',')) return '';
  return /^[a-z]/.test(detail) ? ' ' : '. ';
}
