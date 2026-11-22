import type { SceneLine } from './lifecycleStories';

// The caption under the devices: a large serif step number beside the line's heading, then its
// sentence. It is not a live region: TimelineScene announces a line only when the reader moves to
// it, so autoplay does not speak every few seconds.
export function SceneCaption({
  line,
  index,
  total,
}: {
  line: SceneLine;
  index: number;
  total: number;
}) {
  return (
    <div className="tl-scene-caption">
      <span className="tl-scene-sr">{`Line ${index + 1} of ${total}. `}</span>
      <span className="tl-scene-bignum" aria-hidden="true">
        {index + 1}
      </span>
      <div className="tl-scene-caption-words">
        <p className="tl-scene-head">{line.head}</p>
        <p className="tl-scene-text">{line.text}</p>
      </div>
    </div>
  );
}
