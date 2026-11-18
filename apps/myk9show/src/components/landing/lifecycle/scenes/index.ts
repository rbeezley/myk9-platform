import type { SceneId } from '../lifecycleStories';
import type { TimelineSceneData } from '../sceneFrames';
import { RING_SCENE } from './ringScene';

// The scenes that have captures. A scene joins this list when its screens are captured from
// the running app; until then its step keeps its still (docs/plan-landing-animated-timeline.md).
export const SCENES: Partial<Record<SceneId, TimelineSceneData>> = {
  'showday-ring': RING_SCENE,
};
