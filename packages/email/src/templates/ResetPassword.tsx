import { Heading, Text, Section } from '@react-email/components';
import type { JSX } from 'react';
import { EmailLayout } from '../components/EmailLayout';
import { EmailButton } from '../components/EmailButton';
import type { ResetPasswordProps } from '../types';

export function ResetPassword({ resetUrl, firstName }: ResetPasswordProps): JSX.Element {
  return (
    <EmailLayout preview="Reset your myK9Show password">
      <Heading as="h1" style={{ fontSize: '24px', margin: '0 0 16px 0', color: '#1a1a1e' }}>
        Reset your password
      </Heading>
      <Text style={text}>
        Hi {firstName}, we received a request to reset your password. Click the button below to
        choose a new one.
      </Text>
      <Section style={{ textAlign: 'center' as const, margin: '32px 0' }}>
        <EmailButton href={resetUrl}>Reset Password</EmailButton>
      </Section>
      <Text style={mutedText}>
        If you didn&apos;t request this, you can safely ignore this email. The link expires in 24
        hours.
      </Text>
    </EmailLayout>
  );
}

const text = { color: '#1a1a1e', fontSize: '16px', lineHeight: '24px' };
const mutedText = { color: '#6b7280', fontSize: '14px', lineHeight: '20px' };
