import { ScreenshotExplainer } from './ScreenshotExplainer';
import { NightBeforeCard } from './NightBeforeCard';
import { ScoresheetDemo } from './ScoresheetDemo';
import { TimelineScene } from './TimelineScene';
import { SCENES } from './scenes';
import type { DeviceId } from './sceneFrames';
import type { SceneId, Shot, StoryStep } from './lifecycleStories';

// A scene of real captures. A scene with no captures yet renders nothing, so its step keeps
// whatever still it has.
function StepScene({ id, lead }: { id: SceneId | undefined; lead: DeviceId }) {
  const scene = id && SCENES[id];
  return scene ? <TimelineScene scene={scene} lead={lead} /> : null;
}

function Screenshot({ shot }: { shot: Shot }) {
  return (
    <div className="lc-shot" data-shape={shot.shape}>
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
  sceneLead,
  meanwhileLabel,
  reached,
  lineFilled,
  revealed,
  isLast,
}: {
  step: StoryStep;
  number: number;
  lead: string;
  /** The device that leads a two-device scene: the desk for clubs, the phone for exhibitors. */
  sceneLead: DeviceId;
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
        <StepScene id={step.scene} lead={sceneLead} />
        {step.scoresheetDemo && <ScoresheetDemo />}
        {step.nightBefore && <NightBeforeCard active={revealed} />}
        {step.shot && !step.explainer && <Screenshot shot={step.shot} />}
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
        <StepScene id={step.meanwhileScene} lead={sceneLead} />
      </div>
    </div>
  );
}
