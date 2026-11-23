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
  // One column of words per step: the step's text, then one line on what the other side sees.
  // On a wide screen the step's still or demo sits beside the words, and a scene is a full-width
  // band below both. The DOM order is the reading order, so a phone's single column matches it.
  const media = (step.shot || step.scoresheetDemo || step.nightBefore) && (
    <div className="lc-media">
      {step.shot && step.explainer && (
        // key by image: a new screenshot starts its explainer from step 1, unpaused.
        <ScreenshotExplainer key={step.shot.src} shot={step.shot} steps={step.explainer} />
      )}
      {step.scoresheetDemo && <ScoresheetDemo />}
      {step.nightBefore && <NightBeforeCard active={revealed} />}
      {step.shot && !step.explainer && <Screenshot shot={step.shot} />}
    </div>
  );
  return (
    <div
      id={step.id}
      className="lc-row"
      data-peak={step.peak ? 'true' : undefined}
      data-last={isLast ? 'true' : undefined}
      data-media={media ? 'true' : undefined}
      data-scene={sceneId ? 'true' : undefined}
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div className="lc-main">
        {step.peak && <p className="lc-lead">{lead}</p>}
        <h3 className="lc-step-title">{step.title}</h3>
        <p className="lc-step-body">{step.body}</p>
        <p className="lc-meanwhile-text">
          <span className="lc-meanwhile-label">{meanwhileLabel}: </span>
          {step.meanwhile}
        </p>
      </div>
      {media}
      {sceneId && (
        // data-side says whose part of the story the scene shows: this step's own (main) or the
        // other side's (meanwhile).
        <div className="lc-scene" data-side={step.scene ? 'main' : 'meanwhile'}>
          <StepScene id={sceneId} lead={sceneLead} />
        </div>
      )}
    </div>
  );
}
