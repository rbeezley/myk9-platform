import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankFees } from '@/features/heritage/entry-blank/types';
import { BODY, BRONZE, Checkbox, DISPLAY, INK, QUILL, SectionHeader } from './pdfPrimitives';

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottomWidth: 0.5,
        borderBottomColor: BRONZE,
        borderStyle: 'dashed',
        paddingVertical: 2,
        width: '48%',
      }}
    >
      <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 9, color: QUILL }}>
        {label}
      </Text>
      <Text style={{ fontFamily: BODY, fontSize: 9, color: INK, minWidth: 40, textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const PAYMENT_OPTIONS = [
  { key: 'check', label: 'Check' },
  { key: 'money_order', label: 'Money order' },
  { key: 'online', label: 'Online (separate)' },
] as const;

export function FeesSection({ fees }: { fees: EntryBlankFees }) {
  return (
    <View>
      <SectionHeader numeral="iv" title="Fees tendered" />

      <View
        style={{
          borderTopWidth: 0.5,
          borderBottomWidth: 0.5,
          borderColor: INK,
          paddingVertical: 8,
          paddingHorizontal: 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            justifyContent: 'space-between',
          }}
        >
          <FeeRow label={`First entry · ${fees.firstEntryFee}`} value="$ ______" />
          <FeeRow
            label={`Additional entries · ${fees.additionalEntryFee} each`}
            value="$ ______"
          />
          <FeeRow label={`Junior handler · ${fees.juniorHandlerFee}`} value="$ ______" />
          <FeeRow label={`Mail-in processing · ${fees.mailProcessingFee}`} value="$ ______" />
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            borderTopWidth: 0.5,
            borderTopColor: INK,
            marginTop: 6,
            paddingTop: 5,
          }}
        >
          <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 11, color: INK }}>
            Total enclosed
          </Text>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontSize: 18,
              fontWeight: 500,
              color: fees.totalAmount ? BRONZE : INK,
              borderBottomWidth: 0.5,
              borderBottomColor: INK,
              minWidth: 80,
              textAlign: 'right',
              paddingBottom: 1,
            }}
          >
            {fees.totalAmount ?? '$  '}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 7 }}>
        <Text style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 9, color: QUILL }}>
          Payment by:
        </Text>
        {PAYMENT_OPTIONS.map(opt => (
          <View key={opt.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Checkbox checked={fees.paymentMethod === opt.key} />
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{opt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
