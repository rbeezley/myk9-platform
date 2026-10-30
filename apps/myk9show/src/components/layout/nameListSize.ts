import type { MasterDetailListSize } from './MasterDetailLayout';

/**
 * Dogs and People list one short line per row (a name plus a breed or role), which needs about
 * 260-300px, so the list takes less of the split than the shared default (38/26/55) and leaves
 * the record the room. Percentages, not px: the panels persist percentages, and a px default
 * would not scale the list with the window.
 */
export const NAME_LIST_SIZE: MasterDetailListSize = { default: '28%', min: '22%', max: '40%' };

/**
 * Storage ids for the Dogs and People splits. The `-v2` suffix retires layouts saved under the
 * old bounds (a drag to 55% would otherwise keep the wide list forever); pre-launch, a one-time
 * reset is fine.
 */
export const DOGS_LAYOUT_ID = 'dogs-v2';
export const PEOPLE_LAYOUT_ID = 'people-v2';
