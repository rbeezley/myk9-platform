export type EmailStyle =
  | 'monogram'
  | 'banner'
  | 'headline'
  | 'magazine'
  | 'poster'
  | 'gazette'
  | 'fieldGuide'
  | 'heritage';

export type EmailBuilderKey =
  | 'heritage'
  | 'headline'
  | 'monogram'
  | 'banner'
  | 'fieldGuide'
  | 'gazette'
  | 'magazine'
  | 'poster';

export const EMAIL_STYLES: readonly EmailStyle[] = [
  'monogram',
  'banner',
  'headline',
  'magazine',
  'poster',
  'gazette',
  'fieldGuide',
  'heritage',
];

const VALID_EMAIL_STYLES = new Set<string>(EMAIL_STYLES);

// All eight styles now have dedicated builders — none fall back to Heritage.
const STYLE_TO_EMAIL_BUILDER: Record<EmailStyle, EmailBuilderKey> = {
  monogram: 'monogram',
  banner: 'banner',
  headline: 'headline',
  magazine: 'magazine',
  poster: 'poster',
  gazette: 'gazette',
  fieldGuide: 'fieldGuide',
  heritage: 'heritage',
};

export function resolveEmailStyle(raw: string | null | undefined): EmailStyle {
  if (raw === 'default') return 'monogram';
  return raw && VALID_EMAIL_STYLES.has(raw) ? (raw as EmailStyle) : 'monogram';
}

export function selectEmailBuilderKey(style: EmailStyle): EmailBuilderKey {
  return STYLE_TO_EMAIL_BUILDER[style];
}
