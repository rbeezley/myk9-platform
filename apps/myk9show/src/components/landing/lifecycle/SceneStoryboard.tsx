import { SceneDevice } from './SceneDevice';
import { lastFrameOfLine, sceneDevices } from './sceneFrames';
import type { DeviceId, TimelineSceneData } from './sceneFrames';

// Reduced motion: the whole scene at once, nothing moving. One card per line: the close-up
// the line rests on (its last frame, as sceneState rests reduced motion) of the device the line
// is about, ring drawn, then its number, heading and sentence. No tabs, arrows or Play: there is
// nothing to step through or pause.
export function SceneStoryboard({ scene }: { scene: TimelineSceneData }) {
  const { frames, lines } = scene;
  const have = sceneDevices(scene);
  return (
    <ol className="tl-scene-board">
      {lines.map((line, i) => {
        const f = frames[lastFrameOfLine(frames, i)];
        if (!f) return null;
        const wanted: readonly DeviceId[] = f.subject === 'both' ? ['desk', 'phone'] : [f.subject];
        // A scene with only one device shows that one, whichever the frame was about.
        const shown = wanted.filter(kind => have.includes(kind));
        const kinds = shown.length > 0 ? shown : have;
        return (
          <li key={i} className="tl-scene-card" data-subject={kinds.length > 1 ? 'both' : kinds[0]}>
            <div className="tl-scene-card-shots">
              {kinds.map(kind => {
                const data = scene[kind];
                const view = f[kind];
                if (!data || !view) return null;
                return (
                  <SceneDevice
                    key={kind}
                    kind={kind}
                    data={data}
                    view={view}
                    dimmed={false}
                    compact
                  />
                );
              })}
            </div>
            <div className="tl-scene-card-words">
              <span className="tl-scene-chip" data-state="current" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className="tl-scene-head">{line.head}</p>
                <p className="tl-scene-text">{line.text}</p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
