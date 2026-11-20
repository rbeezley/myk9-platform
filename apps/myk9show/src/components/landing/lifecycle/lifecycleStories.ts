// Copy, screenshots and explainer steps for the landing page's show-lifecycle timeline.
// Every claim here must have a KEEP row in docs/qa/landing-lifecycle-evidence.md.
// Copy rules are enforced by BANNED_COPY in lifecycleStories.test.ts and on the rendered
// page in Home.test.tsx. Design reference: canvas version D (docs/plan-landing-lifecycle.md).

export type Audience = 'club' | 'exhibitor';
export type StepId = 'setup' | 'entries' | 'before' | 'showday' | 'results' | 'after';
export type ShotShape = 'phone' | 'desktop';
export type Shot = {
  /** `stills/` holds the captures of the Landing capture workflow; `stages/` the one hand-taken still left. */
  src: `/landing/${'stills' | 'stages'}/${string}.png`;
  alt: string;
  width: number;
  height: number;
  shape: ShotShape;
};
export type ExplainerStep = {
  x: number;
  y: number;
  w: number;
  h: number; // percent of the image; w === 0 means "no highlight, dim only"
  caption: string;
  badge?: { text: string; tone: 'amber' | 'green' };
};
export type StoryStep = {
  id: StepId;
  title: string;
  body: string;
  shot: Shot | null;
  explainer?: readonly ExplainerStep[];
  scoresheetDemo?: true; // club show day: the working practice scoresheet (D9)
  nightBefore?: true; // club before show day: the night-before checklist (D11)
  /** An animated scene of real captures, on this side of the step (MYK9-1894). */
  scene?: SceneId;
  /** The same, on the meanwhile side. The meanwhile side carries a sentence or a scene, never a still (MYK9-2295). */
  meanwhileScene?: SceneId;
  meanwhile: string;
  peak?: true;
};

export const BANNED_COPY: readonly RegExp[] = [
  /—/,
  /→/,
  /waitlist/i,
  /pre-launch/i,
  /launching/i,
  /\bv\d+\.\d+/,
];

// INTENT: clubs first at launch (owner decision 2026-10-13). Flip when /shows has enough shows.
export const DEFAULT_AUDIENCE: Audience = 'club';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  club: 'I’m running a show',
  exhibitor: 'I’m entering a show',
};
export const STORY_HEADING: Record<Audience, string> = {
  club: 'Your show, step by step',
  exhibitor: 'Your show weekend, step by step',
};
export const MEANWHILE_LABEL: Record<Audience, string> = {
  club: 'Meanwhile, your exhibitors',
  exhibitor: 'Meanwhile, the club',
};
export const PEAK_LEAD: Record<Audience, string> = {
  club: 'Then show day arrives, and the venue has no signal.',
  exhibitor: 'Then it’s show day.',
};

// A still is one picture from the Landing capture workflow (landingStillsCapture.spec.ts, MYK9-2309).
// A desktop still is a 680x425 window of the screen at twice its size, so its words read where the
// page draws it (about 440px wide, about 330 on a phone); a phone still is the whole 390x844 screen.
const desktopStill = (file: string, alt: string): Shot => ({
  src: `/landing/stills/${file}.png`,
  alt,
  width: 680,
  height: 425,
  shape: 'desktop',
});
const phoneStill = (file: string, alt: string): Shot => ({
  src: `/landing/stills/${file}.png`,
  alt,
  width: 390,
  height: 844,
  shape: 'phone',
});

