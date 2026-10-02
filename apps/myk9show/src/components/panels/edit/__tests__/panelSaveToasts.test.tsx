/**
 * Decision 10: every edit panel confirms a save as "‹Name› saved" and every Add
 * panel as "‹Name› added", through the wrapper. Each panel hands the wrapper its
 * message; this checks the text each one produces.
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { fromAny } from '@total-typescript/shoehorn';
import { ClassEditPanel } from '../ClassEditPanel';
import { ClubEditPanel } from '../ClubEditPanel';
import { DogEditPanel } from '../DogEditPanel';
import LogManualResultPanel from '../LogManualResultPanel';
import { ShowEditPanel } from '../ShowEditPanel';
import { TrialEditPanel } from '../TrialEditPanel';
import { UserEditPanel } from '../UserEditPanel';
import AddRegistrationPanel from '@/components/dogs/DogDetails/Registrations/AddRegistrationPanel';
import EditRegistrationPanel from '@/components/dogs/DogDetails/Registrations/EditRegistrationPanel';

const seen = vi.hoisted(() => ({ message: undefined as unknown }));

vi.mock('../EditPanelWrapper', () => ({
  EditPanelWrapper: (props: { successMessage?: unknown }) => {
    seen.message = props.successMessage;
    return null;
  },
}));
vi.mock('@/features/show-presence/useEditingPresence', () => ({
  useEditingPresence: () => ({ others: [] }),
}));
vi.mock('@/features/show-presence/EditingBadge', () => ({ EditingBadge: () => null }));

function messageFor(element: ReactElement, formData: Record<string, unknown> = {}): string {
  seen.message = undefined;
  render(element);
  const message = seen.message;
  return typeof message === 'function' ? message(formData) : (message as string);
}

const noop = vi.fn();
const base = { open: true, onClose: noop };

describe('save and add toasts, per panel', () => {
  it('Edit Dog: "‹call name› saved"', () => {
    const element = (
      <DogEditPanel
        {...base}
        dogId="d1"
        dogName="Ace"
        initialDogData={fromAny({ callName: 'Ace' })}
      />
    );
    expect(messageFor(element, { callName: 'Ace Jr' })).toBe('Ace Jr saved');
  });

  it('Edit Show: "‹show name› saved"', () => {
    const element = (
      <ShowEditPanel {...base} showId="s1" showName="Spring" initialShowData={fromAny({})} />
    );
    expect(messageFor(element, { name: 'Spring Classic' })).toBe('Spring Classic saved');
  });

  it('Edit Trial: "‹trial› saved"', () => {
    const element = (
      <TrialEditPanel
        {...base}
        trialId="t1"
        trialName="Trial 1 - Sat"
        initialTrialData={fromAny({})}
      />
    );
    expect(messageFor(element)).toBe('Trial 1 - Sat saved');
  });

  it('Edit Class, both modes: "‹class› saved"', () => {
    const full = (
      <ClassEditPanel
        {...base}
        classId="c1"
        className="Container Novice A"
        initialClassData={fromAny({})}
      />
    );
    const simple = (
      <ClassEditPanel
        {...base}
        classId="c1"
        className="Container Novice A"
        mode="simple"
        initialClassData={fromAny({})}
      />
    );
    expect(messageFor(full)).toBe('Container Novice A saved');
    expect(messageFor(simple)).toBe('Container Novice A saved');
  });

  it('Edit Person saves, Add Person adds', () => {
    const edit = (
      <UserEditPanel {...base} userId="p1" userName="Pat Doe" initialUserData={fromAny({})} />
    );
    const create = <UserEditPanel {...base} userId="" userName="" initialUserData={fromAny({})} />;
    const person = { firstName: 'Molly', lastName: 'Mailbox' };
    expect(messageFor(edit, person)).toBe('Molly Mailbox saved');
    expect(messageFor(create, person)).toBe('Molly Mailbox added');
  });

  it('Edit Club saves, Add Club adds', () => {
    const edit = (
      <ClubEditPanel {...base} clubId="c1" clubName="Heartland" initialClubData={fromAny({})} />
    );
    const create = (
      <ClubEditPanel {...base} clubId="" clubName="" mode="create" initialClubData={fromAny({})} />
    );
    expect(messageFor(edit, { name: 'Heartland K9' })).toBe('Heartland K9 saved');
    expect(messageFor(create, { name: 'Heartland K9' })).toBe('Heartland K9 added');
  });

  it('registrations and manual results use a plain noun', () => {
    expect(messageFor(<AddRegistrationPanel {...base} onSave={vi.fn()} />)).toBe(
      'Registration added'
    );
    expect(
      messageFor(<EditRegistrationPanel {...base} onSave={vi.fn()} registration={null} />)
    ).toBe('Registration saved');
    expect(messageFor(<LogManualResultPanel {...base} dogId="d1" ownerId="o1" />)).toBe(
      'Result added'
    );
  });
});
