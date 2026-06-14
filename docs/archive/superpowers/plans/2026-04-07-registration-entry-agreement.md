# Registration Entry Agreement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a required organization entry agreement checkbox to the registration workflow PaymentStep, with agreement text stored per organization in a new database table.

**Architecture:** New `organization_agreements` table stores one agreement text per sanctioning org (AKC, UKC, etc.). A React Query hook fetches the agreement by org name. An `EntryAgreementSection` component renders a collapsible text block with a required checkbox that gates the submit button in PaymentStep.

**Tech Stack:** Supabase (migration + RLS), React Query, shadcn Collapsible, Vitest + Testing Library

---

## File Structure

| Action | File                                                                                                           | Responsibility                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Create | `supabase/migrations/122_organization_agreements.sql`                                                          | Table, RLS, AKC seed data                                                  |
| Modify | `apps/myk9show/src/lib/queryClient.ts`                                                                         | Add `organizationAgreement` query key                                      |
| Create | `apps/myk9show/src/hooks/queries/useOrganizationAgreement.ts`                                                  | React Query hook to fetch agreement text                                   |
| Create | `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/EntryAgreementSection.tsx`                | Collapsible agreement + checkbox component                                 |
| Modify | `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`                                 | Add `EntryAgreementSectionProps` interface                                 |
| Modify | `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx`                                | Integrate `EntryAgreementSection`, lift checkbox state                     |
| Modify | `apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx`                              | Pass `onAgreementChange` + `agreedToEntryAgreement` through to PaymentStep |
| Modify | `apps/myk9show/src/pages/RegistrationWizardPage.tsx`                                                           | Add `agreedToEntryAgreement` state, wire into submit gate                  |
| Create | `apps/myk9show/src/hooks/queries/__tests__/useOrganizationAgreement.test.ts`                                   | Hook unit tests                                                            |
| Create | `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/EntryAgreementSection.test.tsx` | Component unit tests                                                       |
| Create | `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentStep.agreement.test.tsx` | Integration tests for submit gating                                        |

---

### Task 1: Database Migration

**Files:**

