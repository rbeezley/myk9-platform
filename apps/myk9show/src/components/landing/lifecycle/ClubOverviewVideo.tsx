import { useEffect, useRef, useState } from 'react';
import './clubOverviewVideo.css';

/** The one minute coming-soon trailer (MYK9-2511), the video this block plays (MYK9-2523). */
const TRAILER_VIDEO_ID = '9V0LV2r5C0M';
const WATCH_URL = `https://youtu.be/${TRAILER_VIDEO_ID}`;
/** The narrated 2 min 28 s club tour, public on YouTube (MYK9-2374); a link under the trailer. */
const TOUR_URL = 'https://youtu.be/bAQBMxBGSkw';
// INTENT: "retyping", never "paperwork" or "paperless" (owner, 2026-11-27, MYK9-2517). A show
// run on myK9Show still has paper: the gate's printed run sheet, and the judge's scoresheets,
// which a judge keeps for a year. What the app removes is typing entries and scores in again.
const TRAILER_VIDEO_TITLE = 'myK9Show: run your trials without the retyping';
// Privacy-enhanced domain, no related videos; it starts as soon as it is loaded because the
// visitor has just pressed play. The trailer has no speech (its words are on screen), so there
// are no captions to turn on.
const EMBED_URL = `https://www.youtube-nocookie.com/embed/${TRAILER_VIDEO_ID}?autoplay=1&rel=0`;

// A poster with a play button, so a first-time visitor's page makes no request to YouTube until
// they ask for the video. "Watch on YouTube" is for anyone whose browser blocks the player.
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
            Run your trials without the retyping.
          </h2>
          <p>
            One minute on what changes: entries come in online, scores go in at the ring, and
            results reach exhibitors on their phones.
          </p>
          <div className="lc-video-links">
            <a className="l-btn-text inline-flex min-h-11 items-center" href={WATCH_URL}>
              Watch on YouTube
            </a>
            <a className="l-btn-text inline-flex min-h-11 items-center" href={TOUR_URL}>
              {/* One span, because the link is a flex row and a flex item drops its edge spaces. */}
              <span>
                Take the club tour <span className="lc-video-long">(2 min 28 s)</span>
              </span>
            </a>
          </div>
        </div>
        <div className="lc-video-frame">
          {playing ? (
            <iframe
              ref={frameRef}
              src={EMBED_URL}
              title={TRAILER_VIDEO_TITLE}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <button
              type="button"
              className="lc-video-play"
              onClick={() => setPlaying(true)}
              aria-label={`Play the video: ${TRAILER_VIDEO_TITLE}`}
            >
              <img
                src="/landing/trailer-poster.jpg"
                width={960}
                height={540}
                alt=""
                loading="lazy"
                decoding="async"
              />
              <span className="lc-video-play-bar" aria-hidden="true">
                <span className="lc-video-play-icon" />
                <span>
                  Play<span className="lc-video-long"> the trailer (1 min)</span>
                </span>
              </span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
