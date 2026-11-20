import { SCENE_LINES } from '../lifecycleStories';
import { windowOnRing, zoomOnRing } from '../sceneFrames';
import type { DeviceView, Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import regions from './entriesRegions.json';

// "Entries open": the exhibitor's phone and the secretary's desktop, from the exhibitor picking
// a dog to the secretary accepting the form (docs/plan-landing-animated-timeline.md). Both
// stories play it, on the same five lines; the club leads with the desk and the exhibitor with
// the phone (TimelineStep). The images and every region below come from the capture spec
// (src/test/e2e/capture/landingSceneEntriesCapture.spec.ts), which reads the running app on the
// seed show of an isolated stack. Nothing here is typed by eye: every ring is a region the
// script measured, and every camera is placed on a ring by one rule.

const PHONE_SPACE = regions.phone.space;
const DESK_SPACE = regions.desk.space;
/**
 * The phone's window is 3:4, like the ring scene's: a whole phone in the frame would make the
 * landing page too long on a phone (the page-length limit in landing-lifecycle.spec.ts).
 */
export const PHONE_WINDOW_HEIGHT = Math.round((PHONE_SPACE.width * 4) / 3);
/**
 * How much of the secretary's 1440px screen one camera holds. The page draws the desk about 343
 * wide on a phone, so this is the widest that still reads there; a ring wider than it widens
 * the camera (zoomOnRing), never crops.
 */
export const DESK_CAMERA_WIDTH = 640;

const PHONE_SHOTS = regions.phone.shots;
const DESK_SHOTS = regions.desk.shots;
type PhoneShot = keyof typeof PHONE_SHOTS;
type DeskShot = keyof typeof DESK_SHOTS;

const PHONE_ALT: Record<PhoneShot, string> = {
  dogs: 'The entry wizard on the exhibitor’s phone, Select Dogs to Enter, with Maple chosen',
  classes:
    'The wizard’s Select Classes step, with Handler Discrimination Advanced marked Full and a reason that the class is full',
  payment:
    'The wizard’s Payment step with the credit or debit card chosen and a button that reads Pay with the amount on it',
  pending: 'My Entries on the phone: Maple’s card with a Pending review label',
  accepted: 'My Entries on the phone: Maple’s card, now labelled Accepted',
};
const DESK_ALT: Record<DeskShot, string> = {
  before: 'The secretary’s Entry Forms list before the exhibitor’s form arrives',
  list: 'The Entry Forms list with the exhibitor’s form marked Needs review, with its payment shown beside it',
  review:
    'The open entry form, under To finish this form: one entry needs review, with an Accept button',
  accepted: 'The open entry form after Accept, with its label changed to Accepted',
};

const phoneShot = (name: PhoneShot): SceneShot => ({
  src: `/landing/scenes/entries/${PHONE_SHOTS[name].file}`,
  alt: PHONE_ALT[name],
  width: Math.round(PHONE_SPACE.width * regions.phone.scale),
  height: Math.round(PHONE_SPACE.height * regions.phone.scale),
});
const deskShot = (name: DeskShot): SceneShot => ({
  src: `/landing/scenes/entries/${DESK_SHOTS[name].file}`,
  alt: DESK_ALT[name],
  width: Math.round(DESK_SPACE.width * regions.desk.scale),
  height: Math.round(DESK_SPACE.height * regions.desk.scale),
});

const phoneView = (shot: PhoneShot, ring: Region): DeviceView => ({
  shot,
  camera: windowOnRing(PHONE_SPACE, ring, PHONE_WINDOW_HEIGHT),
  ring,
});
const deskView = (shot: DeskShot, ring: Region, alsoShow?: Region): DeviceView => ({
  shot,
  camera: zoomOnRing(DESK_SPACE, alsoShow ?? ring, DESK_CAMERA_WIDTH),
  ring,
});
/** The same view with no ring: how a device rests while the other one is the subject. */
const resting = ({ shot, camera }: DeviceView): DeviceView => ({ shot, camera });

const { dogs, classes, payment, pending, accepted: phoneAccepted } = PHONE_SHOTS;
const { before, list, review, accepted: deskAccepted } = DESK_SHOTS;

// The secretary's list before the form arrives: its top, where the queue starts.
const queue = before.regions.queue;
const queueTop: Region = {
  x: queue.x,
  y: queue.y,
  w: Math.min(queue.w, DESK_CAMERA_WIDTH),
  h: 120,
};
const deskBefore: DeviceView = {
  shot: 'before',
  camera: zoomOnRing(DESK_SPACE, queueTop, DESK_CAMERA_WIDTH),
};

const phoneDogs = phoneView('dogs', dogs.regions.row);
const phoneClasses = phoneView('classes', classes.regions.chip);
const phonePayment = phoneView('payment', payment.regions.pay);
const phonePending = phoneView('pending', pending.regions.badge);
const phoneNow = phoneView('accepted', phoneAccepted.regions.badge);
const deskForm = deskView('list', list.regions.row);
// One button: the ring is the Accept button, and the camera holds the item it belongs to.
const deskReview = deskView('review', review.regions.accept, review.regions.item);
const deskNow = deskView('accepted', deskAccepted.regions.badge);

const ENTRIES_FRAMES: readonly SceneFrame[] = [
  { line: 0, ms: 3600, subject: 'phone', desk: deskBefore, phone: phoneDogs },
  { line: 0, ms: 4600, subject: 'phone', desk: deskBefore, phone: phoneClasses },
  { line: 1, ms: 4400, subject: 'phone', desk: deskBefore, phone: phonePayment },
  { line: 2, ms: 4000, subject: 'phone', desk: deskBefore, phone: phonePending },
  { line: 3, ms: 4200, subject: 'desk', desk: deskForm, phone: resting(phonePending) },
  { line: 4, ms: 3800, subject: 'desk', desk: deskReview, phone: resting(phonePending) },
  // The decision reaches the phone: both screens are the subject.
  { line: 4, ms: 4600, subject: 'both', desk: deskNow, phone: phoneNow },
];

// Under reduced motion a line rests on its last frame (sceneState.ts), so each line ends on
// the frame its heading names: the full class closes line 1, the Pay button line 2, Pending
// review line 3, the Needs review row line 4 and Accepted line 5 (entriesScene.test.tsx).
export const ENTRIES_SCENE: TimelineSceneData = {
  id: 'entries',
  lines: SCENE_LINES.entries,
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
  frames: ENTRIES_FRAMES,
};
