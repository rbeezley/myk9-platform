export type EmailStyle =
  | 'monogram'
  | 'banner'
  | 'headline'
  | 'magazine'
  | 'poster'
  | 'gazette'
  | 'fieldGuide'
  | 'heritage';

export type EmailBuilderKey = 'heritage' | 'headline' | 'monogram';

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

const STYLE_TO_EMAIL_BUILDER: Record<EmailStyle, EmailBuilderKey> = {
  monogram: 'monogram',
  banner: 'monogram',
  headline: 'headline',
  magazine: 'heritage',
  poster: 'heritage',
  gazette: 'heritage',
  fieldGuide: 'heritage',
  heritage: 'heritage',
};

export function resolveEmailStyle(raw: string | null | undefined): EmailStyle {
  if (raw === 'default') return 'monogram';
  return raw && VALID_EMAIL_STYLES.has(raw) ? (raw as EmailStyle) : 'monogram';
}

export function selectEmailBuilderKey(style: EmailStyle): EmailBuilderKey {
  return STYLE_TO_EMAIL_BUILDER[style];
}
