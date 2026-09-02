import { render, screen } from '@/test/utils/testUtils';
import type { Dog } from '@/types/dog-types';
import { BREED_NOT_SET } from '@/types/dog-types';
import { DogsGridView } from '../DogsGridView';

const dog = {
  id: 'dog-1',
  name: 'Champion Goldenworth Max',
  callName: 'Max',
  breed: 'Golden Retriever',
  sex: 'male',
  status: 'active',
  ownerId: 'owner-1',
  ownerName: 'Exhibitor Exhibitor',
  dateOfBirth: '2022-08-22',
  registrations: [
    {
      id: 'reg-1',
      organization: 'AKC',
      breed: 'Golden Retriever',
      registrationNumber: 'DN12345678',
      status: 'Active',
    },
  ],
} as unknown as Dog;

describe('DogsGridView', () => {
  // MYK9-219. The exhibitor's own name on the exhibitor's own dogs was a 14px
  // line on every card, while the dog's breed and age were nowhere.
  it('leaves the owner off the card when the roster is the viewer’s own', () => {
    render(<DogsGridView dogs={[dog]} showOwner={false} />);

    expect(screen.queryByText('Exhibitor Exhibitor')).not.toBeInTheDocument();
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
    expect(screen.getByText(/\d+ yrs? old/)).toBeInTheDocument();
  });

  it('keeps the owner on the card everywhere else', () => {
    render(<DogsGridView dogs={[dog]} showOwner />);

    expect(screen.getByText('Exhibitor Exhibitor')).toBeInTheDocument();
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });

  it('defaults to showing the owner, so an unaware caller loses nothing', () => {
    render(<DogsGridView dogs={[dog]} />);

    expect(screen.getByText('Exhibitor Exhibitor')).toBeInTheDocument();
  });

  it('still renders the dog’s name, badges and registration rows', () => {
    render(<DogsGridView dogs={[dog]} showOwner={false} />);

    expect(screen.getByRole('link', { name: 'Max' })).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('AKC')).toBeInTheDocument();
    expect(screen.getByText('DN12345678')).toBeInTheDocument();
  });

  // Reconciled with OpenSpec `exhibitor-ux-remediation` 2.1/2.2: the card takes
  // breed from the shared formatter, which never substitutes `dogs.breed`.
  it('shows the shared empty state instead of the legacy breed column', () => {
    const unregistered = { ...dog, breed: 'Mixed Breed', registrations: [] } as unknown as Dog;
    render(<DogsGridView dogs={[unregistered]} showOwner={false} />);

    expect(screen.getByText(BREED_NOT_SET)).toBeInTheDocument();
    expect(screen.queryByText('Mixed Breed')).not.toBeInTheDocument();
  });

  it('names each registry’s breed on its row when registries disagree', () => {
    const mixed = {
      ...dog,
      registrations: [
        { id: 'r1', organization: 'AKC', breed: 'All-American Dog', registrationNumber: 'PAL1', status: 'Active' },
        { id: 'r2', organization: 'UKC', breed: 'Mixed Breed', registrationNumber: 'P7', status: 'Active' },
      ],
    } as unknown as Dog;
    render(<DogsGridView dogs={[mixed]} showOwner={false} />);

    expect(screen.getByText('Breed varies by registry')).toBeInTheDocument();
    expect(screen.getByText('All-American Dog')).toBeInTheDocument();
    expect(screen.getByText('Mixed Breed')).toBeInTheDocument();
  });

  it('omits the age line rather than guessing when no date of birth is recorded', () => {
    const undated = { ...dog, dateOfBirth: undefined, birthDate: undefined } as unknown as Dog;
    render(<DogsGridView dogs={[undated]} showOwner={false} />);

    expect(screen.queryByText(/old$/)).not.toBeInTheDocument();
    expect(screen.getByText('Golden Retriever')).toBeInTheDocument();
  });
});
