import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CoverImageUpload } from '../cover-image-upload';

describe('CoverImageUpload', () => {
  it('renders children as-is when not editable', () => {
    render(
      <CoverImageUpload editable={false} onUpload={vi.fn()} onRemove={vi.fn()}>
        <div data-testid="cover-content">Cover</div>
      </CoverImageUpload>
    );
    expect(screen.getByTestId('cover-content')).toBeInTheDocument();
    expect(screen.queryByText(/change cover/i)).not.toBeInTheDocument();
  });

  it('shows hover overlay with "Change Cover" when editable', () => {
    render(
      <CoverImageUpload editable onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>
    );
    expect(screen.getByLabelText(/change cover/i)).toBeInTheDocument();
  });

  it('shows "Remove Cover" option when hasCover is true', () => {
    render(
      <CoverImageUpload editable hasCover onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>
    );
    expect(screen.getByLabelText(/remove cover/i)).toBeInTheDocument();
  });

  it('does not show "Remove Cover" when hasCover is false', () => {
    render(
      <CoverImageUpload editable hasCover={false} onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>
    );
    expect(screen.queryByLabelText(/remove cover/i)).not.toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', async () => {
    const onRemove = vi.fn();
    render(
      <CoverImageUpload editable hasCover onUpload={vi.fn()} onRemove={onRemove}>
        <div>Cover</div>
      </CoverImageUpload>
    );
    await userEvent.click(screen.getByLabelText(/remove cover/i));
    expect(onRemove).toHaveBeenCalled();
  });

  it('shows uploading state', () => {
    render(
      <CoverImageUpload editable isUploading onUpload={vi.fn()} onRemove={vi.fn()}>
        <div>Cover</div>
      </CoverImageUpload>
    );
    expect(screen.getByText(/uploading/i)).toBeInTheDocument();
  });
});
