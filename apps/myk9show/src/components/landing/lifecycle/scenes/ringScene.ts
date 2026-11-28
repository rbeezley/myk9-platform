import { SCENE_LINES } from '../lifecycleStories';
import { wholeScreen } from '../sceneFrames';
import type { Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import regions from './ringRegions.json';

// "Show day, at the ring": the judge's phone alone, from the ring's classes to a score that
// sends itself when the internet comes back (docs/archive/plan-landing-animated-timeline.md).
// The images and every region below come from the capture spec (src/test/e2e/capture), which reads the
// running app on the seed show of an isolated stack. Nothing here is typed by eye: every ring
// is a region the script measured.

const SPACE = regions.space;
type ShotName = keyof typeof regions.shots;

const ALT: Record<ShotName, string> = {
  classes:
    'Ringside on the judge’s phone: the classes in this ring, with Exterior Excellent not started and 0 of 1 dogs scored',
  offline:
    'The class’s list of dogs with Juni up next, and a message: You’re offline, changes are saved on this device and will be sent when you are back online',
  sheet: 'Juni’s scoresheet with the timer at zero and a Start button',
  running: 'The scoresheet timer running at about 38 seconds, with a Stop button',
  result:
    'The scoresheet stopped at 38 seconds with Qualified chosen from Qualified, NQ, Absent, Excused and DQ',
  confirm:
    'Score Confirmation reading back armband 102, Juni, Qualified and the time, with Confirm and Submit',
  saved: 'Back on the class’s page: Saved, 102 Juni, Qualified, on this device, not sent yet',
  sent: 'The class’s page: the Saved line no longer says not sent yet, and a Scores sent message shows',
};

const shot = (name: ShotName): SceneShot => ({
  src: `/landing/scenes/ring/${regions.shots[name].file}`,
  alt: ALT[name],
  width: Math.round(SPACE.width * regions.scale),
  height: Math.round(SPACE.height * regions.scale),
});

const SHOT_NAMES = Object.keys(regions.shots) as ShotName[];

/** One capture on the whole phone screen, with the part its line is about ringed. */
function frame(line: number, ms: number, name: ShotName, ring: Region): SceneFrame {
  return { line, ms, subject: 'phone', phone: { shot: name, camera: wholeScreen(SPACE), ring } };
}

const { classes, offline, sheet, running, result, confirm, saved, sent } = regions.shots;

export const RING_SCENE: TimelineSceneData = {
  id: 'showday-ring',
  name: 'Show day ring walkthrough',
  lines: SCENE_LINES['showday-ring'],
  phone: {
    label: 'The judge’s phone',
    space: SPACE,
    shots: Object.fromEntries(SHOT_NAMES.map(name => [name, shot(name)])),
  },
  // Every frame is the whole phone screen with a ring on what its line says. There is no zoom
  // and no crop: the screen is captured 390 wide, which reads at the 220 to 250 the page draws it.
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