const SHOTS = {
  'club-create-show': desktopStill(
    'club-create-show',
    'The Add Show wizard on Step 1 of 4, with the steps Show Details, Trials and Classes and the Clone from a previous show box with its Select a past show to clone menu'
  ),
  'exhibitor-find-a-show': desktopStill(
    'exhibitor-find-a-show',
    'Find Shows cards for the Heartland Scent Work Classic, marked Entry Submitted, and the Heartland ASCA Scent Detection Trial, marked Accepting Entries'
  ),
  'exhibitor-my-entries': phoneStill(
    'exhibitor-my-entries',
    'My Entries card for Willow, Armband 100, marked Accepted, with Interior Advanced and Container Novice A on Mon, Jan 4, each noting Check in on the day'
  ),
  'exhibitor-past-results': phoneStill(
    'exhibitor-past-results',
    'Willow’s Competitions card on the Past Results tab: three results from the Prairie Trail Fall Scent Work Trial, Exterior Novice A Q #1, Interior Novice A Q #2 and Container Novice A Q #1'
  ),
  // The exhibitor's show-day explainer still: the banner shows only on a show's own day.
  'e-13': {
    src: '/landing/stages/e-13.png',
    alt: 'My Entries on a phone with the Show Today banner',
    width: 390,
    height: 844,
    shape: 'phone',
  },
} as const satisfies Record<string, Shot>;

const EXHIBITOR_SHOW_DAY: readonly ExplainerStep[] = [
  { x: 5, y: 32.5, w: 90, h: 23, caption: 'Show day is here: your first class time and entries' },
  { x: 10, y: 44.8, w: 49, h: 7, caption: 'One tap to today’s classes' },
  { x: 5, y: 87, w: 90, h: 12.5, caption: 'Each dog’s classes for the day' },
];

// Scene lines for the animated timeline (docs/plan-landing-animated-timeline.md, MYK9-1894).
// A line is a short heading plus one plain sentence, written to the club: "you" is the show
// secretary (owner, 2026-11-16). Every claim has a KEEP row in
// docs/qa/landing-lifecycle-evidence.md. The words describe the screen; the capture shows it.
export type SceneId = 'entries' | 'showday-ring' | 'showday-desk' | 'results';
export type SceneLine = { head: string; text: string };

export const SCENE_LINES: Record<SceneId, readonly SceneLine[]> = {
  entries: [
    {
      head: 'An exhibitor enters online',
      text: 'They pick a dog and their classes. A full class says so, and they can only join its waiting list if you allow one.',
    },
    {
      head: 'They pay as they enter',
      text: 'They pay by card at a secure checkout, or by check or cash at the show if you turn those on.',
    },
    {
      head: 'They can see where it stands',
      text: 'Their entry reads Pending review until you decide.',
    },
    {
      head: 'The form arrives in your list',
      text: 'It is marked Needs review, with the payment shown beside it.',
    },
    {
      head: 'You open it and accept',
      text: 'One button. Their entry changes to Accepted and they get an email.',
    },
  ],
  'showday-ring': [
    {
      head: 'The judge opens the ring’s classes',
      text: 'Each class shows how many dogs are scored.',
    },
    {
      head: 'The signal drops',
      text: 'The screen says changes are saved on this device, and the run order stays.',
    },
    {
      head: 'The judge times and scores the run',
      text: 'Start, Stop, then Qualified, NQ, Absent, Excused or DQ.',
    },
    {
      head: 'The score is read back before it saves',
      text: 'The judge checks the dog, the result and the time, then confirms.',
    },
    {
      head: 'The signal returns',
      text: 'The saved score sends itself, and the screen says Scores sent.',
    },
  ],
  'showday-desk': [
    {
      head: 'Your day is on one page',
      text: 'Each class says where it stands, like 3 of 5 not checked in.',
    },
    {
      head: 'Check in at the desk',
      text: 'Find an exhibitor by name, dog or armband and check in each dog.',
    },
    {
      head: 'Watch the classes run',
      text: 'A running class shows how many dogs are scored and who is in the ring.',
    },
    {
      head: 'No tablets? Type in the paper scores',
      text: 'The dogs are listed in run order. Pick the result, type the time, save and move on.',
    },
    {
      head: 'Mark the class complete',
      text: 'It asks first if paper scores are missing, then takes you to Results.',
    },
  ],
  results: [
    {
      head: 'A finished class is waiting for you',
      text: 'The Results tab lists it with what to do next: check the scores.',
    },
    {
      head: 'The placements are worked out',
      text: 'Open the class to see them, ranked from the scores.',
    },
    {
      head: 'You release the results',
      text: 'One press. The class reads Released and exhibitors can see their scores.',
    },
    {
      head: 'The exhibitor sees it on their phone',
      text: 'My Entries shows New result on the dog’s class, and it opens the result card.',
    },
  ],
};

