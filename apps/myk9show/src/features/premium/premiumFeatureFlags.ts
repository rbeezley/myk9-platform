import type { PremiumStyle } from '../../types/premium-types';

const NEW_STYLE_KEYS = ['magazine', 'poster', 'gazette', 'fieldGuide', 'heritage'] as const;
type NewStyleKey = (typeof NEW_STYLE_KEYS)[number];

export function isNewStyle(style: string): style is NewStyleKey {
  return (NEW_STYLE_KEYS as readonly string[]).includes(style);
}

export function isStyleEnabled(style: PremiumStyle): boolean {
  if (!isNewStyle(style)) return true;
  return import.meta.env.VITE_PREMIUM_NEW_STYLES_ENABLED === 'true';
}
