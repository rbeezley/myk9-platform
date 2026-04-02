import { render } from '@/test/utils/testUtils';
import { screen } from '@testing-library/react';
import { DogAvatar } from '../DogAvatar';

describe('DogAvatar', () => {
  it('renders dog photo when imageUrl is provided', () => {
    render(<DogAvatar imageUrl="https://example.com/dog.jpg" name="Luna" size="md" />);
    const img = screen.getByRole('img', { name: 'Luna' });
    expect(img).toHaveAttribute('src', 'https://example.com/dog.jpg');
  });

  it('renders paw print fallback when no image', () => {
    render(<DogAvatar imageUrl={null} name="Rex" size="md" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rex')).toBeInTheDocument();
  });

  it('applies border color class', () => {
    const { container } = render(
      <DogAvatar imageUrl={null} name="Rex" size="md" borderColor="border-amber-400" />
    );
    expect(container.firstChild).toHaveClass('border-amber-400');
  });

  it('renders correct size', () => {
    const { container } = render(<DogAvatar imageUrl={null} name="Rex" size="lg" />);
    expect(container.firstChild).toHaveClass('h-16', 'w-16');
  });
});
