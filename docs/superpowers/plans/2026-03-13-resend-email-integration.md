# Resend Email Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase's rate-limited built-in auth emails with Resend, fix the broken confirmation redirect, and send registration confirmation emails with delivery tracking.

**Architecture:** All emails sent via Resend REST API from Supabase Edge Functions. Auth emails triggered by Supabase Auth Hook. Registration emails triggered from app code. Delivery status tracked via Resend webhooks → `email_log` table → secretary UI indicators.

**Tech Stack:** Supabase Edge Functions (Deno), Resend API, React Email (TSX templates in `packages/email/`), React Router (auth callback route)

**Spec:** `docs/superpowers/specs/2026-03-13-resend-email-integration-design.md`

**Key discovery:** An existing `send-email` Edge Function exists at `apps/myk9show/supabase/functions/send-email/index.ts` with Resend integration, CORS, HTML templates, and `email_logs` logging. We'll consolidate and build on this work rather than starting from scratch.

---

## File Structure

### New Files

| File                                                             | Responsibility                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/email/package.json`                                    | Package config for `@myk9/email`                              |
| `packages/email/tsconfig.json`                                   | TypeScript config                                             |
| `packages/email/tsup.config.ts`                                  | Build config                                                  |
| `packages/email/src/index.ts`                                    | Package exports                                               |
| `packages/email/src/components/EmailLayout.tsx`                  | Shared layout wrapper (header, footer, responsive container)  |
| `packages/email/src/components/EmailButton.tsx`                  | Branded CTA button                                            |
| `packages/email/src/templates/ConfirmEmail.tsx`                  | Signup confirmation template                                  |
| `packages/email/src/templates/ResetPassword.tsx`                 | Password reset template                                       |
| `packages/email/src/templates/RegistrationConfirmation.tsx`      | Registration confirmation with entries/payment/custom message |
| `packages/email/src/types.ts`                                    | Shared types for template props                               |
| `packages/email/src/__tests__/templates.test.ts`                 | Template rendering tests                                      |
| `supabase/functions/send-auth-email/index.ts`                    | Auth Hook Edge Function                                       |
| `supabase/functions/resend-webhook/index.ts`                     | Delivery status webhook handler                               |
| `supabase/migrations/061_email_log_and_confirmation_message.sql` | `email_log` table + `confirmation_message` on shows           |
| `apps/myk9show/src/pages/AuthCallbackPage.tsx`                   | Auth token verification + redirect                            |
| `apps/myk9show/src/pages/ResetPasswordPage.tsx`                  | New password form after recovery                              |
| `apps/myk9show/src/components/entries/EmailStatusIcon.tsx`       | Delivery status indicator for secretary UI                    |
| `apps/myk9show/src/hooks/useEmailStatus.ts`                      | Hook to fetch email_log status for entries                    |
| `apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx`         | Auth callback tests                                           |
| `apps/myk9show/src/test/pages/ResetPasswordPage.test.tsx`        | Reset password tests                                          |
| `apps/myk9show/src/test/components/EmailStatusIcon.test.tsx`     | Email status icon tests                                       |

### Modified Files

| File                                                                        | Change                                                                                                                                                         |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/myk9show/src/App.tsx`                                                 | Add `/auth/callback` and `/reset-password` routes                                                                                                              |
| `apps/myk9show/src/hooks/useAuth.ts`                                        | Add `redirectTo` to `resetPasswordForEmail` call                                                                                                               |
| `supabase/functions/send-registration-email/index.ts`                       | Evolve from existing `apps/myk9show/supabase/functions/send-email/index.ts` — move to root, use React Email templates, add `email_log` writes, add idempotency |
| `apps/myk9show/src/store/showRegistrationStore.ts`                          | Call `send-registration-email` after `confirmRegistration`                                                                                                     |
| `apps/myk9show/src/services/mappers/showMappers.ts`                         | Add `confirmation_message` field mapping                                                                                                                       |
| `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx` | Add confirmation message textarea                                                                                                                              |
| `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx`                 | Add confirmation message field                                                                                                                                 |
| `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx`              | Show confirmation message in ReviewStep                                                                                                                        |
| `pnpm-workspace.yaml`                                                       | Add `packages/email` if not auto-detected                                                                                                                      |

---

## Chunk 1: Database Migration + Email Package Foundation

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/061_email_log_and_confirmation_message.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add confirmation_message to shows
ALTER TABLE shows ADD COLUMN IF NOT EXISTS confirmation_message TEXT;

-- Create email_log table
CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email TEXT NOT NULL,
  email_type TEXT NOT NULL,
  related_id UUID,
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  status_updated_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_related ON email_log(related_id);
CREATE INDEX IF NOT EXISTS idx_email_log_resend_id ON email_log(resend_message_id);

-- RLS
ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_log_select ON email_log
  FOR SELECT USING (
    is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM registrations r
      JOIN shows s ON s.id = r.show_id
      WHERE r.id = email_log.related_id
      AND is_show_secretary(s.id)
    )
  );
```

- [ ] **Step 2: Push migration to Supabase**

Run: `supabase db push`
Expected: Migration applied successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/061_email_log_and_confirmation_message.sql
git commit -m "feat(email): add email_log table and confirmation_message to shows"
```

### Task 2: Create `@myk9/email` Package Scaffold

**Files:**

- Create: `packages/email/package.json`
- Create: `packages/email/tsconfig.json`
- Create: `packages/email/tsup.config.ts`
- Create: `packages/email/src/index.ts`
- Create: `packages/email/src/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@myk9/email",
  "version": "0.0.1",
  "description": "Email templates for myK9Show — React Email components",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@react-email/components": "^0.0.36",
    "react": "^19.1.0"
  },
  "devDependencies": {
    "@myk9/test-utils": "workspace:*",
    "@react-email/render": "^1.0.5",
    "@vitest/coverage-v8": "^4.0.18",
    "tsup": "^8.5.1",
    "typescript": "~5.9.3",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create tsup.config.ts**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react'],
});
```

- [ ] **Step 4: Create types.ts**

```typescript
export interface ConfirmEmailProps {
  confirmUrl: string;
  firstName: string;
}

export interface ResetPasswordProps {
  resetUrl: string;
  firstName: string;
}

export interface RegistrationConfirmationProps {
  firstName: string;
  confirmationNumber: string;
  show: {
    name: string;
    startDate: string;
    endDate: string;
    location: string;
    venue?: string;
    confirmationMessage?: string;
  };
  entries: Array<{
    dogName: string;
    className: string;
    armband?: string;
  }>;
  payment: {
    subtotal: number;
    discount?: number;
    total: number;
    method: string;
  };
}
```

