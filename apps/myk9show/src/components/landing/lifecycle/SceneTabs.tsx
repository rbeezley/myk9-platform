import type { SceneLine } from './lifecycleStories';

// One tab per line, in a labelled group. A past line is a soft filled chip, the current one a
// solid chip, a later one an outlined chip. On a narrow container the label is visually hidden and
// the tab is a number-only circle (CSS), but its name stays "Enters online" for everyone.
export function SceneTabs({
  lines,
  current,
  onJump,
}: {
  lines: readonly SceneLine[];
  current: number;
  onJump: (line: number) => void;
}) {
  return (
    <div className="tl-scene-tabs" role="group" aria-label="Lines in this scene">
      {lines.map((line, i) => (
        <button
          key={i}
          type="button"
          className="tl-scene-tab"
          data-state={i < current ? 'past' : i === current ? 'current' : 'future'}
          aria-current={i === current ? 'step' : undefined}
          onClick={() => onJump(i)}
        >
          <span className="tl-scene-chip" aria-hidden="true">
            {i + 1}
          </span>
          <span className="tl-scene-tab-label">{line.short}</span>
        </button>
      ))}
    </div>
  );
}

// Back and Next: round 44px buttons with stroke chevrons. At the ends they stay put and say so.
export function SceneArrow({
  dir,
  disabled,
  onPress,
}: {
  dir: 'prev' | 'next';
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      className="tl-scene-arrow"
      data-dir={dir}
      aria-label={dir === 'prev' ? 'Previous line' : 'Next line'}
      aria-disabled={disabled}
      onClick={onPress}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path
          d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
