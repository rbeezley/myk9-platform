import type { ReactNode, Ref } from 'react';

/**
 * The `inline` variant's container (MYK9-1089): no panel or dialog of its own.
 * This shell is the scroller (the host gives it the panel's full height), so the
 * footer sticks to the bottom edge on short forms and `scroll-pb-24` keeps a
 * focused field clear of it on tall ones (WCAG 2.4.11).
 */
export function EditPanelInlineShell({
  body,
  footer,
  actionBarRef,
}: {
  body: ReactNode;
  footer: ReactNode;
  actionBarRef: Ref<HTMLDivElement>;
}) {
  return (
    <div className="flex h-full flex-col overflow-y-auto scroll-pb-24">
      <div className="flex-1">{body}</div>
      <div ref={actionBarRef} className="sticky bottom-0 shrink-0 border-t bg-card px-6 py-4">
        {footer}
      </div>
    </div>
  );
}
