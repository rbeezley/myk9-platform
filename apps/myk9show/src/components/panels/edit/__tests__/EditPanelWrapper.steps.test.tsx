/**
 * MYK9-931 (decision 13): an Add panel walks every tab. In create mode a panel
 * with tabs shows "Next: <tab>" on every tab but the last; only the last tab
 * shows "Add <Object>". Next is blocked, with a message, while the current tab
 * is missing a required field. Edit mode shows Save on every tab.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';
import { render } from '@/test/utils/testUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import { usePanelValidationNavigation, type FieldLocation } from '../usePanelValidationNavigation';

type Data = { name: string; phone: string; note: string };

const schema = z.object({
  name: z.string().min(1, 'Please enter a name'),
  phone: z.string().min(1, 'Please enter a phone number'),
  note: z.string(),
});

const TABS = [
  { value: 'basic', label: 'Basics' },
  { value: 'contact', label: 'Contact' },
  { value: 'extra', label: 'Extras' },
] as const;
type TabValue = (typeof TABS)[number]['value'];

const LOCATION: Record<string, FieldLocation<TabValue>> = {
  name: { tab: 'basic', elementId: 'name' },
  phone: { tab: 'contact', elementId: 'phone' },
  note: { tab: 'extra', elementId: 'note' },
};
const locate = (field: string) => LOCATION[field];

function Fields({ tab, onTab }: { tab: TabValue; onTab: (t: TabValue) => void }) {
  const { form } = useEditPanel<Data>();
  if (!form) return null;
  return (
    <Tabs value={tab} onValueChange={v => onTab(v as TabValue)}>
      <TabsList>
        {TABS.map(t => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="basic">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={form.data.name}
          onChange={e => form.setValue('name', e.target.value)}
        />
      </TabsContent>
      <TabsContent value="contact">
        <label htmlFor="phone">Phone</label>
        <input
          id="phone"
          value={form.data.phone}
          onChange={e => form.setValue('phone', e.target.value)}
        />
      </TabsContent>
      <TabsContent value="extra">
        <label htmlFor="note">Note</label>
        <input
          id="note"
          value={form.data.note}
          onChange={e => form.setValue('note', e.target.value)}
        />
      </TabsContent>
    </Tabs>
  );
}

function Harness({
  mode,
  onSave,
}: {
  mode: 'create' | 'edit';
  onSave: (data: Data) => Promise<void>;
}) {
  const { activeTab, setActiveTab, handleValidationFail } = usePanelValidationNavigation<TabValue>(
    'basic',
    locate
  );
  return (
    <EditPanelWrapper<Data>
      open
      onClose={() => {}}
      title="Thing"
      variant="dialog"
      initialData={
        mode === 'create' ? { name: '', phone: '', note: '' } : { name: 'Rex', phone: '1', note: '' }
      }
      schema={schema}
      onSave={onSave}
      forceHasChanges
      saveLabel={mode === 'create' ? 'Add Thing' : 'Save Changes'}
      onValidationFail={handleValidationFail}
      steps={{
        mode,
        tabs: TABS,
        activeTab,
        onTabChange: tab => setActiveTab(tab as TabValue),
        locate,
      }}
    >
      <Fields tab={activeTab} onTab={setActiveTab} />
    </EditPanelWrapper>
  );
}

const tab = (name: RegExp) => screen.getByRole('tab', { name });

describe('EditPanelWrapper steps — create mode', () => {
  it('shows Next on every tab but the last, and Add only on the last', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" onSave={vi.fn().mockResolvedValue(undefined)} />);

    expect(screen.getByRole('button', { name: 'Next: Contact' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Thing' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'Rex');
    await user.click(screen.getByRole('button', { name: 'Next: Contact' }));
    expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Next: Extras' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Thing' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Phone'), '555');
    await user.click(screen.getByRole('button', { name: 'Next: Extras' }));
    expect(tab(/^Extras/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: /Next:/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Thing' })).toBeInTheDocument();
  });

  it('blocks Next with a message while the current tab is missing a required field', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" onSave={vi.fn().mockResolvedValue(undefined)} />);

    await user.click(screen.getByRole('button', { name: 'Next: Contact' }));

    expect(tab(/^Basics/)).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('edit-panel-step-blocked')).toHaveTextContent(
      'Please enter a name'
    );
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'name'));

    // Fixing the field clears the message and Next now moves on.
    await user.type(screen.getByLabelText('Name'), 'Rex');
    expect(screen.queryByTestId('edit-panel-step-blocked')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next: Contact' }));
    expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true');
  });

  it('only checks the current tab: later tabs are not required to move on', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" onSave={vi.fn().mockResolvedValue(undefined)} />);
    await user.type(screen.getByLabelText('Name'), 'Rex');
    // Phone (next tab) is still blank, yet Next from Basics is allowed.
    await user.click(screen.getByRole('button', { name: 'Next: Contact' }));
    expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('edit-panel-step-blocked')).not.toBeInTheDocument();
  });

  it('keeps earlier and later tabs clickable', async () => {
    const user = userEvent.setup();
    render(<Harness mode="create" onSave={vi.fn().mockResolvedValue(undefined)} />);
    await user.type(screen.getByLabelText('Name'), 'Rex');
    await user.click(screen.getByRole('button', { name: 'Next: Contact' }));

    await user.click(tab(/^Basics/));
    expect(tab(/^Basics/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Next: Contact' })).toBeInTheDocument();

    await user.click(tab(/^Extras/));
    expect(tab(/^Extras/)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Add Thing' })).toBeInTheDocument();
  });

  it('a failed Add on the last tab still routes to the hidden tab with the error', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<Harness mode="create" onSave={onSave} />);
    await user.type(screen.getByLabelText('Name'), 'Rex');
    // Skip Contact by clicking the last tab directly, leaving phone blank.
    await user.click(tab(/^Extras/));
    await user.click(screen.getByRole('button', { name: 'Add Thing' }));

    await waitFor(() => expect(tab(/^Contact/)).toHaveAttribute('aria-selected', 'true'));
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'phone'));
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('EditPanelWrapper steps — required legend', () => {
  it('explains the required asterisk in create mode only', () => {
    const { unmount } = render(<Harness mode="create" onSave={vi.fn()} />);
    expect(screen.getByTestId('required-legend')).toHaveTextContent('Required');
    unmount();
    render(<Harness mode="edit" onSave={vi.fn()} />);
    expect(screen.queryByTestId('required-legend')).not.toBeInTheDocument();
  });
});

describe('EditPanelWrapper steps — edit mode', () => {
  it('shows Save on every tab and never Next', async () => {
    const user = userEvent.setup();
    render(<Harness mode="edit" onSave={vi.fn().mockResolvedValue(undefined)} />);
    for (const name of [/^Basics/, /^Contact/, /^Extras/]) {
      await user.click(tab(name));
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Next:/ })).not.toBeInTheDocument();
    }
  });
});
