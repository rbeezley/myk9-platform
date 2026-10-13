// Copy, screenshots and explainer steps for the landing page's show-lifecycle timeline.
// Every claim here must have a KEEP row in docs/qa/landing-lifecycle-evidence.md.
// Copy rules are enforced by BANNED_COPY in lifecycleStories.test.ts and on the rendered
// page in Home.test.tsx. Design reference: canvas version D (docs/plan-landing-lifecycle.md).

export type Audience = 'club' | 'exhibitor';
export type StepId = 'setup' | 'entries' | 'before' | 'showday' | 'results' | 'after';
export type ShotShape = 'phone' | 'tablet' | 'desktop';
export type Shot = {
  src: `/landing/stages/${string}.png`;
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
  meanwhile: string;
  meanwhileShot: Shot | null;
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

const desktop = (id: string, alt: string): Shot => ({
  src: `/landing/stages/${id}.png`,
  alt,
  width: 1200,
  height: 750,
  shape: 'desktop',
});
const phone = (id: string, alt: string): Shot => ({
  src: `/landing/stages/${id}.png`,
  alt,
  width: 390,
  height: 844,
  shape: 'phone',
});
const tablet = (id: string, alt: string): Shot => ({
  src: `/landing/stages/${id}.png`,
  alt,
  width: 768,
  height: 1024,
  shape: 'tablet',
});

const SHOTS = {
  's-02': desktop('s-02', 'Create Show wizard, first step'),
  's-07': desktop('s-07', 'Entry Management showing entries that need review'),
  's-12': desktop('s-12', 'Check-in sheet report'),
  's-20': desktop('s-20', 'Results visibility settings for a show'),
  'j-04': tablet('j-04', 'Judge scoresheet on a tablet with the timer running'),
  'e-01': desktop('e-01', 'Upcoming shows list with entry status'),
  'e-02': desktop('e-02', 'Public show page with the Enter this show button'),
  'e-12': phone(
    'e-12',
    'My Entries card for Willow with armband 100, class, day and check-in status'
  ),
  'e-13': phone('e-13', 'My Entries on a phone with the Show Today banner'),
  'e-17': phone('e-17', 'Class results with the placement table on a phone'),
  'e-16': phone('e-16', 'Willow’s past results with qualifying runs and a first place'),
} as const;

// Measured on e-02.png (1200x750); see docs/qa/landing-lifecycle-evidence.md.
const EXHIBITOR_ENTRIES: readonly ExplainerStep[] = [
  { x: 12, y: 68.5, w: 76, h: 14.5, caption: 'Dates, venue and trials, all on the show page' },
  { x: 77, y: 7.5, w: 11, h: 6.5, caption: 'One button to enter' },
  { x: 53, y: 87.5, w: 35, h: 7, caption: 'You always know when entries close' },
];
const EXHIBITOR_SHOW_DAY: readonly ExplainerStep[] = [
  { x: 5, y: 32.5, w: 90, h: 23, caption: 'Show day is here: your first class time and entries' },
  { x: 10, y: 44.8, w: 49, h: 7, caption: 'One tap to today’s classes' },
  { x: 5, y: 87, w: 90, h: 12.5, caption: 'Each dog’s classes for the day' },
];

export const STORIES: Record<Audience, readonly StoryStep[]> = {
  club: [
    {
      id: 'setup',
      title: 'Set up the show',
      body: 'Classes, levels and qualifying rules for AKC, UKC and ASCA are built in. Start from last year’s show and change what is new.',
      shot: SHOTS['s-02'],
      meanwhile: 'Exhibitors can find your show and read the premium list as soon as you publish.',
      meanwhileShot: SHOTS['e-01'],
    },
    {
      id: 'entries',
      title: 'Entries open',
      body: 'Entries arrive in one list, already checked against class limits. Nothing to re-type.',
      shot: SHOTS['s-07'],
      meanwhile: 'Exhibitors enter online in a few minutes, with their dogs saved.',
      meanwhileShot: SHOTS['e-02'],
    },
    {
      id: 'before',
      title: 'Before show day',
      body: 'Running orders, check-in sheets and armbands come from the entries you already have.',
      shot: SHOTS['s-12'],
      nightBefore: true,
      meanwhile: 'Exhibitors see their armband and their place in the running order.',
      meanwhileShot: SHOTS['e-12'],
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Judges score at the ring on a tablet, even with no signal. Scores catch up on their own when the connection comes back.',
      shot: SHOTS['j-04'],
      scoresheetDemo: true,
      meanwhile:
        'Exhibitors follow their classes from their phones, and check in where you allow it.',
      meanwhileShot: SHOTS['e-13'],
    },
    {
      id: 'results',
      title: 'Results',
      body: 'Placements are worked out from the scores. You choose when results go public.',
      shot: SHOTS['s-20'],
      meanwhile: 'Each exhibitor sees their dog’s placement the moment you release it.',
      meanwhileShot: SHOTS['e-17'],
    },
    {
      id: 'after',
      title: 'After the show',
      body: 'Every result is already recorded. Nothing to re-key.',
      shot: null,
      meanwhile: 'Every Q stays on each dog’s record, show after show.',
      meanwhileShot: SHOTS['e-16'],
    },
  ],
  exhibitor: [
    {
      id: 'setup',
      title: 'Find a show',
      body: 'Browse upcoming scent work shows by registry and date. Every show page has the premium list, classes and judges.',
      shot: SHOTS['e-01'],
      meanwhile: 'The club sets up the show, with AKC, UKC or ASCA rules already built in.',
      meanwhileShot: SHOTS['s-02'],
    },
    {
      id: 'entries',
      title: 'Enter in a few minutes',
      body: 'Pick your classes and enter online where the club accepts it. Your dogs are saved for next time.',
      shot: SHOTS['e-02'],
      explainer: EXHIBITOR_ENTRIES,
      meanwhile: 'Entries arrive in one list, already checked against class limits.',
      meanwhileShot: SHOTS['s-07'],
    },
    {
      id: 'before',
      title: 'Know where to be',
      body: 'See your armband number and where your dog sits in the running order.',
      shot: SHOTS['e-12'],
      meanwhile: 'Running orders, check-in sheets and armbands come straight from the entries.',
      meanwhileShot: SHOTS['s-12'],
    },
    {
      id: 'showday',
      peak: true,
      title: 'Show day',
      body: 'Check in where the club allows it, and follow your classes from your phone.',
      shot: SHOTS['e-13'],
      explainer: EXHIBITOR_SHOW_DAY,
      meanwhile: 'Judges score at the ring on a tablet, even with no signal at all.',
      meanwhileShot: SHOTS['j-04'],
    },
    {
      id: 'results',
      title: 'There’s your placement',
      body: 'Your dog’s placement shows up as soon as the club releases results.',
      shot: SHOTS['e-17'],
      meanwhile:
        'Placements are worked out from the scores, and the club chooses when to release them.',
      meanwhileShot: SHOTS['s-20'],
    },
    {
      id: 'after',
      title: 'Every Q on your dog’s record',
      body: 'Qualifying runs stay on your dog’s record, show after show.',
      shot: SHOTS['e-16'],
      meanwhile: 'The results are already recorded, with nothing to re-type.',
      meanwhileShot: null,
    },
  ],
};
