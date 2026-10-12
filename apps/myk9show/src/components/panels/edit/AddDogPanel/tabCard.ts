/**
 * The tab cards' extra classes. Inline, inside Quick Create's slide-out
 * (MYK9-1081), the host body's `p-6` is the only inset, as on the Person form:
 * a bordered, padded card inside it squeezed the fields to ~230px at 375px.
 * `overflow-visible` undoes the Essential card's `overflow-hidden`, which with
 * no padding would crop the fields' focus rings. The `panel` variant keeps its
 * cards.
 */
export function tabCardClasses(flat: boolean) {
  return flat
    ? {
        card: 'overflow-visible rounded-none border-0 bg-transparent shadow-none hover:shadow-none',
        header: 'px-0 pt-0',
        content: 'px-0 pb-0',
      }
    : { card: '', header: '', content: '' };
}
