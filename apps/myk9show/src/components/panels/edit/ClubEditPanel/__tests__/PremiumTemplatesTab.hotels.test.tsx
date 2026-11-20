import { fireEvent, render, screen, waitFor } from '@/test/utils/testUtils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClubPremiumTemplate } from '@/types/premium-types';
import { PremiumTemplatesTab } from '../PremiumTemplatesTab';

const createMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const templatesRef = vi.hoisted(() => ({ current: [] as unknown[] }));

vi.mock('@/hooks/queries/usePremiumTemplates', () => ({
  useClubPremiumTemplates: () => ({ data: templatesRef.current, isLoading: false }),
  useCreatePremiumTemplate: () => ({ mutateAsync: createMock, isPending: false, isError: false }),
  useUpdatePremiumTemplate: () => ({ mutateAsync: updateMock, isPending: false, isError: false }),
  useDeletePremiumTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/queries/usePremiumGenerations', () => ({
  useRecentPremiumGenerations: () => ({ data: [] }),
}));

const template: ClubPremiumTemplate = {
  id: 'tpl-1',
  clubId: 'club-1',
  name: 'Scent Work',
  trialType: null,
  isDefault: true,
  style: 'monogram',
  vetClinicName: null,
  vetClinicAddress: null,
  vetClinicPhone: null,
  accommodations: [
    { name: 'Lakeside Inn', address: '1 Lake Rd', phone: '555-0100' },
    { name: 'Motel Six', address: '2 Hwy', phone: '555-0200' },
  ],
  coverImageUrl: null,
  hospitalityNotes: null,
  awardsDescription: null,
  additionalNotes: null,
  limitedMobilityNotes: null,
  rvHookupNotes: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function type(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('PremiumTemplatesTab hotels', () => {
  afterEach(() => {
    createMock.mockReset();
    updateMock.mockReset();
    templatesRef.current = [];
  });

  it('edits a stored hotel, adds one, and saves the list', async () => {
    templatesRef.current = [template];
    updateMock.mockResolvedValue(undefined);
    render(<PremiumTemplatesTab clubId="club-1" onClose={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Hotel 1 name')).toHaveValue('Lakeside Inn');
    type('Hotel 2 phone', '555-0299');

    fireEvent.click(screen.getByRole('button', { name: /Add hotel/ }));
    type('Hotel 3 name', ' Ridge Lodge ');
    type('Hotel 3 address', '3 Ridge Way');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: 'tpl-1',
        updates: expect.objectContaining({
          accommodations: [
            { name: 'Lakeside Inn', address: '1 Lake Rd', phone: '555-0100' },
            { name: 'Motel Six', address: '2 Hwy', phone: '555-0299' },
            { name: 'Ridge Lodge', address: '3 Ridge Way', phone: '' },
          ],
        }),
      })
    );
  });

  it('removes one hotel and keeps the rest in order', async () => {
    templatesRef.current = [template];
    updateMock.mockResolvedValue(undefined);
    render(<PremiumTemplatesTab clubId="club-1" onClose={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove hotel 1/ }));
    expect(screen.getByLabelText('Hotel 1 name')).toHaveValue('Motel Six');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: 'tpl-1',
        updates: expect.objectContaining({
          accommodations: [{ name: 'Motel Six', address: '2 Hwy', phone: '555-0200' }],
        }),
      })
    );
  });

  it('saves an empty list when every hotel is removed', async () => {
    templatesRef.current = [template];
    updateMock.mockResolvedValue(undefined);
    render(<PremiumTemplatesTab clubId="club-1" onClose={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove hotel 2/ }));
    fireEvent.click(screen.getByRole('button', { name: /Remove hotel 1/ }));
    expect(screen.getByText(/No hotels yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: 'tpl-1',
        updates: expect.objectContaining({ accommodations: [] }),
      })
    );
  });

  it('saves a stored hotel that is missing fields, and cleans its stored link', async () => {
    // Stored accommodations are free-form jsonb; an older row may lack fields.
    templatesRef.current = [
      {
        ...template,
        accommodations: [
          { name: 'Inn', url: 'inn.example.com' },
          { name: 'Motel', address: null, phone: '555-0300', url: 'javascript:alert(1)' },
        ] as unknown as ClubPremiumTemplate['accommodations'],
      },
    ];
    updateMock.mockResolvedValue(undefined);
    render(<PremiumTemplatesTab clubId="club-1" onClose={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Hotel 1 address')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: 'tpl-1',
        updates: expect.objectContaining({
          accommodations: [
            { name: 'Inn', address: '', phone: '', url: 'https://inn.example.com/' },
            { name: 'Motel', address: '', phone: '555-0300' },
          ],
        }),
      })
    );
  });

  it('creates a template with a hotel and drops a hotel left blank', async () => {
    createMock.mockResolvedValue(undefined);
    render(<PremiumTemplatesTab clubId="club-1" onClose={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: /New Template/ }));
    // The template name is the first field; its label is not tied to the input.
    fireEvent.change(screen.getAllByPlaceholderText('Scent Work')[0], {
      target: { value: 'Rally' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add hotel/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add hotel/ }));
    type('Hotel 1 name', 'Lakeside Inn');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Rally',
          accommodations: [{ name: 'Lakeside Inn', address: '', phone: '' }],
        })
      )
    );
  });

  it('saves the limited-mobility and RV notes entered on the template', async () => {
    templatesRef.current = [template];
    updateMock.mockResolvedValue(undefined);
    render(<PremiumTemplatesTab clubId="club-1" onClose={undefined} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    type('Limited mobility access (ASCA)', 'Gravel lot, 200 ft to the ring');
    type('RV hook-ups (ASCA, optional)', '30 amp, 10 sites');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateMock).toHaveBeenCalledWith({
        id: 'tpl-1',
        updates: expect.objectContaining({
          limitedMobilityNotes: 'Gravel lot, 200 ft to the ring',
          rvHookupNotes: '30 amp, 10 sites',
        }),
      })
    );
  });
});
