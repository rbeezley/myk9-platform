import { SCENE_LINES } from '../lifecycleStories';
import { cameraAround, closeView } from '../sceneFrames';
import type { Region, SceneFrame, SceneShot, TimelineSceneData } from '../sceneFrames';
import regions from './ringRegions.json';

// "Show day, at the ring": the judge's tablet alone, from the ring's classes to a score that
// sends itself when the signal returns (docs/plan-landing-animated-timeline.md).
// The images and every region below come from a capture script that reads the running app on
// the seed show (MYK9-2181 lands the script). Nothing here is typed by eye: a camera is worked
// out from the measured region it shows.

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

type View = { camera: Region; ring?: Region };

function frame(line: number, ms: number, name: ShotName, view: View, rest?: true): SceneFrame {
  return { line, ms, subject: 'phone', phone: { shot: name, ...view }, ...(rest && { rest }) };
}

// The two views every line is built from.
/** The whole page with the part the line is about ringed: where on the tablet this is. */
const whole = (ring: Region): View => ({ camera: WHOLE, ring });
/** A large control (a button, the timer, a dialog), with a little room around it. */
const control = (region: Region, { ring = region, pad = 24 } = {}): View => ({
  camera: cameraAround(SPACE, region, { pad }),
  ring,
});
/**
 * Small text, close enough to read. Measured on the page at a 375px phone, the solo tablet is
 * 235px wide; the app's small text is 15 to 17px, so a camera 320 wide draws it at 11 to 12px.
 */
const READABLE = 320;
const words = (region: Region, align: 'start' | 'end' = 'start'): View =>
  closeView(SPACE, region, { width: READABLE, align });

const { classes, offline, sheet, running, result, confirm, saved, sent } = regions.shots;

export const RING_SCENE: TimelineSceneData = {
  id: 'showday-ring',
  lines: SCENE_LINES['showday-ring'],
  phone: {
    label: 'The judge’s tablet',
    space: SPACE,
    shots: Object.fromEntries(SHOT_NAMES.map(name => [name, shot(name)])),
  },
  // One rule for every line: a screen the visitor has not seen yet opens on the whole page, so
  // they know where they are, and then the camera goes close to what the line says. Under
  // reduced motion a line shows one frame: its last, or the one marked to stand for it.
  frames: [
    frame(0, 1600, 'classes', whole(classes.regions.card)),
    frame(0, 3200, 'classes', control(classes.regions.card)),

    // The whole page first: the dog up next, with its armband and check-in, is the run order
    // that stays. Then the header's own words.
    frame(1, 1800, 'offline', whole(offline.regions.status)),
    frame(1, 3200, 'offline', words(offline.regions.status)),

    frame(2, 1200, 'sheet', whole(sheet.regions.start)),
    frame(2, 1800, 'sheet', control(sheet.regions.start)),
    frame(2, 2600, 'running', control(running.regions.timer, { ring: running.regions.time })),
    frame(2, 3200, 'result', control(result.regions.result)),

    // The read-back is what the line's heading names, so it stands for the line. The dialog
    // sits over the page it came from and needs no whole-page frame.
    frame(3, 3600, 'confirm', control(confirm.regions.dialog, { pad: 48 }), true),
    frame(3, 1600, 'saved', whole(saved.regions.text)),
    // The line is too wide to read whole: hold its end, "on this device, not sent yet".
    frame(3, 3000, 'saved', words(saved.regions.text, 'end')),

    // The same page once the signal is back, then the message that says the score went.
    frame(4, 2400, 'sent', whole(sent.regions.text)),
    frame(4, 3600, 'sent', words(sent.regions.toast)),
  ],
};
