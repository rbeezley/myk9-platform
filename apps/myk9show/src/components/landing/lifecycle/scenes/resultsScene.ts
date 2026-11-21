import { SCENE_LINES } from '../lifecycleStories';
import { wholeScreen, zoomOnRing } from '../sceneFrames';
import type { DeviceView, Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import { DESK_CAMERA_WIDTH } from './entriesScene';
import regions from './resultsRegions.json';

// "Results": the secretary's desktop and the exhibitor's phone, from the Results tab listing a
// finished class to the exhibitor opening the result card (docs/plan-landing-animated-timeline.md).
// Both stories play it, on the same four lines; the club leads with the desk and the exhibitor
// with the phone (TimelineStep). The images and every region below come from the capture spec
// (src/test/e2e/capture/landingSceneResultsCapture.spec.ts), which reads the running app on the
// seed show of an isolated stack. Nothing here is typed by eye: every ring is a region the script
// measured, and every camera is placed on a ring by one rule. The camera sizes are the Entries
// open scene's: the page draws both scenes at the same width.

const PHONE_SPACE = regions.phone.space;
const DESK_SPACE = regions.desk.space;

const PHONE_SHOTS = regions.phone.shots;
const DESK_SHOTS = regions.desk.shots;
type PhoneShot = keyof typeof PHONE_SHOTS;
type DeskShot = keyof typeof DESK_SHOTS;

// Each description is of what the camera holds in that frame, in the labels the screen uses.
const PHONE_ALT: Record<PhoneShot, string> = {
  before:
    'My Entries on the phone: Piper, Armband 101, marked Scored, and her Container Novice A line with no result on it yet',
  new: 'My Entries on the phone: Piper, Armband 101, marked Scored, and on her Container Novice A line a New result button',
  card: 'The New result card on the phone: Piper, Armband 101, Heartland Scent Work Classic, Q and 1st in Container Novice A, Time 41.30s, Faults 0 faults, and a Share button',
};
const DESK_ALT: Record<DeskShot, string> = {
  list: 'The Results tab, with Show set to Needs me (1): Container Novice A, Scored 3 / 3, marked Needs checking, with Check scores beside it',
  class:
    'The open class on the Results tab: a Release results button above the table of placements, with Piper first, Q, 0:41.30, then Willow and Cooper',
  release:
    'The open class, Container Novice A, marked Not released and Needs checking, with a Release results button under Release the results',
  released:
    'The open class after the press: Container Novice A, Scored 3 / 3, 3 Q and Released, with Print the results sheet and result labels as the next step',
};

const phoneShot = (name: PhoneShot): SceneShot => ({
  src: `/landing/scenes/results/${PHONE_SHOTS[name].file}`,
  alt: PHONE_ALT[name],
  width: Math.round(PHONE_SPACE.width * regions.phone.scale),
  height: Math.round(PHONE_SPACE.height * regions.phone.scale),
});
const deskShot = (name: DeskShot): SceneShot => ({
  src: `/landing/scenes/results/${DESK_SHOTS[name].file}`,
  alt: DESK_ALT[name],
  width: Math.round(DESK_SPACE.width * regions.desk.scale),
  height: Math.round(DESK_SPACE.height * regions.desk.scale),
});

const phoneView = (shot: PhoneShot, ring: Region): DeviceView => ({
  shot,
  camera: wholeScreen(PHONE_SPACE),
  ring,
});
const deskView = (shot: DeskShot, ring: Region, alsoShow?: Region): DeviceView => ({
  shot,
  camera: zoomOnRing(DESK_SPACE, alsoShow ?? ring, DESK_CAMERA_WIDTH),
  ring,
});
/** The same view with no ring: how a device rests while the other one is the subject. */
const resting = ({ shot, camera }: DeviceView): DeviceView => ({ shot, camera });

const { new: phoneNew, card } = PHONE_SHOTS;
const { list, class: deskClass, release, released } = DESK_SHOTS;

// The exhibitor's phone before the release: the dog's class on My Entries, where the result will
// arrive. It rests there while the secretary works.
const phoneBefore: DeviceView = {
  shot: 'before',
  camera: wholeScreen(PHONE_SPACE),
};

const deskList = deskView('list', list.regions.action, list.regions.row);
const deskPlacements = deskView('class', deskClass.regions.table);
// One button: the ring is the Release results button, and the camera holds the card it sits in.
const deskRelease = deskView('release', release.regions.button, release.regions.card);
const deskReleased = deskView('released', released.regions.chips, released.regions.header);
const phoneArrived = phoneView('new', phoneNew.regions.button);
const phoneCard = phoneView('card', card.regions.card);

const RESULTS_FRAMES: readonly SceneFrame[] = [
  { line: 0, ms: 4200, subject: 'desk', desk: deskList, phone: phoneBefore },
  { line: 1, ms: 4400, subject: 'desk', desk: deskPlacements, phone: phoneBefore },
  { line: 2, ms: 3800, subject: 'desk', desk: deskRelease, phone: phoneBefore },
  { line: 2, ms: 4200, subject: 'desk', desk: deskReleased, phone: phoneBefore },
  // The release reaches the phone: it is the subject, and the desk rests on its released class.
  { line: 3, ms: 4000, subject: 'phone', desk: resting(deskReleased), phone: phoneArrived },
  { line: 3, ms: 4600, subject: 'phone', desk: resting(deskReleased), phone: phoneCard },
];

// Under reduced motion a line rests on its last frame (sceneState.ts), so each line ends on the
// frame its heading names: the waiting class closes line 1, the placement table line 2, the
// class reading Released line 3 and the exhibitor's result card line 4 (resultsScene.test.tsx).
export const RESULTS_SCENE: TimelineSceneData = {
  id: 'results',
  name: 'Results walkthrough',
  lines: SCENE_LINES.results,
  desk: {
    label: 'The secretary’s screen',
    space: DESK_SPACE,
    shots: Object.fromEntries(
      (Object.keys(DESK_SHOTS) as DeskShot[]).map(name => [name, deskShot(name)])
    ),
  },
  phone: {
    label: 'The exhibitor’s phone',
    space: PHONE_SPACE,
    shots: Object.fromEntries(
      (Object.keys(PHONE_SHOTS) as PhoneShot[]).map(name => [name, phoneShot(name)])
    ),
  },
  frames: RESULTS_FRAMES,
};
