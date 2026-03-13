import { Heading, Text, Section, Row, Column, Hr } from '@react-email/components';
import type { JSX } from 'react';
import { EmailLayout } from '../components/EmailLayout';
import type { RegistrationConfirmationProps } from '../types';

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function RegistrationConfirmation({
  firstName,
  confirmationNumber,
  show,
  entries,
  payment,
}: RegistrationConfirmationProps): JSX.Element {
  return (
    <EmailLayout preview={`Registration Confirmed — ${confirmationNumber}`}>
      <Heading as="h1" style={{ fontSize: '24px', margin: '0 0 16px 0', color: '#1a1a1e' }}>
        Registration Confirmed
      </Heading>

      <Section style={confirmBadge}>
        <Text style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>Confirmation Number</Text>
        <Text
          style={{
            margin: '4px 0 0',
            fontSize: '20px',
            fontWeight: '600',
            color: '#059669',
            fontFamily: 'monospace',
          }}
        >
          {confirmationNumber}
        </Text>
      </Section>

      <Text style={text}>Hi {firstName}, your registration has been confirmed.</Text>

      <Section style={showBox}>
        <Text style={{ margin: 0, fontWeight: '600', fontSize: '18px', color: '#1a1a1e' }}>
          {show.name}
        </Text>
        <Text style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '14px' }}>
          {show.startDate} — {show.endDate}
        </Text>
        <Text style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '14px' }}>
          {show.location}
          {show.venue ? ` · ${show.venue}` : ''}
        </Text>
      </Section>

      {show.confirmationMessage && (
        <Section style={messageBox}>
          <Text
            style={{ margin: '0 0 4px', fontWeight: '600', fontSize: '14px', color: '#1e40af' }}
          >
            From the show secretary
          </Text>
          <Text style={{ margin: 0, color: '#1e3a5f', fontSize: '14px', lineHeight: '22px' }}>
            {show.confirmationMessage}
          </Text>
        </Section>
      )}

      <Heading as="h2" style={{ fontSize: '16px', margin: '24px 0 12px', color: '#1a1a1e' }}>
        Your Entries
      </Heading>
      {entries.map((entry, i) => (
        <Row key={i} style={entryRow}>
          <Column>
            <Text style={{ margin: 0, fontWeight: '600' }}>{entry.dogName}</Text>
            <Text style={{ margin: '2px 0 0', color: '#6b7280', fontSize: '14px' }}>
              {entry.className}
            </Text>
          </Column>
          {entry.armband && (
            <Column style={{ textAlign: 'right' as const }}>
              <Text style={{ margin: 0, color: '#6b7280', fontSize: '14px' }}>
                #{entry.armband}
              </Text>
            </Column>
          )}
        </Row>
      ))}

      <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 16px' }} />

      <Row>
        <Column>
          <Text style={paymentLabel}>Subtotal</Text>
        </Column>
        <Column style={{ textAlign: 'right' as const }}>
          <Text style={paymentValue}>{formatCurrency(payment.subtotal)}</Text>
        </Column>
      </Row>
      {payment.discount && payment.discount > 0 && (
        <Row>
          <Column>
            <Text style={paymentLabel}>Discount</Text>
          </Column>
          <Column style={{ textAlign: 'right' as const }}>
            <Text style={{ ...paymentValue, color: '#059669' }}>
              -{formatCurrency(payment.discount)}
            </Text>
          </Column>
        </Row>
      )}
      <Row>
        <Column>
          <Text style={{ ...paymentLabel, fontWeight: '600', fontSize: '18px' }}>Total</Text>
        </Column>
        <Column style={{ textAlign: 'right' as const }}>
          <Text style={{ ...paymentValue, fontWeight: '600', fontSize: '18px' }}>
            {formatCurrency(payment.total)}
          </Text>
        </Column>
      </Row>
      <Text style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}>{payment.method}</Text>

      <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0 16px' }} />

      <Text style={mutedText}>Questions? Contact the show secretary.</Text>
    </EmailLayout>
  );
}

const text = { color: '#1a1a1e', fontSize: '16px', lineHeight: '24px' };
const mutedText = { color: '#6b7280', fontSize: '14px', lineHeight: '20px' };
const confirmBadge = {
  backgroundColor: '#ecfdf5',
  borderRadius: '6px',
  padding: '16px',
  textAlign: 'center' as const,
  marginBottom: '24px',
};
const showBox = {
  backgroundColor: '#f9fafb',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '16px',
};
const messageBox = {
  backgroundColor: '#eff6ff',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '16px',
  borderLeft: '4px solid #3b82f6',
};
const entryRow = { padding: '8px 0', borderBottom: '1px solid #f3f4f6' };
const paymentLabel = { margin: 0, color: '#6b7280', fontSize: '14px' };
const paymentValue = { margin: 0, color: '#1a1a1e', fontSize: '14px' };
