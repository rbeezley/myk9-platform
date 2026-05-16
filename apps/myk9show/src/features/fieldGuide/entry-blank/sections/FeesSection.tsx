import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankFees } from '@/features/heritage/entry-blank/types';
import {
  BODY,
  Checkbox,
  DISPLAY,
  HAIR,
  INK,
  MONO,
  MUTE,
  ORANGE_DEEP,
  SectionHeader,
} from './pdfPrimitives';

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottomWidth: 0.5,
        borderBottomColor: HAIR,
        paddingVertical: 3,
        marginBottom: 2,
      }}
    >
      <Text style={{ fontFamily: MONO, fontSize: 8.5, color: MUTE }}>{label}</Text>
      <Text
        style={{
          fontFamily: MONO,
          fontWeight: 600,
          fontSize: 9,
          color: INK,
          minWidth: 50,
          textAlign: 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

const PAYMENT_OPTIONS = [
  { key: 'check', label: 'Check enclosed' },
  { key: 'money_order', label: 'Money order' },
  { key: 'online', label: 'Paid online' },
] as const;

export function FeesSection({ fees }: { fees: EntryBlankFees }) {
  return (
    <View>
      <SectionHeader folio="§04" title="Fees tendered" meta="USD · TOTAL AT BOTTOM" />

      <View
        style={{
          flexDirection: 'row',
          gap: 14,
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: INK,
          paddingVertical: 6,
        }}
      >
        {/* Fee rows */}
        <View style={{ flex: 1 }}>
          <FeeRow label={`First entry · ${fees.firstEntryFee} ×`} value="$ ______" />
          <FeeRow label={`Each additional · ${fees.additionalEntryFee} ×`} value="$ ______" />
          <FeeRow label={`Junior handler · ${fees.juniorHandlerFee} ×`} value="$ ______" />
          <FeeRow label={`Mail-in processing · ${fees.mailProcessingFee}`} value="$ ______" />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTopWidth: 0.5,
              borderTopColor: INK,
              marginTop: 4,
              paddingTop: 5,
            }}
          >
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 11,
                letterSpacing: -0.2,
                color: INK,
                textTransform: 'uppercase',
              }}
            >
              TOTAL
            </Text>
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: -0.5,
                color: fees.totalAmount ? ORANGE_DEEP : INK,
                minWidth: 80,
                textAlign: 'right',
              }}
            >
              {fees.totalAmount ?? '$  '}
            </Text>
          </View>
        </View>

        {/* Payment-method panel */}
        <View
          style={{
            width: 130,
            borderLeftWidth: 0.5,
            borderLeftColor: HAIR,
            paddingLeft: 12,
          }}
        >
          <Text
            style={{
              fontFamily: MONO,
              fontWeight: 500,
              fontSize: 7,
              letterSpacing: 0.4,
              color: MUTE,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Payment method
          </Text>
          {PAYMENT_OPTIONS.map(opt => (
            <View
              key={opt.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}
            >
              <Checkbox checked={fees.paymentMethod === opt.key} />
              <Text style={{ fontFamily: BODY, fontSize: 8, color: INK }}>{opt.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
