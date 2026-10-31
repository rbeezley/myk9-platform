import { useCallback, useEffect, useRef } from 'react';

const PIN_THRESHOLD_PX = 48;

interface ThreadPinningOptions {
  isOpen: boolean;
  hasConversation: boolean;
  /** Changes when a different conversation is shown (user or show); re-pins to the bottom. */
  conversationKey: string;
  /** Changes whenever the newest content grows; follows it while pinned. */
  followToken: unknown[];
}

/**
 * Keeps the newest thread content in view while the reader stays near it. "Near" is measured
 * from the scroll target (`threadEndRef`), not the container's absolute bottom, so controls
 * rendered below the target do not count against the reader.
 */
export function useThreadPinning({
  isOpen,
  hasConversation,
  conversationKey,
  followToken,
}: ThreadPinningOptions) {
  const threadEndRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);

  useEffect(() => {
    // The scroller is recreated at the top on reopen and holds a different conversation
    // after a show/user switch, so the newest answer is the right place to land.
    if (isOpen) pinnedToBottomRef.current = true;
  }, [isOpen, conversationKey]);

  useEffect(() => {
    // Scroll events do not bubble, so listen in the capture phase and keep only the
    // container that holds the thread.
    if (!isOpen || !hasConversation) return;
    const onScroll = (event: Event) => {
      const scroller = event.target;
      const target = threadEndRef.current;
      if (!(scroller instanceof HTMLElement) || !target || !scroller.contains(target)) return;
      pinnedToBottomRef.current =
        target.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom <=
        PIN_THRESHOLD_PX;
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  }, [isOpen, hasConversation]);

  useEffect(() => {
    if (isOpen && hasConversation && pinnedToBottomRef.current) {
      threadEndRef.current?.scrollIntoView?.({ block: 'end' });
    }
    // followToken is a caller-supplied dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, hasConversation, conversationKey, ...followToken]);

  /** Call when the reader acts (submits a question) so the answer is followed again. */
  const pinToBottom = useCallback(() => {
    pinnedToBottomRef.current = true;
  }, []);

  return { threadEndRef, pinToBottom };
}
