import { memo } from 'react';
import { ringStyle, shotStyle } from './sceneFrames';
import type { DeviceId, DeviceView, SceneDeviceData } from './sceneFrames';

// One device in a TimelineScene: a clipping frame, every capture of the device stacked in it, and
// a camera that pans and zooms them together so cross-fades between two states line up exactly.
// Memoised: the scene ticks ten times a second and a device only changes with its frame.
export const SceneDevice = memo(function SceneDevice({
  kind,
  data,
  view,
  dimmed,
}: {
  kind: DeviceId;
  data: SceneDeviceData;
  view: DeviceView;
  dimmed: boolean;
}) {
  const style = shotStyle(data.space, view.camera);
  const frame = (
    <div
      className="tl-scene-frame"
      data-kind={kind}
      // The camera fills the frame, so the frame takes the camera's shape (the ring scene's window is 3:4).
      style={{ aspectRatio: `${view.camera.w} / ${view.camera.h}` }}
    >
      {Object.entries(data.shots).map(([key, shot]) => {
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
      <span className="tl-scene-who">{data.label}</span>
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
        <div className="tl-scene-phone">{frame}</div>
      )}
    </div>
  );
});
