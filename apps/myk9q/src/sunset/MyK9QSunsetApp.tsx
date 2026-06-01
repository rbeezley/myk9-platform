import './MyK9QSunsetApp.css';
import { buildMyK9ShowRedirectUrl } from './sunsetConfig';

export function MyK9QSunsetApp() {
  const targetUrl = buildMyK9ShowRedirectUrl(window.location.search);

  return (
    <main className="myk9q-sunset" aria-labelledby="myk9q-sunset-title">
      <section className="myk9q-sunset__panel">
        <p className="myk9q-sunset__brand">myK9Show</p>
        <h1 id="myk9q-sunset-title">myK9Q has moved into myK9Show.</h1>
        <p className="myk9q-sunset__lead">
          Use the same show passcode in myK9Show. Your show-day tools, messages, and
          ringside view now live together there.
        </p>
        <div className="myk9q-sunset__actions">
          <a className="myk9q-sunset__button" href={targetUrl} rel="noopener noreferrer">
            Open myK9Show
          </a>
        </div>
        <p className="myk9q-sunset__note">
          If you had myK9Q installed, allow notifications again in myK9Show and replace
          the old shortcut after myK9Show is installed.
        </p>
      </section>
    </main>
  );
}
