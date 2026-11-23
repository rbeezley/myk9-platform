import { TimelineStep } from './TimelineStep';
import {
  AUDIENCE_LABEL,
  MEANWHILE_LABEL,
  PEAK_LEAD,
  STORIES,
  STORY_HEADING,
  type Audience,
} from './lifecycleStories';
import { useTimelineProgress } from './useTimelineProgress';
import './lifecycle.css';

const STEP_IDS = STORIES.club.map(s => s.id); // both audiences share ids and order (tested)
const AUDIENCES: Audience[] = ['club', 'exhibitor'];

// The audience is owned by the page (Home), because the header and closing calls to action
// follow the same switch.
export function LifecycleTimeline({
  audience,
  onAudienceChange,
}: {
  audience: Audience;
  onAudienceChange: (audience: Audience) => void;
}) {
  const { isRevealed } = useTimelineProgress(STEP_IDS);
  const story = STORIES[audience];
  return (
    <section id="how-it-works" className="lc" aria-labelledby="lc-title">
      <div className="l-container">
        <div className="lc-head">
          <h2 id="lc-title" className="lc-title">
            {STORY_HEADING[audience]}
          </h2>
          <div role="group" aria-label="Show me the story for" className="lc-switch">
            {AUDIENCES.map(a => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => onAudienceChange(a)}
              >
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
        {story.map((step, i) => (
          <TimelineStep
            key={step.id}
            step={step}
            lead={PEAK_LEAD[audience]}
            sceneLead={audience === 'club' ? 'desk' : 'phone'}
            meanwhileLabel={MEANWHILE_LABEL[audience]}
            revealed={isRevealed(step.id)}
            isLast={i === story.length - 1}
          />
        ))}
      </div>
    </section>
  );
}
