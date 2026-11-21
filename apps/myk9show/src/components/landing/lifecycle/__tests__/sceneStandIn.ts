import { SCENE_LINES } from '../lifecycleStories';
import type { SceneFrame, TimelineSceneData } from '../sceneFrames';

// STAND-IN DATA. The images are existing committed landing stills (a 1200x750 secretary screen
// and a 390x844 phone), not captures of the Entries open flow, and the regions are round numbers,
// not measured. The line text is the real SCENE_LINES.entries. Real captures replace this.
const DESK_CAM = { x: 0, y: 0, w: 600, h: 360 };
const PHONE_CAM = { x: 15, y: 204, w: 360, h: 640 };

const frame = (
  line: number,
  ms: number,
  subject: SceneFrame['subject'],
  deskShot: string,
  phoneShot: string
): SceneFrame => ({
  line,
  ms,
  subject,
  desk: {
    shot: deskShot,
    camera: DESK_CAM,
    ...(subject === 'phone' ? {} : { ring: { x: 60, y: 120, w: 300, h: 60 } }),
  },
  phone: {
    shot: phoneShot,
    camera: PHONE_CAM,
    ...(subject === 'desk' ? {} : { ring: { x: 24, y: 411, w: 342, h: 236 } }),
  },
});

export const STAND_IN_ENTRIES_SCENE: TimelineSceneData = {
  id: 'entries',
  name: 'Entries walkthrough',
  lines: SCENE_LINES.entries,
  frames: [
    frame(0, 4000, 'phone', 'before', 'dogs'),
    frame(1, 3000, 'phone', 'before', 'dogs'),
    frame(2, 3800, 'phone', 'before', 'pending'),
    frame(3, 4200, 'desk', 'review', 'pending'),
    frame(4, 3400, 'desk', 'review', 'pending'),
    frame(4, 4600, 'both', 'accepted', 'accepted'),
  ],
  desk: {
    label: 'Your screen',
    space: { width: 1200, height: 750 },
    shots: {
      before: {
        src: '/landing/stills/club-create-show.png',
        alt: 'STAND-IN: secretary screen before the entry arrives',
        width: 1200,
        height: 750,
      },
      review: {
        src: '/landing/stills/exhibitor-find-a-show.png',
        alt: 'STAND-IN: secretary screen with the form marked Needs review',
        width: 1200,
        height: 750,
      },
      accepted: {
        src: '/landing/stills/club-create-show.png',
        alt: 'STAND-IN: secretary screen after Accept',
        width: 1200,
        height: 750,
      },
    },
  },
  phone: {
    label: 'Meanwhile, an exhibitor',
    space: { width: 390, height: 844 },
    shots: {
      dogs: {
        src: '/landing/stills/exhibitor-my-entries.png',
        alt: 'STAND-IN: exhibitor choosing a dog',
        width: 390,
        height: 844,
      },
      pending: {
        src: '/landing/stages/e-13.png',
        alt: 'STAND-IN: exhibitor entry pending review',
        width: 390,
        height: 844,
      },
      accepted: {
        src: '/landing/stills/exhibitor-past-results.png',
        alt: 'STAND-IN: exhibitor entry accepted',
        width: 390,
        height: 844,
      },
    },
  },
};