- [ ] **Step 5: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  esbuild: {
    jsx: 'automatic',
  },
});
```

- [ ] **Step 6: Verify `pnpm-workspace.yaml` includes `packages/email`**

Run: `cat pnpm-workspace.yaml`
If `packages/*` is already listed as a glob, no change needed. If not, add `packages/email` to the list.

- [ ] **Step 7: Create index.ts (empty exports for now)**

```typescript
export type { ConfirmEmailProps, ResetPasswordProps, RegistrationConfirmationProps } from './types';
```

- [ ] **Step 8: Install dependencies**

Run: `pnpm install`
Expected: Dependencies installed, `@myk9/email` linked in workspace.

- [ ] **Step 9: Verify build**

Run: `cd packages/email && pnpm build`
Expected: Build succeeds, `dist/` created.

- [ ] **Step 10: Commit**

```bash
git add packages/email/
git commit -m "feat(email): scaffold @myk9/email package with types"
```

### Task 3: Shared Email Components

**Files:**

- Create: `packages/email/src/components/EmailLayout.tsx`
- Create: `packages/email/src/components/EmailButton.tsx`

- [ ] **Step 1: Write test for EmailLayout rendering**

Create `packages/email/src/__tests__/templates.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { render } from '@react-email/render';
import { ConfirmEmail } from '../templates/ConfirmEmail';
import { ResetPassword } from '../templates/ResetPassword';
import { RegistrationConfirmation } from '../templates/RegistrationConfirmation';

describe('Email Templates', () => {
  describe('ConfirmEmail', () => {
    it('renders with confirm URL and name', async () => {
      const html = await render(
        ConfirmEmail({ confirmUrl: 'https://example.com/confirm', firstName: 'Jane' })
      );
      expect(html).toContain('Jane');
      expect(html).toContain('https://example.com/confirm');
      expect(html).toContain('Confirm');
    });
  });

  describe('ResetPassword', () => {
    it('renders with reset URL and name', async () => {
      const html = await render(
        ResetPassword({ resetUrl: 'https://example.com/reset', firstName: 'Jane' })
      );
      expect(html).toContain('Jane');
      expect(html).toContain('https://example.com/reset');
      expect(html).toContain('Reset');
    });
  });

  describe('RegistrationConfirmation', () => {
    it('renders with full registration data', async () => {
      const html = await render(
        RegistrationConfirmation({
          firstName: 'Jane',
          confirmationNumber: 'MK9-001234',
          show: {
            name: 'Spring Classic',
            startDate: '2026-04-15',
            endDate: '2026-04-16',
            location: 'Portland, OR',
            venue: 'Expo Center',
          },
          entries: [{ dogName: 'Max', className: 'Novice Agility', armband: '42' }],
          payment: { subtotal: 3500, total: 3500, method: 'Visa ending in 4242' },
        })
      );
      expect(html).toContain('MK9-001234');
      expect(html).toContain('Spring Classic');
      expect(html).toContain('Max');
      expect(html).toContain('Novice Agility');
      expect(html).toContain('$35.00');
    });

    it('renders secretary custom message when provided', async () => {
      const html = await render(
        RegistrationConfirmation({
          firstName: 'Jane',
          confirmationNumber: 'MK9-001234',
          show: {
            name: 'Spring Classic',
            startDate: '2026-04-15',
            endDate: '2026-04-16',
            location: 'Portland, OR',
            confirmationMessage: 'Parking is on the north side. Bring your own crates.',
          },
          entries: [{ dogName: 'Max', className: 'Novice Agility' }],
          payment: { subtotal: 3500, total: 3500, method: 'Visa ending in 4242' },
        })
      );
      expect(html).toContain('Parking is on the north side');
    });

    it('omits custom message section when not provided', async () => {
      const html = await render(
        RegistrationConfirmation({
          firstName: 'Jane',
          confirmationNumber: 'MK9-001234',
          show: {
            name: 'Spring Classic',
            startDate: '2026-04-15',
            endDate: '2026-04-16',
            location: 'Portland, OR',
          },
          entries: [{ dogName: 'Max', className: 'Novice Agility' }],
          payment: { subtotal: 3500, total: 3500, method: 'Visa ending in 4242' },
        })
      );
      expect(html).not.toContain('From the show secretary');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/email && pnpm test`
Expected: FAIL — templates don't exist yet.

- [ ] **Step 3: Write EmailLayout component**

```tsx
// packages/email/src/components/EmailLayout.tsx
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import type { ReactNode } from 'react';

interface EmailLayoutProps {
  preview: string;
  children: ReactNode;
}

const BRAND_COLOR = '#2563eb';

export function EmailLayout({ preview, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={container}>
          {/* Header bar */}
          <Section style={{ backgroundColor: BRAND_COLOR, padding: '16px 24px' }}>
            <Text style={{ color: '#ffffff', fontSize: '20px', fontWeight: '600', margin: 0 }}>
              myK9Show
            </Text>
          </Section>

          {/* Content */}
          <Section style={content}>{children}</Section>

          {/* Footer */}
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
```

- [ ] **Step 4: Write EmailButton component**

```tsx
// packages/email/src/components/EmailButton.tsx
import { Button } from '@react-email/components';

interface EmailButtonProps {
  href: string;
  children: string;
}

const BRAND_COLOR = '#2563eb';

