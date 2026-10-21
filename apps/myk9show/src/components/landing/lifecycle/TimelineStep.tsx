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

export function TimelineStep({
  step,
  number,
  lead,
  meanwhileLabel,
  reached,
  lineFilled,
  revealed,
  isLast,
}: {
  step: StoryStep;
  number: number;
  lead: string;
  meanwhileLabel: string;
  reached: boolean;
  /** The line down to the next step fills once the reader reaches that step. */
  lineFilled: boolean;
  revealed: boolean;
  isLast: boolean;
}) {
  return (
    <div
      id={step.id}
      className="lc-row"
      data-peak={step.peak ? 'true' : undefined}
      data-last={isLast ? 'true' : undefined}
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div className="lc-main">
        {step.peak && <p className="lc-lead">{lead}</p>}
        <h3 className="lc-step-title">{step.title}</h3>
        <p className="lc-step-body">{step.body}</p>
        {step.shot && step.explainer && (
          // key by image: a new screenshot starts its explainer from step 1, unpaused.
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
        </span>
        {!isLast && (
          // A plain line to the next step, filled as the reader scrolls and emptied going back.
          <span className="lc-line" data-filled={lineFilled ? 'true' : 'false'}>
            <span className="lc-line-fill" />
          </span>
        )}
      </div>
      <div className="lc-meanwhile">
        <p className="lc-meanwhile-text">
          <span className="sr-only">{meanwhileLabel}: </span>
          {step.meanwhile}
        </p>
        {step.meanwhileShot && <Screenshot shot={step.meanwhileShot} side="meanwhile" />}
      </div>
    </div>
  );
}
