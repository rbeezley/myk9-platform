import { Heading, Text, Section } from '@react-email/components';
import type { JSX } from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { EmailButton } from '../components/EmailButton';
import type { ConfirmEmailProps } from '../types';

export function ConfirmEmail({ confirmUrl, firstName }: ConfirmEmailProps): JSX.Element {
  return (
    <EmailLayout preview="Confirm your email address for myK9Show">
      <Heading as="h1" style={{ fontSize: '24px', margin: '0 0 16px 0', color: '#1a1a1e' }}>
        Confirm your email
      </Heading>
      <Text style={text}>
        Hi {firstName}, thanks for signing up for myK9Show. Please confirm your email address to get
        started.
      </Text>
      <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
        <EmailButton href={confirmUrl}>Confirm Email</EmailButton>
      </Section>
      <Text style={mutedText}>
        If you didn&apos;t create an account, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

const text = { color: '#1a1a1e', fontSize: '16px', lineHeight: '24px' };
const mutedText = { color: '#6b7280', fontSize: '14px', lineHeight: '20px' };
