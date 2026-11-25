import { useEffect, useRef, useState } from 'react';
import './clubOverviewVideo.css';

/** The unlisted "Run your trials without the paperwork" overview (MYK9-2374). */
export const CLUB_OVERVIEW_VIDEO_ID = 'bAQBMxBGSkw';
export const CLUB_OVERVIEW_VIDEO_TITLE =
  'myK9Show for clubs: run your trials without the paperwork';
const WATCH_URL = `https://youtu.be/${CLUB_OVERVIEW_VIDEO_ID}`;
// Privacy-enhanced domain, captions on, no related videos; it starts as soon as it is loaded
// because the visitor has just pressed play.
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${CLUB_OVERVIEW_VIDEO_ID}?autoplay=1&cc_load_policy=1&rel=0`;

// A poster with a play button, so a first-time visitor's page makes no request to YouTube until
// they ask for the video. The link under it is for anyone whose browser blocks the player.
export function ClubOverviewVideo() {
  const [playing, setPlaying] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The play button goes away when pressed, so focus follows the visitor into the player.
  useEffect(() => {
    if (playing) frameRef.current?.focus();
  }, [playing]);
  return (
    <section className="lc-video" id="club-video" aria-labelledby="club-video-title">
      <div className="l-container lc-video-inner">
        <div className="lc-video-copy">
          <span className="l-eyebrow">For clubs</span>
          <h2 id="club-video-title" className="l-h2">
            Run your trials without the paperwork.
          </h2>
          <p>
            A 2 minute 28 second tour: add your club, appoint your secretary, take entries and
            payments online, run show day, and get paid.
          </p>
          <a className="l-btn-text inline-flex min-h-11 items-center" href={WATCH_URL}>
            Watch on YouTube
          </a>
        </div>
        <div className="lc-video-frame">
          {playing ? (
            <iframe
              ref={frameRef}
              tabIndex={-1}
              src={EMBED_URL}
              title={CLUB_OVERVIEW_VIDEO_TITLE}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className="lc-video-play"
              onClick={() => setPlaying(true)}
              aria-label={`Play the video: ${CLUB_OVERVIEW_VIDEO_TITLE}`}
            >
              <img
                src="/landing/club-overview-poster.jpg"
                width={960}
                height={540}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span className="lc-video-play-bar" aria-hidden="true">
                <span className="lc-video-play-icon" />
                Play the video (2 min 28 s)
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
