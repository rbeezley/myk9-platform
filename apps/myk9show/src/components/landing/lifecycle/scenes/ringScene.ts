import { SCENE_LINES } from '../lifecycleStories';
import type { Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import regions from './ringRegions.json';

// "Show day, at the ring": the judge's tablet alone, from the ring's classes to a score that
// sends itself when the signal returns (docs/plan-landing-animated-timeline.md).
// The images and every region below come from a capture script that reads the running app on
// the seed show (MYK9-2181 lands the script). Nothing here is typed by eye: every ring is a
// region the script measured.

const SPACE = regions.space;
const WHOLE: Region = { x: 0, y: 0, w: SPACE.width, h: SPACE.height };

type ShotName = keyof typeof regions.shots;

const ALT: Record<ShotName, string> = {
  classes:
    'Ringside on the judge’s tablet: the classes in this ring, Container Novice A in progress with 2 of 3 dogs scored',
  offline:
    'The class’s list of dogs with the header reading Offline, scores saved on this device, and Cooper up next',
  sheet: 'Cooper’s scoresheet with the timer at zero and a Start button',
  running: 'The scoresheet timer running at 38 seconds, with a Stop button',
  result:
    'The scoresheet stopped at 38 seconds with Qualified chosen from Qualified, NQ, Absent, Excused and DQ',
  confirm:
    'Score Confirmation reading back armband 105, Cooper, Qualified and the time, with Confirm and Submit',
  saved: 'Back on the list of dogs: Saved, 105 Cooper, Qualified, on this device, not sent yet',
  sent: 'The list of dogs: the Saved line no longer says not sent yet, and a Scores sent message shows',
};

const shot = (name: ShotName): SceneShot => ({
  src: `/landing/scenes/ring/${regions.shots[name].file}`,
  alt: ALT[name],
  width: Math.round(SPACE.width * regions.scale),
  height: Math.round(SPACE.height * regions.scale),
});

const SHOT_NAMES = Object.keys(regions.shots) as ShotName[];

/** One capture, whole, with the part its line is about ringed. */
function frame(line: number, ms: number, name: ShotName, ring: Region): SceneFrame {
  return { line, ms, subject: 'phone', phone: { shot: name, camera: WHOLE, ring } };
}

const { classes, offline, sheet, running, result, confirm, saved, sent } = regions.shots;

export const RING_SCENE: TimelineSceneData = {
  id: 'showday-ring',
  lines: SCENE_LINES['showday-ring'],
  phone: {
    label: 'The judge’s tablet',
    space: SPACE,
    shots: Object.fromEntries(SHOT_NAMES.map(name => [name, shot(name)])),
  },
  // Every frame is the whole tablet with a ring on what its line says. There is no zoom: the
  // tablet is 768 wide and the page draws it 235 wide on a phone, so a camera close enough to
  // read crops whatever sits beside it. The numbered lines and the alt text carry the words
  // until the screen is captured at a width that reads (MYK9-2181).
  frames: [
    frame(0, 4200, 'classes', classes.regions.card),
    frame(1, 4200, 'offline', offline.regions.status),
    frame(2, 2400, 'sheet', sheet.regions.start),
    frame(2, 2600, 'running', running.regions.time),
    frame(2, 3200, 'result', result.regions.result),
    frame(3, 3600, 'confirm', confirm.regions.dialog),
    frame(3, 3600, 'saved', saved.regions.text),
    // The same line once the score is sent, then the message that says it went.
    frame(4, 2600, 'sent', sent.regions.text),
    frame(4, 3600, 'sent', sent.regions.toast),
  ],
};
