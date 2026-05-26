import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// `getLevelSortOrder` moved to @myk9/ringside in PR E1a so the
// ringside ClassList helpers can sort without reaching back into the
// host. Re-exported here to preserve the existing import paths used
// by classFilterUtils, the Admin page, and the Stats page.
export { getLevelSortOrder } from '@myk9/ringside';
