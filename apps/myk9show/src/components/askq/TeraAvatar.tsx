import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

type TeraState = 'idle' | 'working';

const TERA_STATES: TeraState[] = ['idle', 'working'];
const BASE = '/tera';
const FACE_SRC = `${BASE}/tera-face.webp`;

const SOURCES: Record<TeraState, { webm: string; mp4: string; poster: string }> = {
  idle: {
    webm: `${BASE}/tera-idle.webm`,
    mp4: `${BASE}/tera-idle.mp4`,
    poster: `${BASE}/tera-idle-poster.webp`,
  },
  working: {
    webm: `${BASE}/tera-working.webm`,
    mp4: `${BASE}/tera-working.mp4`,
    poster: `${BASE}/tera-working-poster.webp`,
  },
};

interface TeraAvatarProps {
  state: TeraState;
  className?: string;
}

/**
 * Tera, AskQ's animated face. Both loops stay mounted so switching state
 * cross-fades instead of reloading; the hidden loop is paused so only one
 * video decodes at a time. Falls back to the poster, then the static face,
 * if a loop can't load (offline, not cached) — never a broken frame.
 */
export function TeraAvatar({ state, className = '' }: TeraAvatarProps) {
  const reducedMotion = useReducedMotion();
  const idleRef = useRef<HTMLVideoElement>(null);
  const workingRef = useRef<HTMLVideoElement>(null);
  const [loopErrors, setLoopErrors] = useState<Record<TeraState, boolean>>({
    idle: false,
    working: false,
  });
  const [posterErrors, setPosterErrors] = useState<Record<TeraState, boolean>>({
    idle: false,
    working: false,
  });

  useEffect(() => {
    if (reducedMotion) return;
    const showRef = state === 'working' ? workingRef.current : idleRef.current;
    const hideRef = state === 'working' ? idleRef.current : workingRef.current;
    if (showRef) {
      if (state === 'working') showRef.currentTime = 0;
      // jsdom's play() returns undefined instead of a Promise; real browsers
      // can reject the play promise (autoplay blocked) — the poster covers it.
      showRef.play()?.catch(() => {});
    }
    hideRef?.pause();
  }, [state, reducedMotion]);

  const wrapperClassName = [
    'relative inline-flex h-[72px] w-[72px] flex-none overflow-hidden rounded-[22%] bg-white ring-1 ring-border',
    className,
  ].join(' ');

  const showFallback = reducedMotion || loopErrors[state];

  if (showFallback) {
    return (
      <span className={wrapperClassName} aria-hidden="true">
        <img
          src={posterErrors[state] ? FACE_SRC : SOURCES[state].poster}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPosterErrors(prev => ({ ...prev, [state]: true }))}
        />
      </span>
    );
  }

  return (
    <span className={wrapperClassName} aria-hidden="true">
      {TERA_STATES.map(key => (
        <video
          key={key}
          ref={key === 'idle' ? idleRef : workingRef}
          className={[
            'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
            key === 'working' ? 'object-[35%_50%]' : '',
            key === state ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          poster={SOURCES[key].poster}
          muted
          loop
          playsInline
          autoPlay={key === 'idle'}
          preload="auto"
          disablePictureInPicture
          onError={() => setLoopErrors(prev => ({ ...prev, [key]: true }))}
        >
          <source src={SOURCES[key].webm} type="video/webm" />
          <source src={SOURCES[key].mp4} type="video/mp4" />
        </video>
      ))}
    </span>
  );
}

interface TeraFaceProps {
  size?: number;
  className?: string;
}

/** Tera's static face crop, used as the sender mark next to each AskQ answer. */
export function TeraFace({ size = 28, className = '' }: TeraFaceProps) {
  return (
    <img
      data-testid="tera-face"
      src={FACE_SRC}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`flex-none rounded-full bg-white object-cover ring-1 ring-border ${className}`}
    />
  );
}
