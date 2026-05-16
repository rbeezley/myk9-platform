import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankProps } from '@/features/heritage/entry-blank';
import {
  BODY,
  Checkbox,
  DISPLAY,
  GOLD_2,
  GOLD_3,
  INK,
  MagazineSectionHeader,
  META,
  MUTE,
  QUILL,
} from './pdfPrimitives';

type Fees = EntryBlankProps['fees'];

const PAYMENT_OPTIONS = [
  { key: 'check', label: 'Check enclosed' },
  { key: 'money_order', label: 'Money order' },
  { key: 'online', label: 'Paid online' },
] as const;

function FeeRow({ label, value, total = false }: { label: string; value: string; total?: boolean }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        paddingVertical: 4,
        borderTopWidth: total ? 0.5 : 0,
        borderTopColor: INK,
        marginTop: total ? 4 : 0,
        paddingTop: total ? 8 : 4,
      }}
    >
      <Text
        style={{
          fontFamily: total ? DISPLAY : BODY,
          fontStyle: total ? 'italic' : 'normal',
          fontSize: total ? 14 : 10,
          color: total ? INK : QUILL,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontStyle: total ? 'italic' : 'normal',
          fontWeight: 500,
          fontSize: total ? 18 : 12,
          color: total ? GOLD_3 : INK,
          textAlign: 'right',
          minWidth: 80,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function FeesSection({ fees }: { fees: Fees }) {
  return (
    <View>
      <MagazineSectionHeader numeral="iv" title="Fees tendered" />

      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: INK,
          paddingVertical: 10,
        }}
      >
        {/* Fee rows column */}
        <View style={{ flex: 1, paddingRight: 18 }}>
          <FeeRow label={`First entry · ${fees.firstEntryFee} ×`} value="$ ______" />
          <FeeRow label={`Each additional · ${fees.additionalEntryFee} ×`} value="$ ______" />
          <FeeRow label={`Junior handler · ${fees.juniorHandlerFee} ×`} value="$ ______" />
          <FeeRow label={`Mail-in processing · ${fees.mailProcessingFee}`} value="$ ______" />
          <FeeRow label="Total" value={fees.totalAmount ?? '$  '} total />
        </View>

        {/* Payment method column */}
        <View
          style={{
            width: 160,
            paddingLeft: 18,
            borderLeftWidth: 0.5,
            borderLeftColor: GOLD_2,
            borderStyle: 'dashed',
          }}
        >
          <Text
            style={{
              fontFamily: META,
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: GOLD_3,
              marginBottom: 10,
            }}
          >
            Payment method
          </Text>
          {PAYMENT_OPTIONS.map(opt => (
            <View
              key={opt.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                marginBottom: 6,
              }}
            >
              <Checkbox checked={fees.paymentMethod === opt.key} />
              <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{opt.label}</Text>
            </View>
          ))}

          <Text
            style={{
              fontFamily: BODY,
              fontSize: 7.5,
              color: MUTE,
              marginTop: 10,
              lineHeight: 1.4,
            }}
          >
            Make checks payable to the club. Include payment confirmation when paying online.
          </Text>
        </View>
      </View>
    </View>
  );
}
