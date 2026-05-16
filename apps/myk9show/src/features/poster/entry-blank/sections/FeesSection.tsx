import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankFees } from '@/features/heritage/entry-blank/types';
import { BODY, Checkbox, DISPLAY, INK, MONO, MUTE, RED, SectionHeader } from './pdfPrimitives';

function FeeRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottomWidth: 0.5,
        borderBottomColor: INK,
        borderStyle: 'dashed',
        paddingVertical: 2,
        width: '48%',
      }}
    >
      <Text style={{ fontFamily: BODY, fontWeight: 500, fontSize: 8.5, color: MUTE }}>{label}</Text>
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
      <SectionHeader number="04" title="Fees tendered" />

      <View
        style={{
          borderTopWidth: 1.5,
          borderBottomWidth: 1.5,
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
          <FeeRow label={`Additional · ${fees.additionalEntryFee} each`} value="$ ______" />
          <FeeRow label={`Junior handler · ${fees.juniorHandlerFee}`} value="$ ______" />
          <FeeRow label={`Mail-in · ${fees.mailProcessingFee}`} value="$ ______" />
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
          <Text
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: -0.4,
              color: INK,
            }}
          >
            TOTAL
          </Text>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 24,
              letterSpacing: -1,
              color: RED,
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
        <Text
          style={{ fontFamily: MONO, fontWeight: 600, fontSize: 7, letterSpacing: 1.4, color: RED }}
        >
          PAYMENT METHOD
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
