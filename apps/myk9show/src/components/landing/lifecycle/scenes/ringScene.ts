import { SCENE_LINES } from '../lifecycleStories';
import { cameraAround } from '../sceneFrames';
import type { Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import regions from './ringRegions.json';

// "Show day, at the ring": the judge's tablet alone, from the ring's classes to a score that
// sends itself when the signal returns (docs/plan-landing-animated-timeline.md).
// The images and every region below come from `pnpm --filter @myk9/show capture:landing:ring`
// (scripts/landing-capture/ring.ts), which reads the running app on the seed show. Nothing here
// is typed by eye: a camera is worked out from the measured region it shows.

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

function frame(
  line: number,
  ms: number,
  name: ShotName,
  ring: Region,
  camera: Region = WHOLE
): SceneFrame {
  return { line, ms, subject: 'phone', phone: { shot: name, camera, ring } };
}

const around = (region: Region, minWidth = 0, pad = 24) =>
  cameraAround(SPACE, region, { pad, minWidth });

const { classes, offline, sheet, running, result, confirm, saved, sent } = regions.shots;

export const RING_SCENE: TimelineSceneData = {
  id: 'showday-ring',
  lines: SCENE_LINES['showday-ring'],
  phone: {
    label: 'The judge’s tablet',
    space: SPACE,
    shots: Object.fromEntries(SHOT_NAMES.map(name => [name, shot(name)])),
  },
  // Each frame zooms to the part its line is about, so the words on the tablet can be read on
  // a phone. A small control is held to a camera no narrower than its `minWidth`.
  frames: [
    frame(0, 4200, 'classes', classes.regions.card, around(classes.regions.card)),
    // Whole page: the dog up next, with its armband and check-in, is the run order that stays.
    frame(1, 4200, 'offline', offline.regions.status),
    frame(2, 2400, 'sheet', sheet.regions.start, around(sheet.regions.start)),
    frame(2, 2600, 'running', running.regions.time, around(running.regions.timer)),
    frame(2, 3200, 'result', result.regions.result, around(result.regions.result)),
    frame(3, 3600, 'confirm', confirm.regions.dialog, around(confirm.regions.dialog, 0, 48)),
    frame(3, 3600, 'saved', saved.regions.text),
    // The same line once the score is sent: "not sent yet" is gone.
    frame(4, 2600, 'sent', sent.regions.text),
    frame(4, 3600, 'sent', sent.regions.toast, around(sent.regions.toast, 480)),
  ],
};
