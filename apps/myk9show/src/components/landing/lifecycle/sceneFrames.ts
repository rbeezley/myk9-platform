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

/** What one device shows in one frame. Within a frame, one camera moves every capture of the device. */
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
  /**
   * Marks the frame that stands for its line under reduced motion, when the line's heading is
   * about a frame other than its last. At most one per line.
   */
  rest?: boolean;
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

/**
 * A camera of the page's own shape that holds `region` with `pad` pixels around it, kept
 * inside the page. Never narrower than `minWidth`, so a small control is not blown up until
 * its text blurs. Every camera of a device has the page's shape, so the frame never changes
 * shape between frames.
 */
export function cameraAround(
  space: SceneDeviceData['space'],
  region: Region,
  { pad = 32, minWidth = 0 }: { pad?: number; minWidth?: number } = {}
): Region {
  const aspect = space.width / space.height;
  const w = Math.min(
    space.width,
    Math.max(minWidth, region.w + pad * 2, (region.h + pad * 2) * aspect)
  );
  const h = w / aspect;
  const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), Math.max(max, 0));
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    x: round(clamp(region.x + region.w / 2 - w / 2, space.width - w)),
    y: round(clamp(region.y + region.h / 2 - h / 2, space.height - h)),
    w: round(w),
    h: round(h),
  };
}

/**
 * A close view of `region` in a camera `width` wide, the widest at which its words can still
 * be read. A region that fits is ringed. One too wide to fit is not shrunk until it is
 * unreadable: the camera holds its start or its end, and there is no ring, because a ring cut
 * off by the frame points at nothing.
 */
export function closeView(
  space: SceneDeviceData['space'],
  region: Region,
  { width, align = 'start', pad = 24 }: { width: number; align?: 'start' | 'end'; pad?: number }
): { camera: Region; ring?: Region } {
  const inner = width - pad * 2;
  if (region.w <= inner) {
    return { camera: cameraAround(space, region, { pad, minWidth: width }), ring: region };
  }
  const x = align === 'end' ? region.x + region.w - inner : region.x;
  return { camera: cameraAround(space, { ...region, x, w: inner }, { pad, minWidth: width }) };
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
 * The frame that stands for a line when nothing moves (reduced motion): the one marked
 * `rest`, or the line's last frame.
 */
export function restFrameOfLine(frames: readonly SceneFrame[], line: number): number {
  const marked = frames.findIndex(f => f.line === line && f.rest);
  return marked < 0 ? lastFrameOfLine(frames, line) : marked;
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
