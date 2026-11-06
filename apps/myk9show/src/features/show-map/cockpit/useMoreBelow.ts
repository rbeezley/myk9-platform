import { useEffect, useState, type RefObject } from 'react';

/**
 * True while a scroll box has content hidden below its bottom edge (MYK9-1727). The focused-class
 * panel shows a fade then, because a Mac hides scroll bars until you scroll and nothing else says
 * the checklist goes on. Measures on scroll and whenever the box or its content changes size; a
 * ResizeObserver reports once as soon as it starts observing, which is the first measure.
 */
export function useMoreBelow(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Changes whenever the box may have been replaced (a different class, the panel re-shown). */
  boxKey?: string
): boolean {
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    const box = ref.current;
    if (!enabled || !box || typeof ResizeObserver === 'undefined') return;
    // 2px of slack: sub-pixel heights leave scrollTop a fraction short of the very bottom.
    const measure = () => setMoreBelow(box.scrollHeight - box.scrollTop - box.clientHeight > 2);
    box.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => {
      box.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [ref, enabled, boxKey]);

  return enabled && moreBelow;
}
