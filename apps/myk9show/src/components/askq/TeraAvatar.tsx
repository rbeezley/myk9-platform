import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';

export type TeraState = 'idle' | 'working' | 'found-it' | 'napping';

interface TeraStateEntry {
  id: TeraState;
  /** False for a one-shot: it plays once and reports `onEnded`. */
  loop: boolean;
  /**
   * The state this one most likely hands to. It is mounted (paused, hidden)
   * beside the active loop so the switch cross-fades instead of loading;
   * nothing else is mounted, so a new state never costs a download until used.
   */
  next?: TeraState;
  /** Extra object-position for a clip framed off-centre. */
  objectPosition?: string;
}

/** Every Tera state: a new one is one entry here plus its files in /public/tera. */
export const TERA_STATES: readonly TeraStateEntry[] = [
  // The dock: idle while online, napping while offline (MYK9-851).
  { id: 'idle', loop: true, next: 'napping' },
  { id: 'working', loop: true, objectPosition: 'object-[35%_50%]' },
  // The answer mark plays this once when an answer finishes, then shows the face.
  { id: 'found-it', loop: false },
  { id: 'napping', loop: true, next: 'idle' },
];

const BASE = '/tera';
const FACE_SRC = `${BASE}/tera-face.webp`;

function teraSources(id: TeraState) {
  return {
    webm: `${BASE}/tera-${id}.webm`,
    mp4: `${BASE}/tera-${id}.mp4`,
    poster: `${BASE}/tera-${id}-poster.webp`,
  };
}

function teraEntry(id: TeraState): TeraStateEntry {
  return TERA_STATES.find(entry => entry.id === id) ?? TERA_STATES[0]!;
}

interface TeraAvatarProps {
  state: TeraState;
  /** Tile size in px; the dock is 72, the answer mark smaller. */
  size?: number;
  /** A one-shot state (Found it) calls this when it finishes or cannot play. */
  onEnded?: () => void;
  className?: string;
}

/**
 * Tera, AskQ's animated face. Only the active loop and its next likely state
 * are mounted, so switching between them cross-fades instead of reloading; the
 * hidden one is paused so only one video decodes at a time. Falls back to the
 * poster, then the static face, if a loop can't load (offline, not cached) —
 * never a broken frame.
 */
export function TeraAvatar({ state, size = 72, onEnded, className = '' }: TeraAvatarProps) {
  const reducedMotion = useReducedMotion();
  const videoRefs = useRef<Partial<Record<TeraState, HTMLVideoElement | null>>>({});
  const [loopErrors, setLoopErrors] = useState<Partial<Record<TeraState, boolean>>>({});
  const [posterErrors, setPosterErrors] = useState<Partial<Record<TeraState, boolean>>>({});
  const active = teraEntry(state);
  // Keep a state mounted once shown, so switching back does not reload it.
  const [mounted, setMounted] = useState<TeraState[]>(() =>
    active.next ? [state, active.next] : [state]
  );
  const wanted = active.next ? [state, active.next] : [state];
  if (wanted.some(id => !mounted.includes(id))) {
    setMounted(previous => [...previous, ...wanted.filter(id => !previous.includes(id))]);
  }

  // `onEnded` is a notification, not an input: a new callback identity must
  // not re-run the play effect and restart a one-shot.
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (reducedMotion) return;
    for (const [id, video] of Object.entries(videoRefs.current)) {
      if (!video) continue;
      if (id === state) {
        if (state === 'working' || !active.loop) video.currentTime = 0;
        // jsdom's play() returns undefined instead of a Promise; real browsers
        // can reject the play promise (autoplay blocked) — the poster covers it.
        const played = video.play();
        played?.catch(() => {
          if (!active.loop) onEndedRef.current?.();
        });
      } else {
        video.pause();
      }
    }
  }, [state, reducedMotion, active.loop]);

  const wrapperClassName = [
    'relative inline-flex flex-none overflow-hidden rounded-[22%] bg-white ring-1 ring-border',
    className,
  ].join(' ');
  const wrapperStyle = { width: size, height: size };

  const showFallback = reducedMotion || loopErrors[state];

  if (showFallback) {
    return (
      <span className={wrapperClassName} style={wrapperStyle} aria-hidden="true">
        <img
          src={posterErrors[state] ? FACE_SRC : teraSources(state).poster}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setPosterErrors(prev => ({ ...prev, [state]: true }))}
        />
      </span>
    );
  }

  return (
    <span className={wrapperClassName} style={wrapperStyle} aria-hidden="true">
      {mounted.map(id => {
        const entry = teraEntry(id);
        const sources = teraSources(id);
        return (
          <video
            key={id}
            ref={element => {
              videoRefs.current[id] = element;
            }}
            className={[
              'absolute inset-0 h-full w-full object-cover transition-opacity duration-150',
              entry.objectPosition ?? '',
              id === state ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
            poster={sources.poster}
            muted
            loop={entry.loop}
            playsInline
            autoPlay={id === state}
            preload="auto"
            disablePictureInPicture
            onEnded={id === state && !entry.loop ? onEnded : undefined}
            onError={() => {
              setLoopErrors(prev => ({ ...prev, [id]: true }));
              if (id === state && !entry.loop) onEnded?.();
            }}
          >
            <source src={sources.webm} type="video/webm" />
            <source src={sources.mp4} type="video/mp4" />
          </video>
        );
      })}
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
