/**
 * One source for the sex / lifecycle badges a dog wears on the /dogs card and
 * on its detail page rail, so the two surfaces cannot drift apart.
 */

export interface DogBadgeStyle {
  label: string;
  className: string;
}

export const DOG_STATUS_BADGES: Record<string, DogBadgeStyle> = {
  active: { label: 'Active', className: 'text-xs bg-success/10 text-success' },
  retired: { label: 'Retired', className: 'text-xs bg-warning/10 text-warning' },
  deceased: {
    // Tokens, not raw gray: gray-500 on gray-100 measured 4.39:1 in light mode,
    // under the 4.5:1 floor. bg-muted/text-muted-foreground is 5.09:1 light and
    // 4.55:1 dark, and tracks the theme like the sibling badges above.
    label: 'Deceased',
    className: 'text-xs bg-muted text-muted-foreground',
  },
};

export function getDogSexBadge(sex: string | undefined): DogBadgeStyle | null {
  if (!sex) return null;
  return {
    label: sex.charAt(0).toUpperCase() + sex.slice(1),
    className:
      sex === 'male'
        ? 'text-xs bg-info/10 text-info'
        : 'text-xs bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  };
}
