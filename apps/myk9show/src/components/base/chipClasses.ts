import type { ChipColor } from './Chip';

/**
 * Class-string forms of the hue-keyed `--chip-*` tokens, for the surfaces that
 * need Tailwind utility classes rather than the `Chip` element itself — shadcn
 * `Badge`, domain→color maps whose other entries use the project palette, and
 * inline count pills.
 *
 * Keeping the complete literal class strings in this one file means a future
 * `--chip-*` token rename lands here once instead of across every call site,
 * and Tailwind's JIT scanner still sees each full arbitrary-value class (it
 * scans this file like any other under `src/`). Prefer `<Chip>` when you can;
 * reach for `chipClasses` only when a raw className is required.
 */
const CHIP_FILL: Record<ChipColor, string> = {
  green: 'bg-[color:var(--chip-green-bg)] text-[color:var(--chip-green-fg)]',
  amber: 'bg-[color:var(--chip-amber-bg)] text-[color:var(--chip-amber-fg)]',
  red: 'bg-[color:var(--chip-red-bg)] text-[color:var(--chip-red-fg)]',
  blue: 'bg-[color:var(--chip-blue-bg)] text-[color:var(--chip-blue-fg)]',
  purple: 'bg-[color:var(--chip-purple-bg)] text-[color:var(--chip-purple-fg)]',
  teal: 'bg-[color:var(--chip-teal-bg)] text-[color:var(--chip-teal-fg)]',
  stone: 'bg-[color:var(--chip-stone-bg)] text-[color:var(--chip-stone-fg)]',
};

const CHIP_BORDER: Record<ChipColor, string> = {
  green: 'border-[color:var(--chip-green-bg)]',
  amber: 'border-[color:var(--chip-amber-bg)]',
  red: 'border-[color:var(--chip-red-bg)]',
  blue: 'border-[color:var(--chip-blue-bg)]',
  purple: 'border-[color:var(--chip-purple-bg)]',
  teal: 'border-[color:var(--chip-teal-bg)]',
  stone: 'border-[color:var(--chip-stone-bg)]',
};

/**
 * Background + foreground (and optionally a matching border) Tailwind classes
 * for the given chip hue. `{ border: true }` appends a border in the same tone
 * as the fill — the form shadcn `Badge` variants expect.
 */
export function chipClasses(color: ChipColor, opts?: { border?: boolean }): string {
  return opts?.border ? `${CHIP_FILL[color]} ${CHIP_BORDER[color]}` : CHIP_FILL[color];
}
