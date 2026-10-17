// Remembers which anchor the cockpit has already scrolled to, above the component, so a remount
// of the same page (the window crossing `lg`, roles arriving) does not scroll to its own anchor
// again. MYK9-1218.
//
// Keyed by history entry (`location.key`) and anchor. A returnTo link is a new navigation, so it
// has a new key and scrolls; a full refresh reloads this module, so the record is empty and it
// scrolls. The cockpit rewrites its own URL with `replace`, which mints a new key for the same
// page, so `carryHonouredAnchor` moves the record along with it.
let honoured: { key: string; anchor: string } | null = null;

export function isAnchorHonoured(key: string, anchor: string): boolean {
  return honoured?.key === key && honoured.anchor === anchor;
}

export function markAnchorHonoured(key: string, anchor: string): void {
  honoured = { key, anchor };
}

/** The cockpit replaced its own URL: the same page now sits on a new history key. */
export function carryHonouredAnchor(fromKey: string, toKey: string): void {
  if (honoured?.key === fromKey) honoured = { ...honoured, key: toKey };
}

export function resetHonouredAnchorForTests(): void {
  honoured = null;
}
