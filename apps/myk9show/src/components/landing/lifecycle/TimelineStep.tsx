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
  lead,
  sceneLead,
  meanwhileLabel,
  revealed,
  isLast,
}: {
  step: StoryStep;
  lead: string;
  /** The device that leads a two-device scene: the desk for clubs, the phone for exhibitors. */
  sceneLead: DeviceId;
  meanwhileLabel: string;
  revealed: boolean;
  isLast: boolean;
}) {
  const sceneId = step.scene ?? step.meanwhileScene;
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
        {step.shot && !step.explainer && <Screenshot shot={step.shot} />}
      </div>
      <div className="lc-meanwhile">
        <p className="lc-meanwhile-text">
          <span className="sr-only">{meanwhileLabel}: </span>
          {step.meanwhile}
        </p>
      </div>
      {sceneId && (
        // One scene per row, a full-width band under the two text columns. On a phone it
        // follows the text of the side it belongs to (data-side).
        <div className="lc-scene" data-side={step.scene ? 'main' : 'meanwhile'}>
          <StepScene id={sceneId} lead={sceneLead} />
        </div>
      )}
    </div>
  );
}
