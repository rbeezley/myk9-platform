import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode, JSX } from 'react';

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

const BRAND_COLOR = '#2563eb';

export function EmailLayout({ preview, children }: EmailLayoutProps): JSX.Element {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={{ backgroundColor: BRAND_COLOR, padding: '16px 24px' }}>
            <Text style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: 0 }}>
              myK9Show
            </Text>
          </Section>
          <Section style={content}>{children}</Section>
          <Section style={footer}>
            <Text style={footerText}>myK9Show — Dog Show Management</Text>
            <Text style={footerText}>
              &copy; {new Date().getFullYear()} myK9Show. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const body = {
  backgroundColor: '#f3f4f6',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: '0',
  padding: '0',
};

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  overflow: 'hidden' as const,
  marginTop: '20px',
  marginBottom: '20px',
};

const content = {
  padding: '32px 24px',
};

const footer = {
  backgroundColor: '#f9fafb',
  padding: '16px 24px',
  borderTop: '1px solid #e5e7eb',
  textAlign: 'center' as const,
};

const footerText = {
  color: '#9ca3af',
  fontSize: '12px',
  margin: '0',
  lineHeight: '20px',
};
