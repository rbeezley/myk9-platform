import { getPostgrestTVDisplayData, getPostgrestTVDisplayResults } from './postgrest';
import type { TVCompletedClass, TVDisplayData } from '@/pages/TVDisplay/types';

export type {
  TVClass,
  TVCompletedClass,
  TVDisplayData,
  TVDogInfo,
  TVEntry,
  TVPlacement,
  TVShowInfo,
} from '@/pages/TVDisplay/types';

export async function getTVDisplayData(showId: string, trialId?: string): Promise<TVDisplayData> {
  return getPostgrestTVDisplayData(showId, trialId);
}

export async function getTVDisplayResults(
  showId: string,
  trialId?: string
): Promise<TVCompletedClass[]> {
  return getPostgrestTVDisplayResults(showId, trialId);
}
