// Integration sketch: swap `askQ` for your existing AskQ call
// (Supabase query + docs retrieval). Everything Tera-specific is marked.
import { useState } from "react";
import TeraAvatar, { TeraFace } from "./TeraAvatar";
import useTeraStatus from "./useTeraStatus";

export default function AskQPanel({ askQ }) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const { status, run, copy } = useTeraStatus();          // Tera
  const busy = status === "working";

  async function send(e) {
    e?.preventDefault();
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    setMessages((m) => [...m, { from: "you", text: q }]);
    try {
      const answer = await run(() => askQ(q));             // Tera: wraps the call
      setMessages((m) => [...m, { from: "tera", text: answer }]);
    } catch {
      setMessages((m) => [...m, { from: "tera", text: "I couldn't reach the show data. Check your connection and ask again.", error: true }]);
    }
  }

  return (
    <section className="askq" aria-label="Ask Tera">
      <header className="askq__head">
        <TeraFace size={32} />
        <h2>Ask Tera</h2>
      </header>

      <ol className="askq__thread" aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={`askq__msg askq__msg--${m.from}`}>
            {m.from === "tera" && <TeraFace />}{/* Tera: she's the sender */}
            <p>{m.text}</p>
          </li>
        ))}
      </ol>

      {/* Tera: the live dock replaces the typing dots */}
      <div className="askq__dock" data-status={status}>
        <TeraAvatar state={status} size={72} />
        <p className="askq__status" role="status">{copy}</p>
      </div>

      <form className="askq__composer" onSubmit={send}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
               placeholder="When does Novice A start?" aria-label="Your question" />
        <button type="submit" disabled={busy || !draft.trim()}>Ask</button>
      </form>
    </section>
  );
}