- Create: `supabase/migrations/122_organization_agreements.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Organization Entry Agreements
-- Each sanctioning organization (AKC, UKC, NACSW, etc.) has a standard entry
-- agreement that exhibitors must accept when registering for a show.

CREATE TABLE organization_agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization TEXT NOT NULL UNIQUE,
  agreement_text TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE organization_agreements ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read agreements (needed during registration)
CREATE POLICY "organization_agreements_select" ON organization_agreements
  FOR SELECT TO authenticated
  USING (true);

-- Only site admins can modify agreements
CREATE POLICY "organization_agreements_insert" ON organization_agreements
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT is_platform_admin()));

CREATE POLICY "organization_agreements_update" ON organization_agreements
  FOR UPDATE TO authenticated
  USING ((SELECT is_platform_admin()));

CREATE POLICY "organization_agreements_delete" ON organization_agreements
  FOR DELETE TO authenticated
  USING ((SELECT is_platform_admin()));

-- Seed AKC Scent Work entry agreement
INSERT INTO organization_agreements (organization, agreement_text) VALUES (
  'AKC',
  E'I certify that I am the actual owner of the dog, or that I am the duly authorized agent of the actual owner whose name I have entered.\n\nIn consideration of the acceptance of this entry, I (we) agree to abide by the rules and regulations of The American Kennel Club in effect at the time of this event, and any additional rules and regulations appearing in the premium list of this event and entry form and any decision made in accord with them. I (we) agree that the club holding this event has the right to refuse this entry for cause which the club shall deem sufficient. I (we) certify and represent that the dog entered is not a hazard to persons or other dogs.\n\nIn consideration of the acceptance of this entry and of the holding of this event and of the opportunity to have the dog judged and to win prizes, ribbons, or trophies, I (we) agree to hold the AKC, the event-giving club, their members, directors, governors, officers, agents, superintendents or event secretary and the owner and/or lessor of the premises and any provider of services that are necessary to hold this event and any employees or volunteers of the aforementioned parties, and any AKC approved judge, judging at this event, harmless from any claim for loss or injury which may be alleged to have been caused directly or indirectly to any person or thing by the act of this dog while in or about the event premises or grounds or near any entrance thereto, and I (we) personally assume all responsibility and liability for any such claim; and I (we) further agree to hold the aforementioned parties harmless from any claim of loss, injury or damage to this dog.\n\nAdditionally, I (we) hereby assume the sole responsibility for and agree to indemnify, defend and save the aforementioned parties harmless from any and all loss and expense (including legal fees) by reason of the liability imposed by law upon any of the aforementioned parties for damage because of bodily injuries, including death at any time resulting therefrom, sustained by any person or persons, including myself (ourselves), or on account of damage to property, arising out of or in consequence of my (our) participation in this event, however such injuries, death or property damage may be caused, and whether or not the same may have been caused or may be alleged to have been caused by the negligence of the aforementioned parties or any of their employees, agents, or any other person.\n\nI (we) agree that the determination of whether the injury is serious shall be made by the event veterinarian and is binding on me (us).\n\nI (WE) AGREE THAT ANY CAUSE OF ACTION, CONTROVERSY OR CLAIM ARISING OUT OF OR RELATED TO THE ENTRY, EXHIBITION OR ATTENDANCE AT THE EVENT BETWEEN THE AKC AND THE EVENT-GIVING CLUB (UNLESS OTHERWISE STATED IN THIS PREMIUM LIST) AND MYSELF (OURSELVES) OR AS TO THE CONSTRUCTION, INTERPRETATION AND EFFECT OF THIS AGREEMENT SHALL BE SETTLED BY ARBITRATION PURSUANT TO THE APPLICABLE RULES OF THE AMERICAN ARBITRATION ASSOCIATION. HOWEVER, PRIOR TO ARBITRATION ALL APPLICABLE AKC BYLAWS, RULES, REGULATIONS, AND PROCEDURES MUST FIRST BE FOLLOWED AS SET FORTH IN THE AKC CHARTER AND BYLAWS, RULES, REGULATIONS, PUBLISHED POLICIES AND GUIDELINES.'
);
```

- [ ] **Step 2: Push migration to Supabase**

Run: `cd supabase && supabase db push` (enter password from `supabase/.env`)

Expected: Migration 122 applied successfully.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/122_organization_agreements.sql
git commit -m "feat: add organization_agreements table with AKC seed data (migration 122)"
```

---

### Task 2: Query Key and React Query Hook

**Files:**

- Modify: `apps/myk9show/src/lib/queryClient.ts:264-267` (add query key near Reports section)
- Create: `apps/myk9show/src/hooks/queries/useOrganizationAgreement.ts`
- Create: `apps/myk9show/src/hooks/queries/__tests__/useOrganizationAgreement.test.ts`

- [ ] **Step 1: Add query key to queryClient.ts**

In `apps/myk9show/src/lib/queryClient.ts`, add after the `reportData` entry (line 266) and before the closing `} as const;` (line 267):

```typescript
  // Organization Agreements
  organizationAgreement: (org: string) => ['organization-agreements', org] as const,
```

- [ ] **Step 2: Write the failing hook test**

Create `apps/myk9show/src/hooks/queries/__tests__/useOrganizationAgreement.test.ts`:

```typescript
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOrganizationAgreement } from '../useOrganizationAgreement';

// [EXPANDED] testUtils exports createTestQueryClient but not a wrapper component.
// Build an inline wrapper for renderHook.
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

// Mock supabase
vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

import { supabase } from '@/services/database/supabaseClient';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;

