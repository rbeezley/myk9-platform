import { Button } from '@react-email/components';
import type { JSX } from 'react';

interface EmailButtonProps {
  href: string;
  children: string;
}

const BRAND_COLOR = '#2563eb';

export function EmailButton({ href, children }: EmailButtonProps): JSX.Element {
  return (
    <Button
      href={href}
      style={{
        backgroundColor: BRAND_COLOR,
        color: '#ffffff',
        padding: '12px 32px',
        borderRadius: '6px',
        fontWeight: '600',
        fontSize: '16px',
        textDecoration: 'none',
        display: 'inline-block',
        textAlign: 'center' as const,
      }}
    >
      {children}
    </Button>
  );
}
