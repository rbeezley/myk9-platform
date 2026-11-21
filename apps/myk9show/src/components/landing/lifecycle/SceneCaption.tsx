import type { SceneLine } from './lifecycleStories';

// The caption under the devices: a large serif step number beside the line's heading, then its
// sentence. It is the scene's live region, so a screen reader hears the line when the line changes
// by a press. While the scene plays itself it stays quiet (`announce` false), so a screen reader is
// not interrupted every few seconds; the reader can pause and step to hear each line.
export function SceneCaption({
  line,
  index,
  total,
  announce,
}: {
  line: SceneLine;
  index: number;
  total: number;
  announce: boolean;
}) {
  return (
    <div className="tl-scene-caption" role="status" aria-live={announce ? 'polite' : 'off'}>
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
