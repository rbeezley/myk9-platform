import { SCENE_LINES } from '../lifecycleStories';
import { windowOnRing } from '../sceneFrames';
import type { Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import regions from './ringRegions.json';

// "Show day, at the ring": the judge's phone alone, from the ring's classes to a score that
// sends itself when the signal returns (docs/plan-landing-animated-timeline.md).
// The images and every region below come from scripts/landing-capture/ring.ts, which reads the
// running app on the seed show of an isolated stack. Nothing here is typed by eye: every ring
// is a region the script measured.

const SPACE = regions.space;
/**
 * The frame is 3:4, the shape it had when the screen was a tablet, so the scene is no taller
 * on the page than it was (the phone page-length limit in landing-lifecycle.spec.ts). A phone
 * is taller than that, so each frame is a window on it.
 */
export const RING_WINDOW_HEIGHT = Math.round((SPACE.width * 4) / 3);

type ShotName = keyof typeof regions.shots;

const ALT: Record<ShotName, string> = {
  classes:
    'Ringside on the judge’s phone: the classes in this ring, with Exterior Excellent not started and 0 of 1 dogs scored',
  offline:
    'The class’s list of dogs with a no-signal icon in the header, Juni up next, and a message that changes are saved on this device',
  sheet: 'Juni’s scoresheet with the timer at zero and a Start button',
  running: 'The scoresheet timer running at about 38 seconds, with a Stop button',
  result:
    'The scoresheet stopped at 38 seconds with Qualified chosen from Qualified, NQ, Absent, Excused and DQ',
  confirm:
    'Score Confirmation reading back armband 102, Juni, Qualified and the time, with Confirm and Submit',
  saved: 'Back on the list of dogs: Saved, 102 Juni, Qualified, on this device, not sent yet',
  sent: 'The list of dogs: the Saved line no longer says not sent yet, and a Scores sent message shows',
};

const shot = (name: ShotName): SceneShot => ({
  src: `/landing/scenes/ring/${regions.shots[name].file}`,
  alt: ALT[name],
  width: Math.round(SPACE.width * regions.scale),
  height: Math.round(SPACE.height * regions.scale),
});

const SHOT_NAMES = Object.keys(regions.shots) as ShotName[];

/** One capture with the part its line is about ringed, in the window that rule gives. */
function frame(line: number, ms: number, name: ShotName, ring: Region): SceneFrame {
  const camera = windowOnRing(SPACE, ring, RING_WINDOW_HEIGHT);
  return { line, ms, subject: 'phone', phone: { shot: name, camera, ring } };
}

const { classes, offline, sheet, running, result, confirm, saved, sent } = regions.shots;

export const RING_SCENE: TimelineSceneData = {
  id: 'showday-ring',
  lines: SCENE_LINES['showday-ring'],
  phone: {
    label: 'The judge’s phone',
    space: SPACE,
    shots: Object.fromEntries(SHOT_NAMES.map(name => [name, shot(name)])),
  },
  // Every frame is the phone at its full width with a ring on what its line says, and the
  // window follows the ring (windowOnRing): no camera is picked by hand. There is no zoom: the
  // screen is captured 390 wide, which reads at the 235 the page draws it on a phone.
  // A line rests on its last frame under reduced motion, so each line ends on the frame its
  // heading names: the read-back closes line 4, and the saved list opens line 5.
  frames: [
    frame(0, 4200, 'classes', classes.regions.card),
    frame(1, 4200, 'offline', offline.regions.status),
    frame(2, 2400, 'sheet', sheet.regions.start),
    frame(2, 2600, 'running', running.regions.time),
    frame(2, 3200, 'result', result.regions.result),
    frame(3, 3600, 'confirm', confirm.regions.dialog),
    // Saved on the device and not sent yet, the same line once it is sent, then the message
    // that says it went.
    frame(4, 3600, 'saved', saved.regions.text),
    frame(4, 2600, 'sent', sent.regions.text),
    frame(4, 3600, 'sent', sent.regions.toast),
  ],
};
