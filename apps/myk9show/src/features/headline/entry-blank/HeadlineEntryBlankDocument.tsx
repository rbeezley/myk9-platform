import '../../../features/premium/pdf/pdfFonts';

import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { EntryBlankProps } from '@/features/heritage/entry-blank/types';

const PAPER = '#fafafa';
const INK = '#0a0a0a';
const SOFT = '#2a2a2a';
const MUTE = '#6b6b6b';
const HAIR = '#d8d8d6';
const ACCENT = '#c4302b';
const DISPLAY = 'Helvetica-Bold';
const BODY = 'Helvetica';

function Kicker({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        fontFamily: DISPLAY,
        fontSize: 7,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: ACCENT,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

function Rule() {
  return <View style={{ borderTopWidth: 1, borderTopColor: INK, marginVertical: 8 }} />;
}

function Box({ children, grow = false }: { children: ReactNode; grow?: boolean }) {
  return (
    <View
      style={{
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: INK,
        paddingVertical: 8,
        flexGrow: grow ? 1 : 0,
      }}
    >
      {children}
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ marginBottom: 5 }}>
      <Text
        style={{
          fontFamily: DISPLAY,
          fontSize: 6.5,
          letterSpacing: 1.1,
          textTransform: 'uppercase',
          color: MUTE,
          marginBottom: 2,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontFamily: BODY, fontSize: 9, color: value ? INK : HAIR }}>
        {value || '________________________________________________'}
      </Text>
    </View>
  );
}

function Checked({ checked }: { checked: boolean }) {
  return (
    <Text
      style={{
        fontFamily: DISPLAY,
        fontSize: 9,
        width: 14,
        height: 12,
        borderWidth: 1,
        borderColor: INK,
        textAlign: 'center',
      }}
    >
      {checked ? 'X' : ''}
    </Text>
  );
}

