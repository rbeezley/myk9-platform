import { memo } from 'react';
import { ringStyle, shotStyle } from './sceneFrames';
import type { DeviceId, DeviceView, SceneDeviceData } from './sceneFrames';

// One device in a TimelineScene: a clipping frame, every capture of the device stacked in it, and
// a camera that pans and zooms them together so cross-fades between two states line up exactly.
// Memoised: the scene ticks ten times a second and a device only changes with its frame.
// `compact` is the storyboard's small close-up: nothing moves there, so it draws only the shot
// the view names, and leaves the caption above the device to the card's own words.
export const SceneDevice = memo(function SceneDevice({
  kind,
  data,
  view,
  dimmed,
  compact = false,
}: {
  kind: DeviceId;
  data: SceneDeviceData;
  view: DeviceView;
  dimmed: boolean;
  compact?: boolean;
}) {
  const style = shotStyle(data.space, view.camera);
  const shots = Object.entries(data.shots).filter(([key]) => !compact || key === view.shot);
  const frame = (
    <div
      className="tl-scene-frame"
      data-kind={kind}
      // The camera fills the frame, so the frame takes the camera's shape: the phone's whole
      // screen (390x844), the desk's 5:3 zoom.
      style={{ aspectRatio: `${view.camera.w} / ${view.camera.h}` }}
    >
      {shots.map(([key, shot]) => {
        const on = key === view.shot;
        return (
          <img
            key={key}
            className="tl-scene-shot"
            data-shot={key}
            data-on={on ? 'true' : 'false'}
            src={shot.src}
            alt={shot.alt}
            width={shot.width}
            height={shot.height}
            aria-hidden={on ? undefined : true}
            loading="lazy"
            decoding="async"
            style={style}
          />
        );
      })}
      <span
        aria-hidden="true"
        className="tl-scene-ring"
        data-on={view.ring ? 'true' : 'false'}
        style={view.ring ? ringStyle(view.ring, view.camera) : undefined}
      />
    </div>
  );
  return (
    <div className="tl-scene-device" data-kind={kind} data-dim={dimmed ? 'true' : 'false'}>
      {!compact && <span className="tl-scene-who">{data.label}</span>}
      {kind === 'desk' ? (
        <div className="tl-scene-desk">
          <div className="tl-scene-desk-top" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          {frame}
        </div>
      ) : (
        <PhoneFrame>{frame}</PhoneFrame>
      )}
    </div>
  );
});

// The phone's shape: a dark bezel with a thin outer ring and three side buttons, and above the
// screen a blank white strip that holds the camera pill, so the notch never covers the app
// (no clock, no battery: the strip is empty). The screen's corners are rounded to match.
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="tl-scene-phone">
      <span className="tl-scene-side" data-side="left-top" aria-hidden="true" />
      <span className="tl-scene-side" data-side="left-bottom" aria-hidden="true" />
      <span className="tl-scene-side" data-side="right" aria-hidden="true" />
      <div className="tl-scene-screen">
        <div className="tl-scene-strip" aria-hidden="true">
          <i />
        </div>
        {children}
      </div>
    </div>
  );
}
