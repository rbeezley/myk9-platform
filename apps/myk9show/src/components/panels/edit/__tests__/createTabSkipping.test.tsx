/**
 * MYK9-931 (Codex round 7, decision 13): an Add panel walks every tab. Clicking
 * the tab bar to jump ahead must not reach "Add <Object>" without passing the
 * per-tab check of every tab in between. Completed and earlier tabs stay
 * clickable; edit mode is unchanged.
 */
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import { UserEditPanel } from '../UserEditPanel';
import { ClubEditPanel } from '../ClubEditPanel';
import { AddDogPanel } from '../AddDogPanel';

vi.mock('@/hooks/useRBAC', () => ({ useRBAC: () => ({ hasPermission: () => false }) }));
vi.mock('@/services/database/users', async importOriginal => ({
  ...(await importOriginal<typeof import('@/services/database/users')>()),
  fetchPersonEmailLockFacts: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/hooks/useDogStoreCompat', () => ({
  useDogStoreCompat: () => ({
    addDog: vi.fn(),
    addDogOfflineFirst: vi.fn(),
    dogs: [],
    isLoading: false,
    error: null,
  }),
}));

const tab = (name: RegExp) => screen.getByRole('tab', { name });
const selected = (name: RegExp) => expect(tab(name)).toHaveAttribute('aria-selected', 'true');

describe('Add Person: no skipping ahead', () => {
  const renderPerson = () =>
    render(
      <UserEditPanel
        open
        onClose={() => {}}
        userId=""
        userName="New"
        initialUserData={{}}
        onSave={vi.fn()}
      />
    );

  it('clicking Contact without finishing Basic Info is blocked, with the Next message', async () => {
    const user = userEvent.setup();
    renderPerson();
    await user.click(await screen.findByRole('tab', { name: /^Contact/ }));

    selected(/^Basic Info/);
    expect(await screen.findByTestId('edit-panel-step-blocked')).toHaveTextContent(
      'Please enter a first name'
    );
    expect(screen.queryByRole('button', { name: 'Add Person' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'firstName'));
  });

  it('once Basic Info passes, going to Contact, back and forward again all work', async () => {
    const user = userEvent.setup();
    renderPerson();
    await user.type(await screen.findByLabelText(/First Name/), 'Pat');
    await user.type(screen.getByLabelText(/Last Name/), 'Paperform');
    await user.click(tab(/^Contact/));
    selected(/^Contact/);
    expect(screen.getByRole('button', { name: 'Add Person' })).toBeInTheDocument();

    await user.click(tab(/^Basic Info/));
    selected(/^Basic Info/);
    await user.click(tab(/^Contact/));
    selected(/^Contact/);
  });
});

describe('Add Club: no skipping ahead', () => {
  const renderClub = () =>
    render(
      <ClubEditPanel
        open
        onClose={() => {}}
        clubId=""
        clubName=""
        initialClubData={{}}
        mode="create"
        onSave={vi.fn()}
      />
    );

  it('Premium cannot be reached over an unfinished Basic Info or Contact', async () => {
    const user = userEvent.setup();
    renderClub();
    await user.click(await screen.findByRole('tab', { name: /^Premium/ }));
    selected(/^Basic Info/);
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Club' })).not.toBeInTheDocument();

    // Basic Info done, Contact still empty: the jump lands on Contact, not Premium.
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');
    await user.click(tab(/^Premium/));
    await waitFor(() => selected(/^Contact/));
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Club' })).not.toBeInTheDocument();
  });

  it('after the checks pass, Premium, back to Basic Info and forward again all work', async () => {
    const user = userEvent.setup();
    renderClub();
    await user.type(await screen.findByRole('textbox', { name: /Club Name/ }), 'Heartland');
    await user.click(screen.getByRole('button', { name: /Next: Contact/ }));
    await user.type(await screen.findByRole('textbox', { name: /Email Address/ }), 'c@example.com');
    await user.type(screen.getByRole('textbox', { name: /Phone Number/ }), '555-123-4567');
    await user.type(screen.getByRole('textbox', { name: /Street Address/ }), '1 Main St');
    await user.type(screen.getByRole('textbox', { name: /City/ }), 'Omaha');
    await user.type(screen.getByRole('textbox', { name: /State/ }), 'NE');
    await user.type(screen.getByRole('textbox', { name: /ZIP Code/ }), '68102');
    await user.click(screen.getByRole('button', { name: /Next: Premium/ }));
    selected(/^Premium/);

    await user.click(tab(/^Basic Info/));
    selected(/^Basic Info/);
    await user.click(tab(/^Premium/));
    selected(/^Premium/);
    expect(screen.getByRole('button', { name: 'Add Club' })).toBeInTheDocument();
  });
});

describe('Add Dog: no skipping ahead', () => {
  const renderDog = () =>
    render(<AddDogPanel open onClose={() => {}} onDogCreated={vi.fn()} currentUserPersonId="p1" />);

  it('Optional details cannot be reached over an unfinished Essential tab', async () => {
    const user = userEvent.setup();
    renderDog();
    await user.click(await screen.findByRole('tab', { name: /optional details/i }));
    selected(/essential/i);
    expect(await screen.findByTestId('edit-panel-step-blocked')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add Dog' })).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'callName'));
  });

  it('Registration is blocked too while Essential is unfinished, and opens once it passes', async () => {
    const user = userEvent.setup();
    renderDog();
    await user.click(await screen.findByRole('tab', { name: /registration/i }));
    selected(/essential/i);

    await user.type(screen.getByLabelText(/Call Name/i), 'Rex');
    await user.click(screen.getByRole('combobox', { name: /^Sex/ }));
    await user.click(await screen.findByRole('option', { name: /^Male/ }));
    await user.type(screen.getByLabelText(/Date of Birth/), '2020-06-15');
    await user.click(tab(/registration/i));
    selected(/registration/i);

    await user.click(tab(/essential/i));
    selected(/essential/i);
    await user.click(tab(/optional details/i));
    selected(/optional details/i);
    expect(screen.getByRole('button', { name: 'Add Dog' })).toBeInTheDocument();
  });
});
