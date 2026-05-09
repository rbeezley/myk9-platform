import { Link, Text, View } from '@react-pdf/renderer';
import { PREMIUM_STYLE_LABELS, type PremiumStyle } from '../../../types/premium-types';

interface PdfFooterProps {
  style: PremiumStyle;
  color: string;
}

// `fixed` causes @react-pdf to repeat the element on every paginated sheet.
// The style label is intentionally visible — it identifies the source template
// in QA and bug reports.
export function PdfFooter({ style, color }: PdfFooterProps) {
  return (
    <View
      fixed
      style={{
        position: 'absolute',
        bottom: 18,
        left: 36,
        right: 36,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 7,
        color,
      }}
    >
      <Text style={{ color, letterSpacing: 1, textTransform: 'uppercase' }}>
        Style: {PREMIUM_STYLE_LABELS[style]}
      </Text>
      <Link src="https://myk9show.com" style={{ color, textDecoration: 'none' }}>
        Created by myK9Show.com
      </Link>
    </View>
  );
}
