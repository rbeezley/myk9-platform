import { Text, View } from '@react-pdf/renderer';
import type { PremiumStyle } from '../../../types/premium-types';
import type { StyleTokens } from './pdfStyles';

interface Props {
  style: PremiumStyle;
  tokens: StyleTokens;
}

/**
 * Per-style section divider. Defaults to a single horizontal rule; Heritage
 * gets an ornamental flourish (centered diamond between two short rules) to
 * match its hand-engraved feel.
 */
export function SectionDivider({ style, tokens }: Props) {
  if (style === 'heritage') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          marginVertical: 16,
        }}
      >
        <View
          style={{
            flex: 1,
            borderTopWidth: 0.5,
            borderTopColor: tokens.secondaryColor,
          }}
        />
        <Text
          style={{
            fontFamily: tokens.displayFont,
            fontSize: 12,
            color: tokens.accentDeep ?? tokens.accentColor,
            marginHorizontal: 12,
            lineHeight: 1,
          }}
        >
          {'§'}
        </Text>
        <View
          style={{
            flex: 1,
            borderTopWidth: 0.5,
            borderTopColor: tokens.secondaryColor,
          }}
        />
      </View>
    );
  }
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: tokens.accentColor,
        marginVertical: 16,
      }}
    />
  );
}
