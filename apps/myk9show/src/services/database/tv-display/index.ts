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
  try {
    return await getPostgrestTVDisplayData(showId, trialId);
  } catch {
    return { show: null, classes: [] };
  }
}

export async function getTVDisplayResults(
  showId: string,
  trialId?: string
): Promise<TVCompletedClass[]> {
  try {
    return await getPostgrestTVDisplayResults(showId, trialId);
  } catch {
    return [];
  }
}
