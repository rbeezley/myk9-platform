import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankFees } from '@/features/heritage/entry-blank/types';
import { BODY, Checkbox, DISPLAY, INK, MUTE, SectionHeader } from './pdfPrimitives';

function FeeRow({ label, value, flag }: { label: string; value: string; flag: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottomWidth: 0.5,
        borderBottomColor: flag,
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

export function FeesSection({ fees, flag }: { fees: EntryBlankFees; flag: string }) {
  return (
    <View>
      <SectionHeader number="04" title="Fees tendered" flag={flag} />

      <View
        style={{
          borderTopWidth: 2,
          borderBottomWidth: 2,
          borderColor: flag,
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
          <FeeRow label={`First entry · ${fees.firstEntryFee}`} value="$ ______" flag={flag} />
          <FeeRow
            label={`Additional · ${fees.additionalEntryFee} each`}
            value="$ ______"
            flag={flag}
          />
          <FeeRow label={`Junior handler · ${fees.juniorHandlerFee}`} value="$ ______" flag={flag} />
          <FeeRow label={`Mail-in · ${fees.mailProcessingFee}`} value="$ ______" flag={flag} />
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
              fontWeight: 800,
              fontSize: 10,
              letterSpacing: 1.8,
              color: INK,
            }}
          >
            TOTAL ENCLOSED
          </Text>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: -0.5,
              color: fees.totalAmount ? flag : INK,
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
          style={{ fontFamily: BODY, fontWeight: 500, fontSize: 8, letterSpacing: 1.6, color: MUTE }}
        >
          PAYMENT BY:
        </Text>
        {PAYMENT_OPTIONS.map(opt => (
          <View key={opt.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Checkbox checked={fees.paymentMethod === opt.key} flag={flag} />
            <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{opt.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
