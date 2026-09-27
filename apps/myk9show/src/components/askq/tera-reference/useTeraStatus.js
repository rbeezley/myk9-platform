import { useCallback, useRef, useState } from "react";

// Keeps the animation honest:
// - working shows for at least MIN_WORKING_MS, so a fast answer doesn't flicker
// - "found" lingers for FOUND_MS, then she settles back to idle
const MIN_WORKING_MS = 900;
const FOUND_MS = 1800;

export const TERA_COPY = {
  idle: "Ask me about classes, run order, or results",
  working: "Sniffing that out for you…",
  found: "Found it!",
  miss: "Couldn't find that one. Try asking another way?",
};

export default function useTeraStatus() {
  const [status, setStatus] = useState("idle"); // idle | working | found | miss
  const timer = useRef();

  /** Wrap your AskQ call: const answer = await run(() => askQ(question)) */
  const run = useCallback(async (task) => {
    clearTimeout(timer.current);
    setStatus("working");
    const started = performance.now();
    let result, error;
    try { result = await task(); } catch (e) { error = e; }

    const wait = MIN_WORKING_MS - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    setStatus(error ? "miss" : "found");
    timer.current = setTimeout(() => setStatus("idle"), FOUND_MS);
    if (error) throw error;
    return result;
  }, []);

  return { status, run, copy: TERA_COPY[status] };
}
