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

/** The smallest region that holds both. */
export function unionRegion(a: Region, b: Region): Region {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/**
 * A window on a capture: the full width of the page and `height` tall, placed so `subject`
 * (the ring, or the ring and something measured that belongs with it) sits in its middle, and
 * kept inside the page. One rule for every frame of a screen that is taller than the frame it
 * is drawn in. It never zooms, so the words stay the size they were captured.
 */
export function windowOnRing(
  space: SceneDeviceData['space'],
  subject: Region,
  height: number
): Region {
  const h = Math.min(height, space.height);
  const centred = Math.round(subject.y + subject.h / 2 - h / 2);
  return { x: 0, y: Math.min(Math.max(centred, 0), space.height - h), w: space.width, h };
}

export function firstFrameOfLine(frames: readonly SceneFrame[], line: number): number {
  const i = frames.findIndex(f => f.line === line);
  return i < 0 ? 0 : i;
}

export function lastFrameOfLine(frames: readonly SceneFrame[], line: number): number {
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.line === line) return i;
  return 0;
}

/**
 * How far through its line a line is, 0 to 1. Lines before the current one are complete.
 * Autoplay measures time; step-through counts the frames reached.
 */
export function lineProgress(
  frames: readonly SceneFrame[],
  line: number,
  frame: number,
  elapsedMs: number,
  timed: boolean
): number {
  const current = frames[frame]?.line ?? 0;
  if (line < current) return 1;
  if (line > current) return 0;
  const own = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.line === line);
  if (timed) {
    const total = own.reduce((sum, { f }) => sum + f.ms, 0);
    if (total <= 0) return 1;
    const before = own.filter(({ i }) => i < frame).reduce((sum, { f }) => sum + f.ms, 0);
    return Math.min(1, (before + elapsedMs) / total);
  }
  const reached = own.filter(({ i }) => i <= frame).length;
  return reached / own.length;
}
