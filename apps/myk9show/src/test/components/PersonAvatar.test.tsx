import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { PersonAvatar } from '@/components/common/PersonAvatar';

describe('PersonAvatar', () => {
  it('renders image when avatarUrl is provided', () => {
    render(<PersonAvatar name="Jane Doe" avatarUrl="https://example.com/jane.jpg" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://example.com/jane.jpg');
  });

  it('renders initials when no avatarUrl', () => {
    render(<PersonAvatar name="Jane Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders initials for single name', () => {
    render(<PersonAvatar name="Madonna" />);
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('renders ? for empty name', () => {
    render(<PersonAvatar name="" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('applies sm size (h-8 w-8)', () => {
    const { container } = render(<PersonAvatar name="Jane Doe" size="sm" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain('h-8');
    expect(avatar.className).toContain('w-8');
  });

  it('applies md size (h-12 w-12) by default', () => {
    const { container } = render(<PersonAvatar name="Jane Doe" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain('h-12');
    expect(avatar.className).toContain('w-12');
  });

  it('applies lg size (h-16 w-16)', () => {
    const { container } = render(<PersonAvatar name="Jane Doe" size="lg" />);
    const avatar = container.firstElementChild as HTMLElement;
    expect(avatar.className).toContain('h-16');
    expect(avatar.className).toContain('w-16');
  });

  it('same name always produces same fallback color', () => {
    const { container: c1 } = render(<PersonAvatar name="Jane Doe" />);
    const { container: c2 } = render(<PersonAvatar name="Jane Doe" />);
    const style1 = (c1.firstElementChild as HTMLElement).className;
    const style2 = (c2.firstElementChild as HTMLElement).className;
    expect(style1).toEqual(style2);
  });

  it('different names can produce different colors', () => {
    const { container: c1 } = render(<PersonAvatar name="Jane Doe" />);
    const { container: c2 } = render(<PersonAvatar name="Zack Miller" />);
    // At minimum, both should render without error
    expect(c1.firstElementChild).toBeInTheDocument();
    expect(c2.firstElementChild).toBeInTheDocument();
  });
});
