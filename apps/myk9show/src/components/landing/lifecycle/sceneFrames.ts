import type { SceneId, SceneLine } from './lifecycleStories';

// Data shape and pure math for TimelineScene. No React, no app state: the guides site and the
// demo deck can feed the same shapes. Every region is in the capture's own CSS pixels, measured
// from the live page by the capture script, never typed by eye.

export type DeviceId = 'desk' | 'phone';

export type Region = { x: number; y: number; w: number; h: number };

export type SceneShot = {
  src: string;
  alt: string;
  /** Natural size of the image file, for layout reservation. */
  width: number;
  height: number;
};

export type SceneDeviceData = {
  /** Small caption above the device, e.g. "Your screen" or "Meanwhile, an exhibitor". */
  label: string;
  /** The page size the regions were measured in (1440x900 desk, 390x844 phone, 768x1024 tablet). */
  space: { width: number; height: number };
  shots: Readonly<Record<string, SceneShot>>;
};

/** What one device shows in one frame. Every capture of a device shares one camera. */
export type DeviceView = {
  shot: string;
  camera: Region;
  ring?: Region;
};

export type SceneFrame = {
  /** Index into the scene's lines. A line owns one or more frames, in order. */
  line: number;
  /** How long the frame plays before the next one. */
  ms: number;
  /** The device this frame is about; the other dims. */
  subject: DeviceId | 'both';
  /** One view per device the scene has. */
  desk?: DeviceView;
  phone?: DeviceView;
};

export type TimelineSceneData = {
  id: SceneId;
  /** The walkthrough's landmark name, so two scenes on one page read apart. */
  name: string;
  lines: readonly SceneLine[];
  frames: readonly SceneFrame[];
  /** Two devices side by side, or one shown larger (the judge alone at the ring). */
  desk?: SceneDeviceData;
  phone?: SceneDeviceData;
};

const DEVICE_ORDER: readonly DeviceId[] = ['desk', 'phone'];

/** The devices a scene has, desk first. */
export function sceneDevices(scene: TimelineSceneData): readonly DeviceId[] {
  return DEVICE_ORDER.filter(kind => scene[kind] !== undefined);
}

export type SceneMode = 'autoplay' | 'step';

const pct = (fraction: number) => `${Number((fraction * 100).toFixed(3))}%`;

/** Position and size of a capture inside its clipping frame so `camera` fills the frame. */
export function shotStyle(space: SceneDeviceData['space'], camera: Region) {
  return {
    width: pct(space.width / camera.w),
    left: pct(-camera.x / camera.w),
    top: pct(-camera.y / camera.h),
  };
}

/** Position and size of the highlight ring, relative to the camera. */
export function ringStyle(ring: Region, camera: Region) {
  return {
    left: pct((ring.x - camera.x) / camera.w),
    top: pct((ring.y - camera.y) / camera.h),
    width: pct(ring.w / camera.w),
    height: pct(ring.h / camera.h),
  };
}

/**
 * The camera for a phone: the whole captured screen, never cropped or zoomed. The phone is
 * drawn in its real shape, and the ring alone marks the part a line is about.
 */
export function wholeScreen(space: SceneDeviceData['space']): Region {
  return { x: 0, y: 0, w: space.width, h: space.height };
}

/**
 * A zoom on a capture that is wider than the frame it is drawn in (the secretary's 1440px
 * screen): a camera `width` wide in the frame's 5:3 shape, placed so `subject` sits in its
 * middle and kept inside the page. It widens, never crops, when the subject (with `pad` around
 * it) does not fit, so a ring is always whole. Measured regions only: nothing here is picked by eye.
 */
export function zoomOnRing(
  space: SceneDeviceData['space'],
  subject: Region,
  width: number,
  pad = 24
): Region {
  const shape = 3 / 5;
  const wanted = Math.max(width, subject.w + 2 * pad, (subject.h + 2 * pad) / shape);
  const w = Math.min(Math.round(wanted), space.width);
  const h = Math.min(Math.round(w * shape), space.height);
  const x = Math.round(subject.x + subject.w / 2 - w / 2);
  const y = Math.round(subject.y + subject.h / 2 - h / 2);
  return {
    x: Math.min(Math.max(x, 0), space.width - w),
    y: Math.min(Math.max(y, 0), space.height - h),
    w,
    h,
  };
}

export function firstFrameOfLine(frames: readonly SceneFrame[], line: number): number {
  const i = frames.findIndex(f => f.line === line);
  return i < 0 ? 0 : i;
}

export function lastFrameOfLine(frames: readonly SceneFrame[], line: number): number {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.line === line) return i;
  return 0;
}
