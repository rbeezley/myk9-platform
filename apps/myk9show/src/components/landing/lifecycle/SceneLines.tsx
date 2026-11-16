import { lineProgress } from './sceneFrames';
import type { SceneFrame } from './sceneFrames';
import type { SceneLine } from './lifecycleStories';

// The numbered lines, a heading and a sentence each: each is a button that jumps to its line. The number sits in a
// circle; the current line's circle draws itself as its part plays, and a finished line fills in
// with a tick.
export function SceneLines({
  lines,
  frames,
  frame,
  elapsed,
  timed,
  onJump,
}: {
  lines: readonly SceneLine[];
  frames: readonly SceneFrame[];
  frame: number;
  elapsed: number;
  timed: boolean;
  onJump: (line: number) => void;
}) {
  const current = frames[frame]?.line ?? 0;
  return (
    <ol className="tl-scene-lines">
      {lines.map((line, i) => {
        const progress = lineProgress(frames, i, frame, elapsed, timed);
        const done = i < current;
        return (
          <li key={i}>
            <button
              type="button"
              className="tl-scene-line"
              data-done={done ? 'true' : 'false'}
              aria-current={i === current ? 'step' : undefined}
              onClick={() => onJump(i)}
            >
              <span className="tl-scene-num" aria-hidden="true">
                <svg viewBox="0 0 36 36">
                  <circle className="tl-scene-track" cx="18" cy="18" r="16" />
                  <circle
                    className="tl-scene-prog"
                    cx="18"
                    cy="18"
                    r="16"
                    pathLength={100}
                    style={{ strokeDashoffset: 100 - 100 * progress }}
                  />
                </svg>
                <b>{i + 1}</b>
                <i className="tl-scene-tick">&#10003;</i>
              </span>
              <span className="tl-scene-copy">
                <span className="tl-scene-head">{line.head}</span>
                <span className="tl-scene-text">{line.text}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
