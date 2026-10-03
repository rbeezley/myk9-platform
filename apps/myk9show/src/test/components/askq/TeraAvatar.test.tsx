// apps/myk9show/src/test/components/askq/TeraAvatar.test.tsx
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { TERA_STATES, TeraAvatar, TeraFace } from '@/components/askq/TeraAvatar';

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

function videoSources(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('video source[type="video/webm"]')).map(
    source => source.getAttribute('src') ?? ''
  );
}

describe('TeraAvatar', () => {
  beforeEach(() => {
    mockMatchMedia(false);
  });

  it('renders the working loop as a video when motion is allowed', () => {
    const { container } = render(<TeraAvatar state="working" />);
    expect(container.querySelector('video.opacity-100 source')).toHaveAttribute(
      'src',
      '/tera/tera-working.webm'
    );
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });

  it('holds every state as one list entry with its own assets', () => {
    expect(TERA_STATES.map(entry => entry.id)).toEqual(['idle', 'working', 'found-it', 'napping']);
  });

  // MYK9-851: with four states, mounting every loop would download them all.
  it('mounts only the active loop and its next likely state, never every loop', () => {
    const idle = render(<TeraAvatar state="idle" />);
    expect(videoSources(idle.container)).toEqual([
      '/tera/tera-idle.webm',
      '/tera/tera-napping.webm',
    ]);
    idle.unmount();

    const working = render(<TeraAvatar state="working" />);
    expect(videoSources(working.container)).toEqual(['/tera/tera-working.webm']);
    working.unmount();

    const napping = render(<TeraAvatar state="napping" />);
    expect(videoSources(napping.container)).toEqual([
      '/tera/tera-napping.webm',
      '/tera/tera-idle.webm',
    ]);
  });

  it('cross-fades to the next likely state without remounting it', () => {
    const { container, rerender } = render(<TeraAvatar state="idle" />);
    const napping = container.querySelector(
      'video:has(source[src="/tera/tera-napping.webm"])'
    ) as HTMLVideoElement;
    expect(napping).toHaveClass('opacity-0');

    rerender(<TeraAvatar state="napping" />);
    expect(container.querySelector('video:has(source[src="/tera/tera-napping.webm"])')).toBe(
      napping
    );
    expect(napping).toHaveClass('opacity-100');
  });

  it('plays Found it once (no loop) and reports when it ends', () => {
    const onEnded = vi.fn();
    const { container } = render(<TeraAvatar state="found-it" onEnded={onEnded} />);
    const video = container.querySelector('video') as HTMLVideoElement;
    expect(video).not.toHaveAttribute('loop');

    fireEvent.ended(video);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('reports a one-shot as ended when its video cannot load, so it never sticks', () => {
    const onEnded = vi.fn();
    const { container } = render(<TeraAvatar state="found-it" onEnded={onEnded} />);
    fireEvent.error(container.querySelector('video') as HTMLVideoElement);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('renders the poster image instead of video when reduced motion is requested', () => {
    mockMatchMedia(true);
    const { container } = render(<TeraAvatar state="idle" />);
    expect(container.querySelector('video')).not.toBeInTheDocument();
    const poster = container.querySelector('img');
    expect(poster).toBeInTheDocument();
    expect(poster).toHaveAttribute('src', '/tera/tera-idle-poster.webp');
  });

  it('takes a size, so the answer mark can be smaller than the dock', () => {
    const { container } = render(<TeraAvatar state="found-it" size={40} />);
    expect(container.firstElementChild).toHaveStyle({ width: '40px', height: '40px' });
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
    const hiddenNappingVideo = container.querySelector('video.opacity-0') as HTMLVideoElement;
    fireEvent.error(hiddenNappingVideo);
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
