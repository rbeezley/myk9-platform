import { Text, View } from '@react-pdf/renderer';
import type { EntryBlankFees } from '../types';
import { BODY, BROWN, Checkbox, DISPLAY, INK, META, QUILL, SectionHead } from './pdfPrimitives';

function FeeLineRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        borderBottomWidth: 0.4,
        borderBottomColor: INK,
        paddingVertical: 3,
      }}
    >
      <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{label}</Text>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontWeight: 700,
          fontSize: 11,
          color: INK,
          textAlign: 'right',
          minWidth: 60,
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

/**
 * Section iv. Fees tendered — single-column fee stack with bold-Playfair
 * total row and three payment-method checkboxes. Matches the design mock's
 * vertical orientation (Heritage runs a two-column fee grid; Gazette goes
 * single-column for newspaper-classifieds feel).
 */
export function FeesSection({ fees }: { fees: EntryBlankFees }) {
  return (
    <View>
      <SectionHead folio="iv." title="Fees tendered" />

      <View
        style={{
          flexDirection: 'row',
          gap: 18,
          borderTopWidth: 0.4,
          borderTopColor: INK,
          borderBottomWidth: 0.4,
          borderBottomColor: INK,
          paddingVertical: 8,
        }}
      >
        <View style={{ flex: 2 }}>
          <FeeLineRow label={`First entry — ${fees.firstEntryFee} ×`} value="$" />
          <FeeLineRow label={`Each additional — ${fees.additionalEntryFee} ×`} value="$" />
          <FeeLineRow label={`Junior handler — ${fees.juniorHandlerFee} ×`} value="$" />
          <FeeLineRow label={`Mail-in processing — ${fees.mailProcessingFee}`} value="$" />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              borderTopWidth: 0.6,
              borderTopColor: INK,
              marginTop: 4,
              paddingTop: 6,
            }}
          >
            <Text style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 13, color: INK }}>
              Total
            </Text>
            <Text
              style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: 18,
                color: BROWN,
              }}
            >
              {fees.totalAmount ?? '$  '}
            </Text>
          </View>
        </View>

        <View
          style={{
            flex: 1,
            borderLeftWidth: 0.4,
            borderLeftColor: INK,
            paddingLeft: 12,
          }}
        >
          <Text
            style={{
              fontFamily: META,
              fontWeight: 500,
              fontSize: 6.5,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              color: BROWN,
              marginBottom: 6,
            }}
          >
            Payment method
          </Text>
          {PAYMENT_OPTIONS.map(opt => (
            <View key={opt.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <Checkbox checked={fees.paymentMethod === opt.key} />
              <Text style={{ fontFamily: BODY, fontSize: 9, color: INK }}>{opt.label}</Text>
            </View>
          ))}
          <Text
            style={{
              fontFamily: BODY,
              fontSize: 7.5,
              color: QUILL,
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            Make checks payable to the club.
          </Text>
        </View>
      </View>
    </View>
  );
}
