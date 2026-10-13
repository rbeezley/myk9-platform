import { ScreenshotExplainer } from './ScreenshotExplainer';
import { NightBeforeCard } from './NightBeforeCard';
import { ScoresheetDemo } from './ScoresheetDemo';
import type { Shot, StoryStep } from './lifecycleStories';

function Screenshot({ shot, side }: { shot: Shot; side: 'main' | 'meanwhile' }) {
  return (
    <div className="lc-shot" data-shape={shot.shape} data-side={side}>
      <img
        src={shot.src}
        alt={shot.alt}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}

// D10: one leg of the scent trail in a 96x100 box: cast out to one side, swing back across,
// settle onto the next dot. `side` alternates per step so the trail zigzags like a search.
export function trailPath(side: 1 | -1): string {
  const x = (dx: number) => 48 + side * dx;
  return `M 48 0 C ${x(14)} 12, ${x(40)} 10, ${x(40)} 32 S ${x(-32)} 50, ${x(-26)} 68 S ${x(4)} 92, 48 100`;
}

function PawIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="6" cy="9" r="2.4" />
      <circle cx="10" cy="5" r="2.4" />
      <circle cx="14" cy="5" r="2.4" />
      <circle cx="18" cy="9" r="2.4" />
      <path d="M12 10c-3.2 0-6 3.6-6 6.4 0 2 1.6 3.1 3.4 2.6 1-.3 1.7-.6 2.6-.6s1.6.3 2.6.6c1.8.5 3.4-.6 3.4-2.6 0-2.8-2.8-6.4-6-6.4z" />
    </svg>
  );
}

export function TimelineStep({
  step,
  number,
  lead,
  reached,
  revealed,
  isLast,
}: {
  step: StoryStep;
  number: number;
  lead: string;
  reached: boolean;
  revealed: boolean;
  isLast: boolean;
}) {
  return (
    <div
      id={step.id}
      className="lc-row"
      data-peak={step.peak ? 'true' : undefined}
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div className="lc-main">
        {step.peak && <p className="lc-lead">{lead}</p>}
        <h3 className="lc-step-title">{step.title}</h3>
        <p className="lc-step-body">{step.body}</p>
        {step.shot && step.explainer && (
          // [ADDED] key by image: a new screenshot starts its explainer from step 1, unpaused.
          <ScreenshotExplainer key={step.shot.src} shot={step.shot} steps={step.explainer} />
        )}
        {step.scoresheetDemo && <ScoresheetDemo />}
        {step.nightBefore && <NightBeforeCard active={revealed} />}
        {step.shot && !step.explainer && !step.scoresheetDemo && !step.nightBefore && (
          <Screenshot shot={step.shot} side="main" />
        )}
      </div>
      <div className="lc-rail" aria-hidden="true">
        <span className="lc-dot-wrap">
          <span id={`${step.id}-dot`} className="lc-dot" data-reached={reached ? 'true' : 'false'}>
            {number}
          </span>
          {step.id === 'results' && (
            <span className="lc-alert" data-shown={reached ? 'true' : 'false'}>
              <PawIcon />
              Alert!
            </span>
          )}
        </span>
        {!isLast && (
          // D10: the scent trail to the next step. Stretched to the row's height; strokes stay crisp.
          <svg
            className="lc-trail"
            viewBox="0 0 96 100"
            preserveAspectRatio="none"
            data-after-find={step.id === 'results' ? 'true' : 'false'}
          >
            <path
              className="lc-trail-base"
              d={trailPath(number % 2 === 1 ? 1 : -1)}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="lc-trail-scent"
              d={trailPath(number % 2 === 1 ? 1 : -1)}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
      <div className="lc-meanwhile">
        <p className="lc-meanwhile-text">{step.meanwhile}</p>
        {step.meanwhileShot && <Screenshot shot={step.meanwhileShot} side="meanwhile" />}
      </div>
    </div>
  );
}
