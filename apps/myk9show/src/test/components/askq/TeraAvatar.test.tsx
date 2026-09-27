// apps/myk9show/src/test/components/askq/TeraAvatar.test.tsx
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { TeraAvatar, TeraFace } from '@/components/askq/TeraAvatar';

interface FakeMql {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

function mockMatchMedia(initialMatches: boolean): FakeMql {
  const mql: FakeMql = {
    matches: initialMatches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return mql;
}

describe('TeraAvatar', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it('renders the working loop as a video when motion is allowed', () => {
    const { container } = render(<TeraAvatar state="working" />);
    expect(container.querySelectorAll('video')).toHaveLength(2);
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('renders the poster image instead of video when reduced motion is requested', () => {
    mockMatchMedia(true);
    const { container } = render(<TeraAvatar state="idle" />);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    const poster = container.querySelector('img');
    expect(poster).toBeInTheDocument();
    expect(poster).toHaveAttribute('src', '/tera/tera-idle-poster.webp');
  });

  it('falls back to the poster image when the active loop fails to load', () => {
    const { container } = render(<TeraAvatar state="working" />);
    const workingVideo = container.querySelector('video.opacity-100') as HTMLVideoElement;
    fireEvent.error(workingVideo);

    expect(container.querySelector('video')).not.toBeInTheDocument();
    const poster = container.querySelector('img');
    expect(poster).toHaveAttribute('src', '/tera/tera-working-poster.webp');
  });

  it('falls back to the static face when both the loop and the poster fail', () => {
    const { container } = render(<TeraAvatar state="working" />);
    const workingVideo = container.querySelector('video.opacity-100') as HTMLVideoElement;
    fireEvent.error(workingVideo);

    const poster = container.querySelector('img') as HTMLImageElement;
    fireEvent.error(poster);

    expect(container.querySelector('img')).toHaveAttribute('src', '/tera/tera-face.webp');
  });

  it('keeps the visible active loop when only the hidden loop errors', () => {
    const { container } = render(<TeraAvatar state="idle" />);
    const hiddenWorkingVideo = container.querySelector('video.opacity-0') as HTMLVideoElement;
    fireEvent.error(hiddenWorkingVideo);
    // The hidden loop's failure doesn't touch the active (idle) one.
    expect(container.querySelector('video.opacity-100')).toBeInTheDocument();
  });
});

describe('TeraFace', () => {
  it('renders as a decorative image with no alt text', () => {
    render(<TeraFace />);
    const face = screen.getByTestId('tera-face');
    expect(face).toHaveAttribute('alt', '');
    expect(face).toHaveAttribute('src', '/tera/tera-face.webp');
  });
});
