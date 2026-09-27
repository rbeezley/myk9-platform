import { useEffect, useRef, useState } from "react";
import "./tera.css";

// Put the files from /assets in your public/ folder (e.g. public/tera/).
const BASE = "/tera";
const SRC = {
  idle:    { webm: `${BASE}/tera-idle.webm`,    mp4: `${BASE}/tera-idle.mp4`,    poster: `${BASE}/tera-idle-poster.webp` },
  working: { webm: `${BASE}/tera-working.webm`, mp4: `${BASE}/tera-working.mp4`, poster: `${BASE}/tera-working-poster.webp` },
};

function usePrefersReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(query).matches
  );
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = (e) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Tera, live. Both loops are mounted and preloaded; switching state just
 * cross-fades which one is visible, so there's no load flash.
 * The hidden loop is paused so only one video decodes at a time.
 *
 * state: "idle" | "working"   ("found" renders as idle)
 */
export default function TeraAvatar({ state = "idle", size = 72, className = "" }) {
  const reduced = usePrefersReducedMotion();
  const idleRef = useRef(null);
  const workRef = useRef(null);
  const active = state === "working" ? "working" : "idle";

  useEffect(() => {
    if (reduced) return;
    const show = active === "working" ? workRef.current : idleRef.current;
    const hide = active === "working" ? idleRef.current : workRef.current;
    if (show) {
      if (active === "working") show.currentTime = 0; // start "thinking" from the top
      show.play().catch(() => {}); // autoplay can reject; the poster covers it
    }
    hide?.pause();
  }, [active, reduced]);

  const style = { width: size, height: size };

  if (reduced) {
    return (
      <span className={`tera ${className}`} style={style} role="img"
            aria-label={active === "working" ? "Tera is looking that up" : "Tera"}>
        <img src={SRC[active].poster} alt="" width={size} height={size} />
      </span>
    );
  }

  return (
    <span className={`tera ${className}`} style={style} data-state={active} role="img"
          aria-label={active === "working" ? "Tera is looking that up" : "Tera"}>
      {["idle", "working"].map((key) => (
        <video
          key={key}
          ref={key === "idle" ? idleRef : workRef}
          className={`tera__loop tera__loop--${key}`}
          data-visible={key === active}
          poster={SRC[key].poster}
          muted
          loop
          playsInline
          autoPlay={key === "idle"}
          preload="auto"
          disablePictureInPicture
          aria-hidden="true"
        >
          <source src={SRC[key].webm} type="video/webm" />
          <source src={SRC[key].mp4} type="video/mp4" />
        </video>
      ))}
    </span>
  );
}

/** Static face for stamping on each answer. Cheap: one 2 KB image. */
export function TeraFace({ size = 28 }) {
  return <img className="tera-face" src={`${BASE}/tera-face.webp`} alt="Tera"
              width={size} height={size} />;
}
