import { useEffect, type RefObject } from 'react';

/**
 * Publishes an element's height as a CSS custom property on the document root, so a sibling that
 * sticks below it (which cannot inherit from it) can offset itself by the real height, wrapped rows
 * included. The property is removed on unmount, so nothing outlives the element.
 */
export function usePublishedHeightVar(ref: RefObject<HTMLElement | null>, name: `--${string}`) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${el.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name]);
}