export function EmailButton({ href, children }: EmailButtonProps) {
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
```

- [ ] **Step 5: Commit components**

```bash
git add packages/email/src/components/
git commit -m "feat(email): add EmailLayout and EmailButton shared components"
```

### Task 4: Email Templates

**Files:**

- Create: `packages/email/src/templates/ConfirmEmail.tsx`
- Create: `packages/email/src/templates/ResetPassword.tsx`
- Create: `packages/email/src/templates/RegistrationConfirmation.tsx`
- Modify: `packages/email/src/index.ts`

- [ ] **Step 1: Write ConfirmEmail template**

```tsx
// packages/email/src/templates/ConfirmEmail.tsx
import { Heading, Text, Section } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { EmailButton } from '../components/EmailButton';
import type { ConfirmEmailProps } from '../types';

export function ConfirmEmail({ confirmUrl, firstName }: ConfirmEmailProps) {
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
```

- [ ] **Step 2: Write ResetPassword template**

```tsx
// packages/email/src/templates/ResetPassword.tsx
import { Heading, Text, Section } from '@react-email/components';
import { EmailLayout } from '../components/EmailLayout';
import { EmailButton } from '../components/EmailButton';
import type { ResetPasswordProps } from '../types';

export function ResetPassword({ resetUrl, firstName }: ResetPasswordProps) {
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
```

- [ ] **Step 3: Write RegistrationConfirmation template**

```tsx
// packages/email/src/templates/RegistrationConfirmation.tsx
import { Heading, Text, Section, Row, Column, Hr } from '@react-email/components';
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
}: RegistrationConfirmationProps) {
  return (
    <EmailLayout preview={`Registration Confirmed — ${confirmationNumber}`}>
      <Heading as="h1" style={{ fontSize: '24px', margin: '0 0 16px 0', color: '#1a1a1e' }}>
        Registration Confirmed
      </Heading>

      {/* Confirmation number */}
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

      {/* Show details */}
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

      {/* Secretary custom message */}
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

      {/* Entries */}
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

      {/* Payment */}
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
```

- [ ] **Step 4: Update index.ts exports**

```typescript
// packages/email/src/index.ts
export type { ConfirmEmailProps, ResetPasswordProps, RegistrationConfirmationProps } from './types';

export { ConfirmEmail } from './templates/ConfirmEmail';
export { ResetPassword } from './templates/ResetPassword';
export { RegistrationConfirmation } from './templates/RegistrationConfirmation';
export { EmailLayout } from './components/EmailLayout';
export { EmailButton } from './components/EmailButton';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/email && pnpm test`
Expected: All 4 tests pass.

- [ ] **Step 6: Build package**

Run: `cd packages/email && pnpm build`
Expected: Build succeeds.

- [ ] **Step 7: Run full quality gate**

Run: `pnpm typecheck && pnpm lint`
Expected: Zero errors.

- [ ] **Step 8: Commit**

```bash
git add packages/email/
git commit -m "feat(email): add ConfirmEmail, ResetPassword, RegistrationConfirmation templates"
```

---

## Chunk 2: Auth Callback Route + Reset Password Page

### Task 5: Auth Callback Page

**Files:**

- Create: `apps/myk9show/src/pages/AuthCallbackPage.tsx`
- Create: `apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx`
- Modify: `apps/myk9show/src/App.tsx` (add route)

- [ ] **Step 1: Write tests for AuthCallbackPage**

```tsx
// apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AuthCallbackPage from '@/pages/AuthCallbackPage';

const mockVerifyOtp = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWithRouter(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/auth/callback${search}`]}>
      <AuthCallbackPage />
    </MemoryRouter>
  );
}

describe('AuthCallbackPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state during verification', () => {
    mockVerifyOtp.mockReturnValue(new Promise(() => {})); // never resolves
    renderWithRouter('?token_hash=abc&type=signup');
    expect(screen.getByText(/verifying/i)).toBeInTheDocument();
  });

  it('redirects to home on successful signup verification', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    renderWithRouter('?token_hash=abc&type=signup');
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('redirects to reset-password on successful recovery verification', async () => {
    mockVerifyOtp.mockResolvedValue({ data: { user: {} }, error: null });
    renderWithRouter('?token_hash=abc&type=recovery');
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/reset-password', { replace: true })
    );
  });

  it('shows error state when verification fails', async () => {
    mockVerifyOtp.mockResolvedValue({ data: {}, error: { message: 'Token expired' } });
    renderWithRouter('?token_hash=abc&type=signup');
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
  });

  it('shows error when params are missing', async () => {
    renderWithRouter('');
    await waitFor(() => expect(screen.getByText(/invalid/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/AuthCallbackPage.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write AuthCallbackPage**

```tsx
// apps/myk9show/src/pages/AuthCallbackPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const AuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'signup' | 'recovery' | 'magiclink' | null;

    if (!tokenHash || !type) {
      setError('Invalid or missing verification link.');
      return;
    }

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: verifyError }) => {
      if (verifyError) {
        setError('This link may have expired. Please request a new one.');
        return;
      }
      if (type === 'recovery') {
        navigate('/reset-password', { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    });
  }, [searchParams, navigate]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Verification Failed</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-muted-foreground">Verifying your email...</p>
    </div>
  );
};

export default AuthCallbackPage;
```

- [ ] **Step 4: Add route to App.tsx**

Add after the `forgot-password` route in `App.tsx`:

```tsx
const AuthCallbackPage = React.lazy(() => import('./pages/AuthCallbackPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
```

Add routes:

```tsx
<Route path="/auth/callback" element={<Suspense fallback={<LoadingFallback />}><AuthCallbackPage /></Suspense>} />
<Route path="/reset-password" element={<Suspense fallback={<LoadingFallback />}><ResetPasswordPage /></Suspense>} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/AuthCallbackPage.test.tsx`
Expected: All 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/pages/AuthCallbackPage.tsx apps/myk9show/src/test/pages/AuthCallbackPage.test.tsx apps/myk9show/src/App.tsx
git commit -m "feat(auth): add /auth/callback route for email verification"
```

### Task 6: Reset Password Page

**Files:**

- Create: `apps/myk9show/src/pages/ResetPasswordPage.tsx`
- Create: `apps/myk9show/src/test/pages/ResetPasswordPage.test.tsx`

- [ ] **Step 1: Write tests for ResetPasswordPage**

```tsx
// apps/myk9show/src/test/pages/ResetPasswordPage.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResetPasswordPage from '@/pages/ResetPasswordPage';

const mockUpdateUser = vi.fn();
const mockGetSession = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    },
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows expired message when no active session', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByText(/expired/i)).toBeInTheDocument());
  });

  it('shows password form when session exists', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await waitFor(() => expect(screen.getByLabelText(/new password/i)).toBeInTheDocument());
  });

  it('validates passwords match', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await waitFor(() => screen.getByLabelText(/new password/i));
    await user.type(screen.getByLabelText(/new password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('calls updateUser and shows success on valid submit', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } } });
    mockUpdateUser.mockResolvedValue({ error: null });
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    const user = userEvent.setup();

    await waitFor(() => screen.getByLabelText(/new password/i));
    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    );
    expect(screen.getByText(/password updated/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/ResetPasswordPage.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Write ResetPasswordPage**

```tsx
// apps/myk9show/src/pages/ResetPasswordPage.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const ResetPasswordPage = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionValid(!!session);
    });
  }, []);

  if (sessionValid === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-destructive/10 border border-destructive/20">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Link Expired</h2>
          <p className="text-muted-foreground mb-6">
            This link has expired. Please request a new password reset.
          </p>
          <Link to="/forgot-password" className="text-primary hover:underline font-medium">
            Request new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
        <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20">
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2">Password Updated</h2>
          <p className="text-muted-foreground mb-6">Your password has been updated successfully.</p>
          <Link to="/sign-in" className="text-primary hover:underline font-medium">
            &larr; Sign in with new password
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="bg-card p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex justify-center mb-4">
          <Link to="/" className="text-3xl font-bold text-primary hover:underline">
            myK9Show
          </Link>
        </div>
        <h2 className="text-2xl font-bold mb-2 text-center">Choose a new password</h2>
        <p className="text-muted-foreground text-center mb-6">Enter your new password below.</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block mb-1 font-medium" htmlFor="new-password">
              New password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type="password"
                id="new-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
                minLength={8}
              />
            </div>
          </div>
          <div className="mb-6">
            <label className="block mb-1 font-medium" htmlFor="confirm-password">
              Confirm password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Lock size={18} />
              </span>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-2 pl-10 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground"
                required
              />
            </div>
          </div>
          {error && <div className="text-destructive mb-4 text-center">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPasswordPage;
```

- [ ] **Step 4: Update useAuth.ts to pass redirectTo**

In `apps/myk9show/src/hooks/useAuth.ts`, update `resetPassword`:

```typescript
const resetPassword = useCallback(async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/callback`,
  });
  if (error) {
    throw error;
  }
}, []);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/test/pages/ResetPasswordPage.test.tsx`
Expected: All 4 tests pass.

- [ ] **Step 6: Run full quality gate**

Run: `pnpm typecheck && pnpm lint`
Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/pages/ResetPasswordPage.tsx apps/myk9show/src/test/pages/ResetPasswordPage.test.tsx apps/myk9show/src/hooks/useAuth.ts
git commit -m "feat(auth): add /reset-password page with session guard"
```

---

## Chunk 3: Edge Functions

### Task 7: `send-auth-email` Edge Function

**Files:**

- Create: `supabase/functions/send-auth-email/index.ts`

- [ ] **Step 1: Write the Edge Function**

Reference the existing `send-push-notification` pattern for structure. The function uses Deno `fetch` to call the Resend API directly (no npm import needed).

```typescript
// supabase/functions/send-auth-email/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const siteUrl = Deno.env.get('SITE_URL') || 'http://localhost:5173';
const FROM_EMAIL = 'myK9Show <noreply@myk9show.com>';

interface AuthHookPayload {
  user: {
    email: string;
    user_metadata?: { first_name?: string };
  };
  email_data: {
    token_hash: string;
    redirect_to: string;
    email_action_type: 'signup' | 'recovery' | 'magiclink';
  };
}

// [ADDED] Escape user-provided strings to prevent XSS in email HTML
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildAuthEmailHtml(
  type: string,
  firstName: string,
  actionUrl: string
): { subject: string; html: string } {
  // Inline HTML templates (React Email can't run in Deno Edge Functions)
  // These match the React Email templates in @myk9/email for consistency
  const brandColor = '#2563eb';
  // [ADDED] Escape user-controlled values before interpolation
  const safeFirstName = escapeHtml(firstName);
  const safeActionUrl = escapeHtml(actionUrl);

  const layout = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background-color: ${brandColor}; padding: 16px 24px;">
      <p style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">myK9Show</p>
    </div>
    <div style="padding: 32px 24px;">
      <h1 style="font-size: 24px; margin: 0 0 16px; color: #1a1a1e;">${title}</h1>
      ${body}
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;

  const button = (text: string) =>
    `<div style="text-align: center; margin: 32px 0;">
      <a href="${safeActionUrl}" style="background-color: ${brandColor}; color: #fff; padding: 12px 32px; border-radius: 6px; font-weight: 600; text-decoration: none; display: inline-block;">${text}</a>
    </div>`;

  if (type === 'recovery') {
    return {
      subject: 'Reset your myK9Show password',
      html: layout(
        'Reset your password',
        `
        <p style="color: #1a1a1e; font-size: 16px;">Hi ${safeFirstName}, we received a request to reset your password. Click the button below to choose a new one.</p>
        ${button('Reset Password')}
        <p style="color: #6b7280; font-size: 14px;">If you didn't request this, you can safely ignore this email. The link expires in 24 hours.</p>
      `
      ),
    };
  }

  // signup + magiclink
  const isSignup = type === 'signup';
  return {
    subject: isSignup ? 'Confirm your myK9Show email' : 'Sign in to myK9Show',
    html: layout(
      isSignup ? 'Confirm your email' : 'Sign in to myK9Show',
      `<p style="color: #1a1a1e; font-size: 16px;">Hi ${safeFirstName}, ${
        isSignup
          ? 'thanks for signing up for myK9Show. Please confirm your email address to get started.'
          : 'click the button below to sign in.'
      }</p>
      ${button(isSignup ? 'Confirm Email' : 'Sign In')}
      <p style="color: #6b7280; font-size: 14px;">${
        isSignup
          ? "If you didn't create an account, you can safely ignore this email."
          : "If you didn't request this, you can safely ignore this email."
      }</p>`
    ),
  };
}

Deno.serve(async (req: Request) => {
  try {
    const payload: AuthHookPayload = await req.json();
    const { user, email_data } = payload;

    const firstName = user.user_metadata?.first_name || 'there';
    const callbackUrl = `${siteUrl}/auth/callback?token_hash=${email_data.token_hash}&type=${email_data.email_action_type}`;

    const { subject, html } = buildAuthEmailHtml(
      email_data.email_action_type,
      firstName,
      callbackUrl
    );

    // Log to email_log regardless of send outcome
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let resendMessageId: string | undefined;
    let sendStatus = 'sent';
    let errorMessage: string | undefined;

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      sendStatus = 'failed';
      errorMessage = 'RESEND_API_KEY not configured';
    } else {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: user.email,
            subject,
            html,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          resendMessageId = result.id;
          console.log(`Auth email sent: ${result.id} to ${user.email}`);
        } else {
          const err = await response.json();
          sendStatus = 'failed';
          errorMessage = JSON.stringify(err);
          console.error('Resend API error:', err);
        }
      } catch (err) {
        sendStatus = 'failed';
        errorMessage = (err as Error).message;
        console.error('Resend fetch error:', err);
      }
    }

    // Write email_log row
    await supabase
      .from('email_log')
      .insert({
        recipient_email: user.email,
        email_type:
          email_data.email_action_type === 'recovery' ? 'password_reset' : 'auth_confirmation',
        resend_message_id: resendMessageId,
        status: sendStatus,
        error_message: errorMessage,
      })
      .catch(err => {
        console.error('Failed to write email_log:', err);
      });

    // Always return success so auth flow completes
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('send-auth-email error:', err);
    // Return success even on error to not block auth flow
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy send-auth-email --no-verify-jwt`
Expected: Function deployed successfully.

- [ ] **Step 3: Set secrets**

Run: `supabase secrets set RESEND_API_KEY=<key> SITE_URL=https://myk9-platform-myk9show.vercel.app`
Note: User needs to provide the actual Resend API key. `SUPABASE_SERVICE_ROLE_KEY` is available by default.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-auth-email/
git commit -m "feat(email): add send-auth-email Edge Function for Supabase Auth Hook"
```

### Task 8: `send-registration-email` Edge Function

**Files:**

- Create: `supabase/functions/send-registration-email/index.ts` (evolved from `apps/myk9show/supabase/functions/send-email/index.ts`)

- [ ] **Step 1: Write the Edge Function**

This consolidates the existing `send-email` function, focusing on registration confirmation with `email_log` tracking and idempotency.

```typescript
// supabase/functions/send-registration-email/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const resendApiKey = Deno.env.get('RESEND_API_KEY');
const FROM_EMAIL = 'myK9Show <noreply@myk9show.com>';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildRegistrationEmailHtml(data: {
  firstName: string;
  confirmationNumber: string;
  showName: string;
  showDates: string;
  showLocation: string;
  showVenue?: string;
  confirmationMessage?: string;
  entries: Array<{ dogName: string; className: string; armband?: string }>;
  subtotal: number;
  discount?: number;
  total: number;
  paymentMethod: string;
}): string {
  const brandColor = '#2563eb';

  const entriesHtml = data.entries
    .map(
      e =>
        `<tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
        <strong>${escapeHtml(e.dogName)}</strong><br>
        <span style="color: #6b7280; font-size: 14px;">${escapeHtml(e.className)}</span>
      </td>
      ${e.armband ? `<td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; text-align: right; color: #6b7280; font-size: 14px;">#${escapeHtml(e.armband)}</td>` : '<td></td>'}
    </tr>`
    )
    .join('');

  const messageSection = data.confirmationMessage
    ? `
    <div style="background-color: #eff6ff; border-radius: 6px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #3b82f6;">
      <p style="margin: 0 0 4px; font-weight: 600; font-size: 14px; color: #1e40af;">From the show secretary</p>
      <p style="margin: 0; color: #1e3a5f; font-size: 14px; line-height: 22px;">${escapeHtml(data.confirmationMessage)}</p>
    </div>`
    : '';

  const discountRow =
    data.discount && data.discount > 0
      ? `
    <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
      <span style="color: #6b7280; font-size: 14px;">Discount</span>
      <span style="color: #059669; font-size: 14px;">-${formatCurrency(data.discount)}</span>
    </div>`
      : '';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden;">
    <div style="background-color: ${brandColor}; padding: 16px 24px;">
      <p style="color: #fff; font-size: 20px; font-weight: 600; margin: 0;">myK9Show</p>
    </div>
    <div style="padding: 32px 24px;">
      <h1 style="font-size: 24px; margin: 0 0 16px; color: #1a1a1e;">Registration Confirmed</h1>

      <div style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; text-align: center; margin-bottom: 24px;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Confirmation Number</p>
        <p style="margin: 4px 0 0; font-size: 20px; font-weight: 600; color: #059669; font-family: monospace;">${escapeHtml(data.confirmationNumber)}</p>
      </div>

      <p style="color: #1a1a1e; font-size: 16px;">Hi ${escapeHtml(data.firstName)}, your registration has been confirmed.</p>

      <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
        <p style="margin: 0; font-weight: 600; font-size: 18px; color: #1a1a1e;">${escapeHtml(data.showName)}</p>
        <p style="margin: 4px 0 0; color: #6b7280; font-size: 14px;">${escapeHtml(data.showDates)}</p>
        <p style="margin: 2px 0 0; color: #6b7280; font-size: 14px;">${escapeHtml(data.showLocation)}${data.showVenue ? ` · ${escapeHtml(data.showVenue)}` : ''}</p>
      </div>

      ${messageSection}

      <h2 style="font-size: 16px; margin: 24px 0 12px; color: #1a1a1e;">Your Entries</h2>
      <table style="width: 100%; border-collapse: collapse;">${entriesHtml}</table>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;">

      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #6b7280; font-size: 14px;">Subtotal</span>
        <span style="font-size: 14px;">${formatCurrency(data.subtotal)}</span>
      </div>
      ${discountRow}
      <div style="display: flex; justify-content: space-between; font-weight: 600; font-size: 18px; padding-top: 8px; border-top: 1px solid #e5e7eb;">
        <span>Total</span>
        <span>${formatCurrency(data.total)}</span>
      </div>
      <p style="color: #6b7280; font-size: 13px; margin-top: 4px;">${escapeHtml(data.paymentMethod)}</p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 16px;">
      <p style="color: #6b7280; font-size: 14px;">Questions? Contact the show secretary.</p>
    </div>
    <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} myK9Show. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { registrationId } = await req.json();

    if (!registrationId) {
      return new Response(JSON.stringify({ error: 'registrationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: 'Email service not configured' }), {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch registration with related data
    const { data: registration, error: regError } = await supabase
      .from('registrations')
      .select(
        '*, show:shows(name, start_date, end_date, location, venue_name, confirmation_message), person:people(first_name, last_name, email)'
      )
      .eq('id', registrationId)
      .single();

    if (regError || !registration) {
      return new Response(JSON.stringify({ error: 'Registration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch entries for this registration
    const { data: entries } = await supabase
      .from('entries')
      .select('armband_number, dog:dogs(call_name), class:classes(name)')
      .eq('registration_id', registrationId);

    const recipientEmail = registration.person?.email;
    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: 'No email address for registrant' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const show = registration.show;
    const html = buildRegistrationEmailHtml({
      firstName: registration.person?.first_name || 'there',
      confirmationNumber:
        registration.confirmation_number || registrationId.slice(0, 8).toUpperCase(),
      showName: show?.name || 'Dog Show',
      showDates: `${show?.start_date || ''} — ${show?.end_date || ''}`,
      showLocation: show?.location || '',
      showVenue: show?.venue_name,
      confirmationMessage: show?.confirmation_message,
      entries: (entries || []).map(e => ({
        dogName: e.dog?.call_name || 'Unknown',
        className: e.class?.name || 'Unknown',
        armband: e.armband_number,
      })),
      subtotal: registration.total_amount || 0,
      discount: registration.discount_amount,
      total: registration.total_amount || 0,
      paymentMethod: registration.payment_method || 'Payment on file',
    });

    // Send via Resend with idempotency key
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resendApiKey}`,
        'Idempotency-Key': registrationId,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: recipientEmail,
        subject: `Registration Confirmed — ${registration.confirmation_number || 'myK9Show'}`,
        html,
      }),
    });

    let resendMessageId: string | undefined;
    let sendStatus = 'sent';
    let errorMessage: string | undefined;

    if (response.ok) {
      const result = await response.json();
      resendMessageId = result.id;
      console.log(`Registration email sent: ${result.id} to ${recipientEmail}`);
    } else {
      const err = await response.json();
      sendStatus = 'failed';
      errorMessage = JSON.stringify(err);
      console.error('Resend API error:', err);
    }

    // Write email_log
    const { data: logRow } = await supabase
      .from('email_log')
      .insert({
        recipient_email: recipientEmail,
        email_type: 'registration_confirmation',
        related_id: registrationId,
        resend_message_id: resendMessageId,
        status: sendStatus,
        error_message: errorMessage,
      })
      .select('id')
      .single();

    return new Response(
      JSON.stringify({
        success: sendStatus === 'sent',
        emailLogId: logRow?.id,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    console.error('send-registration-email error:', err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy send-registration-email`
Note: Deployed with JWT verification (called from authenticated app). The Supabase client automatically sends the user's JWT in the Authorization header.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-registration-email/
git commit -m "feat(email): add send-registration-email Edge Function with idempotency"
```

### Task 9: `resend-webhook` Edge Function

**Files:**

- Create: `supabase/functions/resend-webhook/index.ts`

- [ ] **Step 1: Write the Edge Function**

```typescript
// supabase/functions/resend-webhook/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');

// Map Resend event types to our status values
const STATUS_MAP: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.bounced': 'bounced',
  'email.delivery_delayed': 'sent', // keep as sent, just log delay
  'email.complained': 'complained',
};

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify webhook signature (Svix)
    if (webhookSecret) {
      const svixId = req.headers.get('svix-id');
      const svixTimestamp = req.headers.get('svix-timestamp');
      const svixSignature = req.headers.get('svix-signature');

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.error('Missing Svix headers');
        return new Response('Missing signature headers', { status: 401 });
      }

      // Basic timestamp validation (within 5 minutes)
      const timestampSeconds = parseInt(svixTimestamp, 10);
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - timestampSeconds) > 300) {
        console.error('Webhook timestamp too old');
        return new Response('Timestamp too old', { status: 401 });
      }

      // Verify HMAC signature
      const body = await req.text();
      const signaturePayload = `${svixId}.${svixTimestamp}.${body}`;
      const secretBytes = Uint8Array.from(atob(webhookSecret.replace('whsec_', '')), c =>
        c.charCodeAt(0)
      );

      const key = await crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(signaturePayload)
      );
      const expectedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

      // Svix sends multiple signatures separated by spaces, each prefixed with "v1,"
      const signatures = svixSignature.split(' ').map(s => s.replace('v1,', ''));
      if (!signatures.includes(expectedSig)) {
        console.error('Invalid webhook signature');
        return new Response('Invalid signature', { status: 401 });
      }

      // Parse the verified body
      const event = JSON.parse(body);
      return await handleEvent(event);
    } else {
      // No secret configured — accept but log warning
      console.warn('RESEND_WEBHOOK_SECRET not set — skipping signature verification');
      const event = await req.json();
      return await handleEvent(event);
    }
  } catch (err) {
    console.error('resend-webhook error:', err);
    return new Response('Internal error', { status: 500 });
  }
});

async function handleEvent(event: {
  type: string;
  data: { email_id: string; bounce_type?: string; error?: { message?: string } };
}) {
  const newStatus = STATUS_MAP[event.type];
  if (!newStatus) {
    // Unknown event type — acknowledge but don't process
    return new Response('OK', { status: 200 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const errorMessage =
    event.type === 'email.bounced'
      ? `${event.data.bounce_type || 'unknown'}: ${event.data.error?.message || ''}`
      : undefined;

  const { error } = await supabase
    .from('email_log')
    .update({
      status: newStatus,
      status_updated_at: new Date().toISOString(),
      error_message: errorMessage,
    })
    .eq('resend_message_id', event.data.email_id);

  if (error) {
    console.error('Failed to update email_log:', error);
  }

  return new Response('OK', { status: 200 });
}
```

- [ ] **Step 2: Deploy**

Run: `supabase functions deploy resend-webhook --no-verify-jwt`

- [ ] **Step 3: Set webhook secret**

Run: `supabase secrets set RESEND_WEBHOOK_SECRET=<secret>`
Note: User gets this from Resend dashboard after configuring the webhook endpoint.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/resend-webhook/
git commit -m "feat(email): add resend-webhook Edge Function for delivery tracking"
```

### Task 9b: Edge Function Tests [ADDED]

**Files:**

- Create: `supabase/functions/send-auth-email/index.test.ts`
- Create: `supabase/functions/resend-webhook/index.test.ts`

Note: Deno Edge Functions don't have a standard test runner in this project. These tests document expected behavior and can be run manually or added to CI later. For now, write them as documentation of the expected contract.

- [ ] **Step 1: Document send-auth-email test cases**

Create `supabase/functions/send-auth-email/README.md` with test scenarios:

```markdown
## Test Scenarios

1. **Happy path (signup):** Receives signup payload → calls Resend API → writes email_log with status "sent" → returns `{ success: true }`
2. **Happy path (recovery):** Receives recovery payload → sends reset email → writes email_log → returns `{ success: true }`
3. **Resend API failure:** Resend returns 500 → writes email_log with status "failed" and error_message → still returns `{ success: true }`
4. **Missing RESEND_API_KEY:** No API key configured → writes email_log with status "failed" → returns `{ success: true }`
5. **Network error:** fetch throws → writes email_log with status "failed" → returns `{ success: true }`
6. **XSS in firstName:** user_metadata.first_name contains `<script>` → escapeHtml sanitizes it
7. **Magic link type:** email_action_type is "magiclink" → uses "Sign in to myK9Show" copy
```

- [ ] **Step 2: Document resend-webhook test cases**

Create `supabase/functions/resend-webhook/README.md` with test scenarios:

```markdown
## Test Scenarios

1. **Valid delivery event:** Receives `email.delivered` with valid Svix signature → updates email_log status to "delivered"
2. **Valid bounce event:** Receives `email.bounced` → updates status to "bounced" with error_message
3. **Invalid signature:** Wrong Svix signature → returns 401
4. **Missing signature headers:** No svix-id/timestamp/signature → returns 401
5. **Stale timestamp:** svix-timestamp > 5 minutes old → returns 401
6. **Unknown event type:** Receives unrecognized event → returns 200 (acknowledged, not processed)
7. **No webhook secret configured:** RESEND_WEBHOOK_SECRET not set → logs warning, processes event anyway
8. **Non-POST method:** GET request → returns 405
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-auth-email/README.md supabase/functions/resend-webhook/README.md
git commit -m "docs(email): add Edge Function test scenario documentation"
```

---

## Chunk 4: App Integration + Secretary UI

### Task 10: Wire Registration Email Sending

**Files:**

- Modify: `apps/myk9show/src/store/showRegistrationStore.ts`

- [ ] **Step 1: Add email send call after confirmRegistration**

In `showRegistrationStore.ts`, after the `confirmRegistration` method successfully creates a DB registration, add:

```typescript
// Fire-and-forget: send confirmation email
if (dbRegistrationId) {
  supabase.functions
    .invoke('send-registration-email', {
      body: { registrationId: dbRegistrationId },
    })
    .catch(err => {
      logger.error('[confirmRegistration] Failed to send confirmation email:', err);
    });
}
```

Add this after the `try/catch` block that creates the DB registration, before updating local state.

- [ ] **Step 2: Run existing tests**

Run: `cd apps/myk9show && pnpm test -- --run`
Expected: All existing tests pass (the email call is fire-and-forget, won't affect test behavior).

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/store/showRegistrationStore.ts
git commit -m "feat(email): send registration confirmation email after successful registration"
```

### Task 11: Add `confirmation_message` to Show Forms

**Files:**

- Modify: `apps/myk9show/src/services/mappers/showMappers.ts`
- Modify: `apps/myk9show/src/components/panels/edit/ShowEditForm.tsx` or `ShowEditBasicInfoTab.tsx`
- Modify: `apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx`
- Modify: `apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx`

- [ ] **Step 1: Update show mappers**

Add `confirmation_message` (DB) ↔ `confirmationMessage` (UI) mapping in `showMappers.ts`. Check existing mapper pattern — likely `rowToShow()` and `toSupabaseRow()`.

- [ ] **Step 2: Add textarea to show edit form**

Add to the appropriate tab of the show edit form:

```tsx
<div className="space-y-2">
  <label htmlFor="confirmationMessage" className="text-sm font-medium">
    Confirmation Message
  </label>
  <textarea
    id="confirmationMessage"
    value={formData.confirmationMessage || ''}
    onChange={e => handleChange('confirmationMessage', e.target.value)}
    placeholder="Optional message included in registration confirmation emails (e.g., parking info, what to bring)"
    className="w-full min-h-[80px] p-2 border border-input rounded-md bg-background text-foreground text-sm"
    rows={3}
  />
  <p className="text-xs text-muted-foreground">
    This message will be included in registration confirmation emails sent to exhibitors.
  </p>
</div>
```

- [ ] **Step 3: Add confirmation message to EditShowDialog**

In `EditShowDialog.tsx`, add the same textarea field to the dialog form. Follow the existing pattern for how form fields are rendered in the dialog — read the file first to match the style.

- [ ] **Step 4: Add confirmation message to Show Creation Wizard ReviewStep**

In `ShowCreationWizardPage.tsx`, display the `confirmationMessage` in the ReviewStep summary (read-only). Follow the existing pattern for how other show fields are displayed in the review step.

- [ ] **Step 5: Run quality gate**

Run: `pnpm typecheck && pnpm lint`
Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/services/mappers/showMappers.ts apps/myk9show/src/components/panels/edit/ apps/myk9show/src/components/shows/ShowDetails/dialogs/EditShowDialog.tsx apps/myk9show/src/pages/secretary/ShowCreationWizardPage.tsx
git commit -m "feat(email): add confirmation_message field to show edit forms, dialog, and wizard"
```

### Task 12: Email Status Icons for Secretary UI

**Files:**

- Create: `apps/myk9show/src/components/entries/EmailStatusIcon.tsx`
- Create: `apps/myk9show/src/hooks/useEmailStatus.ts`
- Create: `apps/myk9show/src/test/components/EmailStatusIcon.test.tsx`

- [ ] **Step 1: Write tests for EmailStatusIcon**

```tsx
// apps/myk9show/src/test/components/EmailStatusIcon.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmailStatusIcon } from '@/components/entries/EmailStatusIcon';

describe('EmailStatusIcon', () => {
  it('renders nothing when status is undefined', () => {
    const { container } = render(<EmailStatusIcon status={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders green checkmark for delivered', () => {
    render(<EmailStatusIcon status="delivered" />);
    expect(screen.getByTitle('Email delivered')).toBeInTheDocument();
  });

  it('renders yellow clock for sent', () => {
    render(<EmailStatusIcon status="sent" />);
    expect(screen.getByTitle('Email sent, awaiting delivery')).toBeInTheDocument();
  });

  it('renders red warning for bounced', () => {
    render(<EmailStatusIcon status="bounced" />);
    expect(screen.getByTitle(/bounced/i)).toBeInTheDocument();
  });

  it('renders red warning for failed with error tooltip', () => {
    render(<EmailStatusIcon status="failed" errorMessage="Invalid address" />);
    expect(screen.getByTitle(/failed.*invalid address/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm test -- --run src/test/components/EmailStatusIcon.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write EmailStatusIcon**

```tsx
// apps/myk9show/src/components/entries/EmailStatusIcon.tsx
import { CheckCircle, Clock, AlertTriangle } from 'lucide-react';

interface EmailStatusIconProps {
  status: string | undefined;
  errorMessage?: string;
}

export function EmailStatusIcon({ status, errorMessage }: EmailStatusIconProps) {
  if (!status) return null;

  switch (status) {
    case 'delivered':
      return <CheckCircle className="h-4 w-4 text-green-500" title="Email delivered" />;
    case 'sent':
      return <Clock className="h-4 w-4 text-yellow-500" title="Email sent, awaiting delivery" />;
    case 'bounced':
      return (
        <AlertTriangle
          className="h-4 w-4 text-red-500"
          title={`Email bounced${errorMessage ? `: ${errorMessage}` : ''}`}
        />
      );
    case 'failed':
      return (
        <AlertTriangle
          className="h-4 w-4 text-red-500"
          title={`Email failed${errorMessage ? `: ${errorMessage}` : ''}`}
        />
      );
    case 'complained':
      return <AlertTriangle className="h-4 w-4 text-orange-500" title="Recipient marked as spam" />;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Write useEmailStatus hook**

```typescript
// apps/myk9show/src/hooks/useEmailStatus.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface EmailLogEntry {
  id: string;
  related_id: string;
  status: string;
  error_message?: string;
  created_at: string;
}

export function useEmailStatus(registrationIds: string[]) {
  return useQuery({
    queryKey: ['email-status', registrationIds],
    queryFn: async () => {
      if (registrationIds.length === 0) return {};

      const { data, error } = await supabase
        .from('email_log')
        .select('id, related_id, status, error_message, created_at')
        .in('related_id', registrationIds)
        .eq('email_type', 'registration_confirmation')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by related_id, take most recent
      const statusMap: Record<string, EmailLogEntry> = {};
      for (const row of data || []) {
        if (!statusMap[row.related_id]) {
          statusMap[row.related_id] = row;
        }
      }
      return statusMap;
    },
    enabled: registrationIds.length > 0,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm test -- --run src/test/components/EmailStatusIcon.test.tsx`
Expected: All 5 tests pass.

- [ ] **Step 6: Run full quality gate**

Run: `pnpm typecheck && pnpm lint`
Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/entries/EmailStatusIcon.tsx apps/myk9show/src/hooks/useEmailStatus.ts apps/myk9show/src/test/components/EmailStatusIcon.test.tsx
git commit -m "feat(email): add EmailStatusIcon and useEmailStatus for secretary delivery tracking"
```

### Task 13: Integrate Email Status into Entry Management + Resend Button

**Files:**

- Modify: Entry management page(s) where secretary views entries for a show
- Modify: `apps/myk9show/src/components/entries/EmailStatusIcon.tsx` (add resend button)

- [ ] **Step 1: Identify entry list component**

Search for the entry management page/component that renders the list of entries for a show. This is where the secretary views registrations. Read it to understand the existing table/list structure.

- [ ] **Step 2: Add email status column to entries list**

Import `useEmailStatus` and `EmailStatusIcon`. Collect all `registrationId`s from the entries, pass to `useEmailStatus`, and render `EmailStatusIcon` next to each entry row.

- [ ] **Step 3: Add "Resend" button for bounced/failed entries**

Update `EmailStatusIcon` to accept an optional `onResend` callback. When status is `bounced` or `failed`, render a "Resend" button:

```tsx
interface EmailStatusIconProps {
  status: string | undefined;
  errorMessage?: string;
  onResend?: () => void;
  resendDisabled?: boolean;
}
```

In the parent component, wire `onResend` to call `supabase.functions.invoke('send-registration-email', { body: { registrationId } })` and implement a 60-second cooldown using local state:

```typescript
const [resendCooldowns, setResendCooldowns] = useState<Record<string, number>>({});

const handleResend = (registrationId: string) => {
  setResendCooldowns(prev => ({ ...prev, [registrationId]: Date.now() + 60_000 }));
  supabase.functions.invoke('send-registration-email', { body: { registrationId } });
};

const isResendDisabled = (registrationId: string) =>
  (resendCooldowns[registrationId] || 0) > Date.now();
```

- [ ] **Step 4: Add email status filter (optional column)**

Add an "Email Status" filter option to the entries list with options: All / Delivered / Pending / Failed. Filter entries client-side based on `useEmailStatus` results.

- [ ] **Step 5: Run quality gate**

Run: `pnpm typecheck && pnpm lint`
Expected: Zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/entries/ apps/myk9show/src/hooks/useEmailStatus.ts
git commit -m "feat(email): integrate email status into entry management with resend button"
```

---

## Chunk 5: Manual Configuration + Final Integration

### Task 14: Supabase Dashboard Configuration

These are manual steps the user performs in the Supabase dashboard.

- [ ] **Step 1: Set Site URL**

Go to Supabase Dashboard > Authentication > URL Configuration:

- Set `Site URL` to `https://myk9-platform-myk9show.vercel.app`
- Add `http://localhost:5173` and `http://localhost:5174` to Redirect URLs

- [ ] **Step 2: Configure Auth Hook**

Go to Supabase Dashboard > Authentication > Hooks:

- Enable "Send Email" hook
- Point to: `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/send-auth-email`

- [ ] **Step 3: Verify Edge Function secrets are set**

Run: `supabase secrets list`
Expected: `RESEND_API_KEY`, `SITE_URL` visible (plus existing secrets).

### Task 15: Resend Dashboard Configuration

Manual steps in Resend dashboard.

- [ ] **Step 1: Add and verify domain**

Go to Resend Dashboard > Domains:

- Add `myk9show.com`
- Add DNS records (SPF, DKIM, DMARC) to domain registrar
- Wait for verification (can take minutes to hours)

- [ ] **Step 2: Configure webhook**

Go to Resend Dashboard > Webhooks:

- Endpoint URL: `https://sojmvhhwsjxmfistvzbe.supabase.co/functions/v1/resend-webhook`
- Events: `email.delivered`, `email.bounced`, `email.delivery_delayed`, `email.complained`
- Copy the signing secret

- [ ] **Step 3: Set webhook secret**

Run: `supabase secrets set RESEND_WEBHOOK_SECRET=<secret from step 2>`

### Task 16: End-to-End Verification

- [ ] **Step 1: Test signup confirmation flow**

1. Go to staging: `https://myk9-platform-myk9show.vercel.app/sign-up`
2. Create a new test account
3. Check email — should receive branded confirmation email from `noreply@myk9show.com`
4. Click "Confirm Email" button
5. Should land on home page, logged in (not a 404)

- [ ] **Step 2: Test password reset flow**

1. Go to `/forgot-password`
2. Enter the test email
3. Check email — should receive branded reset email
4. Click "Reset Password" button
5. Should land on `/reset-password` with password form
6. Enter new password → success message

- [ ] **Step 3: Test registration confirmation email**

1. Register for a show as the test user
2. Complete payment
3. Check email — should receive registration confirmation with show details, entries, payment summary
4. If show has a `confirmation_message`, verify it appears in the email

- [ ] **Step 4: Verify delivery tracking**

1. Check Supabase `email_log` table — should have rows for all emails sent
2. After a few minutes, webhook should update status to `delivered`

- [ ] **Step 5: Final commit — update TO-DOS.md**

Mark the Resend email integration todo as complete in `TO-DOS.md`.

```bash
git add TO-DOS.md
git commit -m "docs: mark Resend email integration as complete"
```