export function HeadlineEntryBlankDocument(props: EntryBlankProps) {
  return (
    <Document title={`Headline Entry Blank — ${props.showTitle}`} author={props.clubName}>
      <Page
        size="LETTER"
        style={{
          backgroundColor: PAPER,
          padding: 36,
          fontFamily: BODY,
          fontSize: 9,
          color: INK,
        }}
      >
        <View style={{ borderTopWidth: 5, borderTopColor: INK, paddingTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text
              style={{
                backgroundColor: ACCENT,
                color: PAPER,
                fontFamily: DISPLAY,
                fontSize: 8,
                letterSpacing: 1.4,
                paddingHorizontal: 6,
                paddingVertical: 4,
                textTransform: 'uppercase',
              }}
            >
              Entry Blank
            </Text>
            <Text
              style={{
                fontFamily: DISPLAY,
                fontSize: 8,
                letterSpacing: 1.5,
                color: MUTE,
                marginLeft: 8,
                textTransform: 'uppercase',
              }}
            >
              {props.licenseLanguage}
            </Text>
          </View>

          <Text
            style={{
              fontFamily: DISPLAY,
              fontSize: 30,
              lineHeight: 0.95,
              color: INK,
              marginBottom: 4,
            }}
          >
            {props.showTitle}
          </Text>
          <Text
            style={{
              fontFamily: DISPLAY,
              fontSize: 10,
              letterSpacing: 2,
              color: MUTE,
              textTransform: 'uppercase',
            }}
          >
            {props.clubName} · {props.dateRange}
          </Text>
        </View>

        <Rule />

        <View style={{ flexDirection: 'row', gap: 14 }}>
          <View style={{ flex: 1.08 }}>
            <Kicker>§ 01 · The dog</Kicker>
            <Box>
              <Field label="Registered name" value={props.dog.registeredName} />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Call name" value={props.dog.callName} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Breed" value={props.dog.breed} />
                </View>
                <View style={{ width: 38 }}>
                  <Field label="Sex" value={props.dog.sex} />
                </View>
              </View>
              <Field label="Registration number" value={props.dog.registrationNumber} />
              <Field label="Actual owner(s)" value={props.dog.actualOwners} />
            </Box>

            <Kicker>§ 02 · Classes entered</Kicker>
            <Box>
              {props.trials.map(trial => (
                <View
                  key={trial.numeral}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderBottomWidth: 0.5,
                    borderBottomColor: HAIR,
                    paddingVertical: 4,
                  }}
                >
                  <Checked checked={trial.checked} />
                  <Text style={{ fontFamily: DISPLAY, fontSize: 9, width: 36, marginLeft: 6 }}>
                    {trial.numeral}
                  </Text>
                  <Text style={{ fontSize: 8, width: 54, color: MUTE }}>{trial.dateLabel}</Text>
                  <Text style={{ fontSize: 8, flex: 1 }}>{trial.elementsLabel}</Text>
                  <Text style={{ fontSize: 8, width: 68, color: SOFT }}>{trial.judgeName}</Text>
                </View>
              ))}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {props.levelCells.map(cell => (
                  <View
                    key={`${cell.level}-${cell.element}`}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      width: '31%',
                      marginBottom: 3,
                    }}
                  >
                    <Checked checked={cell.checked} />
                    <Text style={{ fontSize: 6.8, marginLeft: 4 }}>
                      {cell.level} · {cell.element}
                    </Text>
                  </View>
                ))}
              </View>
            </Box>
          </View>

          <View style={{ flex: 0.92 }}>
            <Kicker>§ 03 · Owner / handler</Kicker>
            <Box>
              <Field label="Owner" value={props.owner.ownerName} />
              <Field label="Handler" value={props.owner.handlerName} />
              <Field label="Address" value={props.owner.mailingAddress} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Field label="City" value={props.owner.city} />
                </View>
                <View style={{ width: 34 }}>
                  <Field label="State" value={props.owner.state} />
                </View>
                <View style={{ width: 52 }}>
                  <Field label="ZIP" value={props.owner.zip} />
                </View>
              </View>
              <Field label="Email" value={props.owner.email} />
              <Field label="Telephone" value={props.owner.telephone} />
            </Box>

            <Kicker>§ 04 · Fees</Kicker>
            <Box>
              {[
                ['First entry', props.fees.firstEntryFee],
                ['Additional entry', props.fees.additionalEntryFee],
                ['Junior handler', props.fees.juniorHandlerFee],
                ['Mail processing', props.fees.mailProcessingFee],
              ].map(([label, value]) => (
                <View
                  key={label}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    borderBottomWidth: 0.5,
                    borderBottomColor: HAIR,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ color: MUTE }}>{label}</Text>
                  <Text style={{ fontFamily: DISPLAY }}>{value}</Text>
                </View>
              ))}
              <View
                style={{
                  marginTop: 8,
                  paddingTop: 7,
                  borderTopWidth: 1,
                  borderTopColor: INK,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontFamily: DISPLAY, letterSpacing: 1 }}>Total</Text>
                <Text style={{ fontFamily: DISPLAY, fontSize: 18, color: ACCENT }}>
                  {props.fees.totalAmount ?? '$________'}
                </Text>
              </View>
            </Box>

            <Kicker>§ 05 · Mail to</Kicker>
            <Box>
              <Text style={{ fontFamily: DISPLAY, fontSize: 11 }}>
                {props.mailTo.secretaryName ?? 'Trial Secretary'}
              </Text>
              <Text style={{ marginTop: 4 }}>{props.mailTo.poBox ?? 'Mailing address TBD'}</Text>
              <Text>{props.mailTo.cityStateZip ?? ''}</Text>
              <Text style={{ marginTop: 5, color: ACCENT }}>{props.mailTo.email ?? ''}</Text>
            </Box>
          </View>
        </View>

        <Kicker>§ 06 · Agreement</Kicker>
        <Box grow>
          <Text style={{ fontSize: 7.2, lineHeight: 1.35, color: SOFT }}>
            {props.agreementText.split('\n')[0]}
          </Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
            <Field label="Signature" value={null} />
            <Field label="Date" value={null} />
          </View>
        </Box>

        <View
          style={{
            borderTopWidth: 3,
            borderTopColor: INK,
            marginTop: 8,
            paddingTop: 6,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ fontFamily: DISPLAY, fontSize: 7, color: MUTE }}>
            ENTRIES CLOSE {props.closeDate ?? 'TBD'}
          </Text>
          <Text style={{ fontFamily: DISPLAY, fontSize: 7, color: ACCENT }}>
            {props.onlineEntryUrl ?? 'myK9Show'}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
