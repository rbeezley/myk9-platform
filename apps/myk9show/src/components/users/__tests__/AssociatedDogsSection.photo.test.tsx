import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AssociatedDogsSection from '../AssociatedDogsSection';
import type { Dog } from '@/types/dog-types';

// Bypass the real DogCard dropdown; directly expose the photo-edit trigger so
// the test can open the dialog without fighting a UI portal.
vi.mock('../DogCard', () => ({
  default: (props: { dog: Dog; onEditDogPhoto: (id: string) => void }) => (
    <button onClick={() => props.onEditDogPhoto(props.dog.id)}>
      Edit Photo {props.dog.id}
    </button>
  ),
}));

function makeDog(id = 'dog-1'): Dog {
  return { id, ownerId: 'owner-1', callName: 'Rex', name: 'Rex' } as Dog;
}

describe('AssociatedDogsSection — photo upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes a raw File (not a data: URL string) to onUpdateDogPhoto when saving', async () => {
    // ASSERTION-FIRST: this test was written to fail on the buggy code that called
    // onUpdateDogPhoto(dogId, base64DataUrl) and pass after the fix that calls
    // onUpdateDogPhoto(dogId, rawFile).
    const onUpdateDogPhoto = vi.fn().mockResolvedValue(true);

    render(<AssociatedDogsSection dogs={[makeDog()]} onUpdateDogPhoto={onUpdateDogPhoto} />);

    // Open the photo dialog via the mocked DogCard trigger
    fireEvent.click(screen.getByRole('button', { name: 'Edit Photo dog-1' }));

    // Simulate picking a file through the hidden file input inside the dialog
    const file = new File(['fake-bytes'], 'rex.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // FileReader sets the preview asynchronously; wait for Save to become enabled
    const saveButton = await screen.findByRole('button', { name: /save/i });
    await waitFor(() => expect(saveButton).not.toBeDisabled());

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onUpdateDogPhoto).toHaveBeenCalledTimes(1);
    });

    const [calledDogId, calledArg] = onUpdateDogPhoto.mock.calls[0] as [string, unknown];

    // Core assertion: the parent receives a File, not a base64 string.
    expect(calledDogId).toBe('dog-1');
    expect(calledArg).toBeInstanceOf(File);
    // Belt-and-suspenders: explicitly reject the old buggy shape.
    expect(typeof calledArg).not.toBe('string');
  });

  it('closes the dialog on successful save', async () => {
    const onUpdateDogPhoto = vi.fn().mockResolvedValue(true);

    render(<AssociatedDogsSection dogs={[makeDog()]} onUpdateDogPhoto={onUpdateDogPhoto} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Photo dog-1' }));

    const file = new File(['bytes'], 'rex.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    const saveButton = await screen.findByRole('button', { name: /save/i });
    await waitFor(() => expect(saveButton).not.toBeDisabled());
    fireEvent.click(saveButton);

    // Dialog should close after a successful save
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    });
  });

  it('does not call onUpdateDogPhoto when no file has been selected', async () => {
    const onUpdateDogPhoto = vi.fn().mockResolvedValue(true);

    render(<AssociatedDogsSection dogs={[makeDog()]} onUpdateDogPhoto={onUpdateDogPhoto} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit Photo dog-1' }));

    // Save button is disabled when no file is selected — PhotoDialog gates on previewImage
    const saveButton = await screen.findByRole('button', { name: /save/i });
    expect(saveButton).toBeDisabled();
    expect(onUpdateDogPhoto).not.toHaveBeenCalled();
  });
});