describe('useOrganizationAgreement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns agreement text for a valid organization', async () => {
    const mockAgreement = {
      organization: 'AKC',
      agreement_text: 'I certify that I am the actual owner...',
    };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockAgreement, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrganizationAgreement('AKC'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.agreement_text).toBe('I certify that I am the actual owner...');
    expect(mockFrom).toHaveBeenCalledWith('organization_agreements');
  });

  it('is disabled when organization is empty', () => {
    const { result } = renderHook(() => useOrganizationAgreement(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.isFetching).toBe(false);
  });

  it('returns error when query fails', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'Not found', code: 'PGRST116' },
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useOrganizationAgreement('UNKNOWN'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useOrganizationAgreement.test.ts`

Expected: FAIL — module `../useOrganizationAgreement` not found.

- [ ] **Step 4: Write the hook implementation**

Create `apps/myk9show/src/hooks/queries/useOrganizationAgreement.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/database/supabaseClient';
import { queryKeys, cacheStrategies } from '@/lib/queryClient';

interface OrganizationAgreement {
  organization: string;
  agreement_text: string;
}

export const useOrganizationAgreement = (organization: string) => {
  return useQuery({
    queryKey: queryKeys.organizationAgreement(organization),
    queryFn: async (): Promise<OrganizationAgreement> => {
      const { data, error } = await supabase
        .from('organization_agreements')
        .select('organization, agreement_text')
        .eq('organization', organization)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!organization,
    ...cacheStrategies.static,
  });
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/hooks/queries/__tests__/useOrganizationAgreement.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/lib/queryClient.ts apps/myk9show/src/hooks/queries/useOrganizationAgreement.ts apps/myk9show/src/hooks/queries/__tests__/useOrganizationAgreement.test.ts
git commit -m "feat: add useOrganizationAgreement hook with query key and tests"
```

---

### Task 3: EntryAgreementSection Component

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`
- Create: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/EntryAgreementSection.tsx`
- Create: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/EntryAgreementSection.test.tsx`

- [ ] **Step 1: Add props interface to types.ts**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`, add at the end of the file (before the closing):

```typescript
/** Props for the EntryAgreementSection sub-component. */
export interface EntryAgreementSectionProps {
  organization: string;
  agreed: boolean;
  onAgree: (agreed: boolean) => void;
}
```

- [ ] **Step 2: Write the failing component test**

Create `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/EntryAgreementSection.test.tsx`:

```typescript
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntryAgreementSection } from '../EntryAgreementSection';

// Mock the hook
vi.mock('@/hooks/queries/useOrganizationAgreement', () => ({
  useOrganizationAgreement: vi.fn(),
}));

import { useOrganizationAgreement } from '@/hooks/queries/useOrganizationAgreement';

const mockHook = useOrganizationAgreement as ReturnType<typeof vi.fn>;

const baseProps = {
  organization: 'AKC',
  agreed: false,
  onAgree: vi.fn(),
};

describe('EntryAgreementSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.mockReturnValue({
      data: { organization: 'AKC', agreement_text: 'I certify that I am the actual owner of the dog...' },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('renders collapsible with org name in header', () => {
    render(<EntryAgreementSection {...baseProps} />);
    expect(screen.getByText('AKC Entry Agreement')).toBeInTheDocument();
  });

  it('shows agreement text when expanded', async () => {
    const user = userEvent.setup();
    render(<EntryAgreementSection {...baseProps} />);

    // Click to expand
    await user.click(screen.getByText('AKC Entry Agreement'));

    expect(screen.getByText(/I certify that I am the actual owner/)).toBeInTheDocument();
  });

  it('checkbox is always visible regardless of collapsed state', () => {
    render(<EntryAgreementSection {...baseProps} />);
    expect(
      screen.getByLabelText(/I have read and agree to the AKC entry agreement/)
    ).toBeInTheDocument();
  });

  it('checkbox is unchecked by default', () => {
    render(<EntryAgreementSection {...baseProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('calls onAgree callback when checkbox toggled', async () => {
    const user = userEvent.setup();
    const onAgree = vi.fn();
    render(<EntryAgreementSection {...baseProps} onAgree={onAgree} />);

    await user.click(screen.getByRole('checkbox'));
    expect(onAgree).toHaveBeenCalledWith(true);
  });

  it('shows skeleton when loading', () => {
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    render(<EntryAgreementSection {...baseProps} />);
    expect(screen.getByTestId('agreement-skeleton')).toBeInTheDocument();
  });

  it('shows error message with retry when query fails', async () => {
    const refetch = vi.fn();
    mockHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    const user = userEvent.setup();
    render(<EntryAgreementSection {...baseProps} />);

    expect(screen.getByText(/Failed to load entry agreement/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/EntryAgreementSection.test.tsx`

Expected: FAIL — module `../EntryAgreementSection` not found.

- [ ] **Step 4: Write the component implementation**

Create `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/EntryAgreementSection.tsx`:

```tsx
import React from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useOrganizationAgreement } from '@/hooks/queries/useOrganizationAgreement';
import type { EntryAgreementSectionProps } from './types';

export const EntryAgreementSection: React.FC<EntryAgreementSectionProps> = ({
  organization,
  agreed,
  onAgree,
}) => {
  const { data, isLoading, isError, refetch } = useOrganizationAgreement(organization);

  if (isLoading) {
    return (
      <div className="space-y-3" data-testid="agreement-skeleton">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 flex items-center gap-3">
        <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
        <div className="flex-1">
          <p className="text-sm text-destructive">Failed to load entry agreement.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/50 px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
          <span>{organization} Entry Agreement</span>
          <ChevronDown className="h-4 w-4 transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 max-h-[300px] overflow-y-auto rounded-md border bg-background p-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
            {data.agreement_text}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => onAgree(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-input text-primary focus:ring-ring"
          aria-label={`I have read and agree to the ${organization} entry agreement above.`}
        />
        <span className="text-sm text-muted-foreground">
          I have read and agree to the {organization} entry agreement above.
        </span>
      </label>
    </div>
  );
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/EntryAgreementSection.test.tsx`

Expected: 7 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/EntryAgreementSection.tsx apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/EntryAgreementSection.test.tsx
git commit -m "feat: add EntryAgreementSection component with collapsible agreement and checkbox"
```

---

### Task 4: Integrate Into PaymentStep and Wire Submit Gate

**Files:**

- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx`
- Modify: `apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx`
- Modify: `apps/myk9show/src/pages/RegistrationWizardPage.tsx`
- Create: `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentStep.agreement.test.tsx`

- [ ] **Step 1: Write the failing integration test**

Create `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentStep.agreement.test.tsx`:

```typescript
import { render, screen } from '@/test/utils/testUtils';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentStep } from '../index';

// Mock hooks used by PaymentStep
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({ dogs: [] }),
}));
vi.mock('@/hooks/useClassStoreCompat', () => ({
  useClassStoreCompat: () => ({ classes: [] }),
}));
vi.mock('@/store/showStore', () => ({
  useShowStore: () => ({
    shows: [
      {
        id: 'show-1',
        organization: 'AKC',
        acceptCheckPayments: true,
        acceptCashPayments: true,
      },
    ],
  }),
}));
vi.mock('@/hooks/useRegistrationPermissions', () => ({
  useRegistrationPermissions: () => ({}),
}));
vi.mock('@/hooks/queries/useOrganizationAgreement', () => ({
  useOrganizationAgreement: () => ({
    data: { organization: 'AKC', agreement_text: 'Test agreement text' },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

const baseProps = {
  selectedDogs: [],
  classSelections: [],
  paymentMethod: '' as const,
  onPaymentMethodChange: vi.fn(),
  showId: 'show-1',
};

describe('PaymentStep — entry agreement integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the EntryAgreementSection', () => {
    render(<PaymentStep {...baseProps} />);
    expect(screen.getByText('AKC Entry Agreement')).toBeInTheDocument();
  });

  it('renders the agreement checkbox', () => {
    render(<PaymentStep {...baseProps} />);
    expect(
      screen.getByLabelText(/I have read and agree to the AKC entry agreement/)
    ).toBeInTheDocument();
  });

  it('agreement checkbox is unchecked by default', () => {
    render(<PaymentStep {...baseProps} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('agreement checkbox can be toggled', async () => {
    const user = userEvent.setup();
    render(<PaymentStep {...baseProps} />);

    const checkbox = screen.getByRole('checkbox');
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  // [ADDED] Submit gate tests — spec requires verifying disabled state
  it('calls onAgreementChange when checkbox toggled (controlled mode)', async () => {
    const user = userEvent.setup();
    const onAgreementChange = vi.fn();
    render(
      <PaymentStep
        {...baseProps}
        agreedToEntryAgreement={false}
        onAgreementChange={onAgreementChange}
      />
    );

    await user.click(screen.getByRole('checkbox'));
    expect(onAgreementChange).toHaveBeenCalledWith(true);
  });

  // [ADDED] Verify agreement section renders when show has no organization
  it('does not render agreement section when show has no organization', () => {
    // Re-mock showStore with no organization
    vi.mocked(
      await import('@/store/showStore')
    ).useShowStore.mockReturnValue({
      shows: [{ id: 'show-1', acceptCheckPayments: true, acceptCashPayments: true }],
    } as ReturnType<typeof import('@/store/showStore').useShowStore>);

    render(<PaymentStep {...baseProps} />);
    expect(screen.queryByText(/Entry Agreement/)).not.toBeInTheDocument();
  });
});
```

> **Note to implementer:** The submit-disabled behavior is tested at the `RegistrationWizardPage` level via the `canProceed()` function, not at the PaymentStep component level. PaymentStep does not own a submit button — `WizardNavigation` does, and it is gated by `canProceed()` which now checks `agreedToEntryAgreement` (see Task 4, Step 7b). A full integration test of the wizard page with submit gating would require mocking the entire wizard state machine, which is out of scope for this unit test file. The `canProceed` logic change is verified via typecheck + manual smoke test (Task 5).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/myk9show && npx vitest run src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentStep.agreement.test.tsx`

Expected: FAIL — no `EntryAgreementSection` rendered in PaymentStep.

- [ ] **Step 3: Add `onAgreementChange` and `agreedToEntryAgreement` to PaymentStepProps**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts`, add two new props to the `PaymentStepProps` interface:

```typescript
  /** Callback when the entry agreement checkbox is toggled. */
  onAgreementChange?: ((agreed: boolean) => void) | undefined;
  /** Current state of the entry agreement checkbox. */
  agreedToEntryAgreement?: boolean | undefined;
```

- [ ] **Step 4: Integrate EntryAgreementSection into PaymentStep**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx`:

Add import at the top:

```typescript
import { EntryAgreementSection } from './EntryAgreementSection';
```

Add `onAgreementChange` and `agreedToEntryAgreement` to the destructured props:

```typescript
export const PaymentStep: React.FC<PaymentStepProps> = ({
  // ...existing props...
  onAgreementChange,
  agreedToEntryAgreement = false,
  showId,
}) => {
```

Add local state for standalone usage (when `onAgreementChange` is not provided):

```typescript
const [localAgreed, setLocalAgreed] = useState(false);
const agreed = onAgreementChange ? agreedToEntryAgreement : localAgreed;
const handleAgree = onAgreementChange ?? setLocalAgreed;
```

Add the `EntryAgreementSection` after `PaymentSummaryCard` and before the `Alert`:

```tsx
{
  /* Entry Agreement */
}
{
  show?.organization && (
    <EntryAgreementSection organization={show.organization} agreed={agreed} onAgree={handleAgree} />
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/myk9show && npx vitest run src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentStep.agreement.test.tsx`

Expected: 4 tests PASS.

- [ ] **Step 6: Wire agreement state through WorkflowStepContent**

In `apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx`, where `PaymentStep` is rendered (around line 151), add the two new props:

```tsx
<PaymentStep
  // ...existing props...
  agreedToEntryAgreement={agreedToEntryAgreement}
  onAgreementChange={onAgreementChange}
  showId={showId}
  registrationId={registrationId}
/>
```

Add `agreedToEntryAgreement` and `onAgreementChange` to the component's props interface and destructuring. These will be passed from the parent `RegistrationWizardPage`.

- [ ] **Step 7: Add agreement state to RegistrationWizardPage** `[EXPANDED]`

In `apps/myk9show/src/pages/RegistrationWizardPage.tsx`:

**7a.** Add state near the other useState declarations (around line 129):

```typescript
const [agreedToEntryAgreement, setAgreedToEntryAgreement] = useState(false);
```

**7b.** Wire into `canProceed()` — the `'payment'` case (line 316-317). Change:

```typescript
      case 'payment':
        return !!registrationData.paymentMethod;
```

to:

```typescript
      case 'payment':
        return !!registrationData.paymentMethod && agreedToEntryAgreement;
```

**7c.** Pass through to `WorkflowStepContent` (around line 630-665 where it's rendered):

```tsx
<WorkflowStepContent
  // ...existing props...
  agreedToEntryAgreement={agreedToEntryAgreement}
  onAgreementChange={setAgreedToEntryAgreement}
/>
```

**7d.** Reset when navigating away from payment step. In `handleBack` (line 458) and wherever `setCurrentStep` is called to move away from payment, add:

```typescript
const handleBack = () => {
  // Reset agreement when leaving payment step
  if (currentStepId === 'payment') {
    setAgreedToEntryAgreement(false);
  }
  setCurrentStep(prev => prev - 1);
};
```

Also in the `handleNext` success path (around line 437/455) where it advances past payment, the agreement should already have been checked (gated by `canProceed`), so no reset needed on forward navigation.

- [ ] **Step 8: Run full PaymentStep test suite**

Run: `cd apps/myk9show && npx vitest run src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/`

Expected: All tests PASS (existing PaymentMethodSelector tests + new agreement tests).

- [ ] **Step 9: Commit**

```bash
git add apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/types.ts apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/index.tsx apps/myk9show/src/components/shows/RegistrationWorkflow/WorkflowStepContent.tsx apps/myk9show/src/pages/RegistrationWizardPage.tsx apps/myk9show/src/components/shows/RegistrationWorkflow/PaymentStep/__tests__/PaymentStep.agreement.test.tsx
git commit -m "feat: integrate entry agreement into PaymentStep and wire submit gate"
```

---

### Task 5: Typecheck and Final Verification

**Files:** No new files — verification only.

- [ ] **Step 1: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`

Expected: No type errors. Fix any that appear (likely candidates: WorkflowStepContent props interface needs the two new fields).

- [ ] **Step 2: Run full test suite for myk9show**

Run: `cd apps/myk9show && pnpm test`

Expected: All tests pass. If any existing tests break due to the new required `EntryAgreementSection` rendering, update mocks to include `useOrganizationAgreement`.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: No lint errors.

- [ ] **Step 4: Fix any issues found in steps 1-3, then commit**

```bash
git add -A
git commit -m "fix: resolve typecheck and lint issues from entry agreement integration"
```

(Skip this commit if steps 1-3 passed cleanly.)

- [ ] **Step 5: Manual smoke test**

Run: `pnpm dev:show`

Navigate to a show → click Register → proceed to Payment step. Verify:

- Collapsible "AKC Entry Agreement" section appears below the payment summary
- Clicking the header expands the full agreement text
- Checkbox is visible and unchecked
- Submit/register button is disabled until checkbox is checked

---

### Task 6: Update TO-DOS.md

**Files:**

- Modify: `TO-DOS.md`

- [ ] **Step 1: Mark the todo as done**

In `TO-DOS.md`, update the "Agreement Checkbox in Enter Show Registration Wizard" section. Change the list item from `- **Add terms...` to `- [x] **Add terms & rules agreement checkbox before registration submission** — Done.` Add a brief summary of what was built.

- [ ] **Step 2: Commit**

```bash
git add TO-DOS.md
git commit -m "docs: mark registration entry agreement todo as done"
```