export const STORIES: Record<Audience, readonly StoryStep[]> = {
  club: [
    {
      id: 'setup',
      title: 'Set up the show',
      body: 'Classes, levels and qualifying rules for AKC, UKC and ASCA are built in. Start from last year’s show and change what is new.',
      shot: SHOTS['club-create-show'],
      meanwhile: 'Exhibitors can find your show and read the premium list as soon as you publish.',
    },
    {
      id: 'entries',
      title: 'Entries open',
      body: 'Entries arrive in one list, already checked against class limits. Nothing to re-type.',
      shot: null,
      scene: 'entries',
      meanwhile: 'Exhibitors enter online in a few minutes, with their dogs saved.',
    },
    {
      id: 'before',
      title: 'Before show day',
      body: 'Running orders, check-in sheets and armbands come from the entries you already have.',
      shot: null,
      nightBefore: true,
      meanwhile: 'Exhibitors see their armband number and their classes.',
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Judges score at the ring on a phone or tablet, even with no signal. Scores catch up on their own when the connection comes back.',
      shot: null,
      scene: 'showday-ring',
      scoresheetDemo: true,
      meanwhile:
        'Exhibitors follow their classes from their phones, and check in where you allow it.',
    },
    {
      id: 'results',
      title: 'Results',
      body: 'Placements are worked out from the scores. You choose when results go public.',
      shot: null,
      scene: 'results',
      meanwhile: 'Each exhibitor sees their dog’s placement the moment you release it.',
    },
    {
      id: 'after',
      title: 'After the show',
      body: 'Every result is already recorded. Nothing to re-key.',
      shot: null,
      meanwhile: 'Every Q stays on each dog’s record, show after show.',
    },
  ],
  exhibitor: [
    {
      id: 'setup',
      title: 'Find a show',
      body: 'Browse upcoming scent work shows by registry and date. Open any show to see what the club has published.',
      shot: SHOTS['exhibitor-find-a-show'],
      meanwhile: 'The club sets up the show, with AKC, UKC or ASCA rules already built in.',
    },
    {
      id: 'entries',
      title: 'Enter in a few minutes',
      body: 'Pick your classes and enter online where the club accepts it.',
      shot: null,
      scene: 'entries',
      meanwhile: 'Entries arrive in one list, already checked against class limits.',
    },
    {
      id: 'before',
      title: 'Know where to be',
      body: 'See your armband number and the classes your dog is entered in.',
      shot: SHOTS['exhibitor-my-entries'],
      meanwhile: 'Running orders, check-in sheets and armbands come straight from the entries.',
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Check in where the club allows it, and follow your classes from your phone.',
      shot: SHOTS['e-13'],
      explainer: EXHIBITOR_SHOW_DAY,
      meanwhile: 'Judges score at the ring on a phone or tablet, even with no signal at all.',
      meanwhileScene: 'showday-ring',
    },
    {
      id: 'results',
      title: 'There’s your placement',
      body: 'Your dog’s placement shows up as soon as the club releases results.',
      shot: null,
      scene: 'results',
      meanwhile:
        'Placements are worked out from the scores, and the club chooses when to release them.',
    },
    {
      id: 'after',
      title: 'Every Q on your dog’s record',
      body: 'Qualifying runs stay on your dog’s record, show after show.',
      shot: SHOTS['exhibitor-past-results'],
      meanwhile: 'The results are already recorded, with nothing to re-type.',
    },
  ],
};
